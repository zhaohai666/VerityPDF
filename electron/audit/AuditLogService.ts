/**
 * AuditLogService - 安全审计日志服务
 *
 * 等保三级合规审计日志：
 * - SQLite 本地存储
 * - SM3 哈希链完整性校验（每条记录的 hash = SM3(内容 + 前一条 hash)）
 * - 防篡改检测
 * - 关键操作记录：打开/保存/签名/加密/导出/删除等
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { SmCryptoService } from '../crypto/SmCryptoService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'document.open'
  | 'document.save'
  | 'document.export'
  | 'document.print'
  | 'document.close'
  | 'document.delete'
  | 'signature.sign'
  | 'signature.verify'
  | 'signature.pades'
  | 'signature.pades_verify'
  | 'encryption.encrypt'
  | 'encryption.decrypt'
  | 'encryption.remove'
  | 'redaction.apply'
  | 'redaction.sensitive_detect'
  | 'permission.change'
  | 'user.login'
  | 'user.logout'
  | 'system.startup'
  | 'system.shutdown'
  | 'config.change'
  | 'api.access'
  | 'collab.join'
  | 'collab.leave'
  | 'font.register'
  | 'pdfa.convert'
  | 'pdfa.validate';

export type AuditLevel = 'info' | 'warn' | 'error' | 'critical';

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action: AuditAction;
  level: AuditLevel;
  userId: string;
  resourceId: string;
  details: string;
  clientIp: string;
  sessionId: string;
  /** SM3 哈希值 = SM3(本条内容 + 前一条 hash) */
  hash: string;
  /** 前一条记录的 hash（用于链式验证） */
  prevHash: string;
}

export interface AuditLogQuery {
  action?: AuditAction;
  level?: AuditLevel;
  userId?: string;
  resourceId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface IntegrityCheckResult {
  valid: boolean;
  totalRecords: number;
  brokenAt: number | null;
  brokenHash: string | null;
  expectedHash: string | null;
  message: string;
}

export interface AuditLogStats {
  totalRecords: number;
  byAction: Record<string, number>;
  byLevel: Record<string, number>;
  earliestTimestamp: string | null;
  latestTimestamp: string | null;
  integrityValid: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class AuditLogService {
  private db: Database.Database | null = null;
  private dbPath: string;
  private smCrypto: SmCryptoService;
  private initialized = false;

  constructor(smCrypto?: SmCryptoService) {
    this.dbPath = this.resolveDbPath();
    this.smCrypto = smCrypto || new SmCryptoService();
  }

  /** 解析数据库路径 */
  private resolveDbPath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'audit-log.db');
  }

  /** 初始化数据库和表结构 */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提升并发性能
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL'); // 等保三级要求：完整同步
    this.db.pragma('foreign_keys = ON');

    // 创建审计日志表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        action      TEXT    NOT NULL,
        level       TEXT    NOT NULL DEFAULT 'info',
        user_id     TEXT    NOT NULL DEFAULT 'system',
        resource_id TEXT    NOT NULL DEFAULT '',
        details     TEXT    NOT NULL DEFAULT '',
        client_ip   TEXT    NOT NULL DEFAULT '',
        session_id  TEXT    NOT NULL DEFAULT '',
        hash        TEXT    NOT NULL,
        prev_hash   TEXT    NOT NULL,
        UNIQUE(hash)
      );
    `);

    // 创建索引加速查询
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_audit_level     ON audit_log(level);
      CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_resource  ON audit_log(resource_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    `);

    // 创建防篡改触发器：禁止 UPDATE 和 DELETE
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS prevent_audit_update
      BEFORE UPDATE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, '审计日志禁止修改');
      END;

      CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
      BEFORE DELETE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, '审计日志禁止删除');
      END;
    `);

    this.initialized = true;
  }

  /** 确保已初始化 */
  private ensureInit(): void {
    if (!this.initialized || !this.db) {
      throw new Error('AuditLogService 未初始化，请先调用 initialize()');
    }
  }

  /**
   * 计算记录的 SM3 哈希值
   * hash = SM3(id + timestamp + action + level + userId + resourceId + details + prevHash)
   */
  private async computeHash(entry: Omit<AuditLogEntry, 'hash'>): Promise<string> {
    const content = [
      entry.id || 0,
      entry.timestamp,
      entry.action,
      entry.level,
      entry.userId,
      entry.resourceId,
      entry.details,
      entry.prevHash,
    ].join('|');

    return this.smCrypto.sm3.hash(Buffer.from(content, 'utf-8'));
  }

  /**
   * 获取最后一条记录的 hash
   */
  private getLastHash(): string {
    this.ensureInit();
    const row = this.db!.prepare(
      'SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1',
    ).get() as { hash: string } | undefined;
    return row?.hash || GENESIS_HASH;
  }

  /**
   * 记录审计日志
   */
  async log(
    action: AuditAction,
    options: {
      level?: AuditLevel;
      userId?: string;
      resourceId?: string;
      details?: string;
      clientIp?: string;
      sessionId?: string;
    } = {},
  ): Promise<AuditLogEntry> {
    this.ensureInit();

    const {
      level = 'info',
      userId = 'system',
      resourceId = '',
      details = '',
      clientIp = '',
      sessionId = '',
    } = options;

    const timestamp = new Date().toISOString();
    const prevHash = this.getLastHash();

    // 插入记录（先不包含 hash，获取自增 ID 后再计算 hash 并更新）
    const insertStmt = this.db!.prepare(`
      INSERT INTO audit_log (timestamp, action, level, user_id, resource_id, details, client_ip, session_id, hash, prev_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 临时 hash 用于插入
    const tempHash = `temp_${Date.now()}`;
    const result = insertStmt.run(
      timestamp, action, level, userId, resourceId, details, clientIp, sessionId, tempHash, prevHash,
    );

    const id = Number(result.lastInsertRowid);

    // 计算真实 SM3 hash
    const realHash = await this.computeHash({
      id,
      timestamp,
      action,
      level,
      userId,
      resourceId,
      details,
      clientIp,
      sessionId,
      prevHash,
    });

    // 使用底层 prepare 绕过触发器更新 hash
    // 注意：触发器阻止 UPDATE，但我们需要更新 hash 字段
    // 使用特殊方法：先删除触发器，更新 hash，再重建触发器
    this.db!.exec('DROP TRIGGER IF EXISTS prevent_audit_update');
    this.db!.prepare('UPDATE audit_log SET hash = ? WHERE id = ?').run(realHash, id);
    this.db!.exec(`
      CREATE TRIGGER IF NOT EXISTS prevent_audit_update
      BEFORE UPDATE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, '审计日志禁止修改');
      END;
    `);

    return {
      id,
      timestamp,
      action,
      level,
      userId,
      resourceId,
      details,
      clientIp,
      sessionId,
      hash: realHash,
      prevHash,
    };
  }

  /**
   * 查询审计日志
   */
  query(query: AuditLogQuery = {}): AuditLogEntry[] {
    this.ensureInit();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.action) {
      conditions.push('action = ?');
      params.push(query.action);
    }
    if (query.level) {
      conditions.push('level = ?');
      params.push(query.level);
    }
    if (query.userId) {
      conditions.push('user_id = ?');
      params.push(query.userId);
    }
    if (query.resourceId) {
      conditions.push('resource_id = ?');
      params.push(query.resourceId);
    }
    if (query.startTime) {
      conditions.push('timestamp >= ?');
      params.push(query.startTime);
    }
    if (query.endTime) {
      conditions.push('timestamp <= ?');
      params.push(query.endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit || 100;
    const offset = query.offset || 0;

    const sql = `SELECT * FROM audit_log ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const rows = this.db!.prepare(sql).all(...params, limit, offset) as AuditLogEntry[];

    return rows;
  }

  /**
   * 验证完整性哈希链
   *
   * 遍历所有记录，重新计算每条记录的 SM3 hash，
   * 与存储的 hash 比对，检测任何篡改。
   */
  async verifyIntegrity(): Promise<IntegrityCheckResult> {
    this.ensureInit();

    const rows = this.db!.prepare(
      'SELECT id, timestamp, action, level, user_id, resource_id, details, client_ip, session_id, hash, prev_hash FROM audit_log ORDER BY id ASC',
    ).all() as AuditLogEntry[];

    if (rows.length === 0) {
      return {
        valid: true,
        totalRecords: 0,
        brokenAt: null,
        brokenHash: null,
        expectedHash: null,
        message: '审计日志为空，完整性校验通过',
      };
    }

    let prevHash = GENESIS_HASH;

    for (const row of rows) {
      // 验证 prev_hash 链接
      if (row.prevHash !== prevHash) {
        return {
          valid: false,
          totalRecords: rows.length,
          brokenAt: row.id,
          brokenHash: row.prevHash,
          expectedHash: prevHash,
          message: `记录 #${row.id} 的 prevHash 不匹配：存储=${row.prevHash}，期望=${prevHash}`,
        };
      }

      // 重新计算 hash
      const computedHash = await this.computeHash({
        id: row.id,
        timestamp: row.timestamp,
        action: row.action,
        level: row.level,
        userId: row.userId,
        resourceId: row.resourceId,
        details: row.details,
        clientIp: row.clientIp,
        sessionId: row.sessionId,
        prevHash: row.prevHash,
      });

      if (computedHash !== row.hash) {
        return {
          valid: false,
          totalRecords: rows.length,
          brokenAt: row.id,
          brokenHash: row.hash,
          expectedHash: computedHash,
          message: `记录 #${row.id} 的 hash 不匹配：存储=${row.hash}，计算=${computedHash}`,
        };
      }

      prevHash = row.hash;
    }

    return {
      valid: true,
      totalRecords: rows.length,
      brokenAt: null,
      brokenHash: null,
      expectedHash: null,
      message: `完整性校验通过，共 ${rows.length} 条记录`,
    };
  }

  /**
   * 获取审计日志统计信息
   */
  async getStats(): Promise<AuditLogStats> {
    this.ensureInit();

    const total = (this.db!.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }).count;

    const byAction = Object.fromEntries(
      (this.db!.prepare('SELECT action, COUNT(*) as count FROM audit_log GROUP BY action').all() as { action: string; count: number }[])
        .map(r => [r.action, r.count]),
    );

    const byLevel = Object.fromEntries(
      (this.db!.prepare('SELECT level, COUNT(*) as count FROM audit_log GROUP BY level').all() as { level: string; count: number }[])
        .map(r => [r.level, r.count]),
    );

    const timeRange = this.db!.prepare(
      'SELECT MIN(timestamp) as earliest, MAX(timestamp) as latest FROM audit_log',
    ).get() as { earliest: string | null; latest: string | null };

    const integrity = await this.verifyIntegrity();

    return {
      totalRecords: total,
      byAction,
      byLevel,
      earliestTimestamp: timeRange.earliest,
      latestTimestamp: timeRange.latest,
      integrityValid: integrity.valid,
    };
  }

  /**
   * 导出审计日志为 JSON
   */
  async exportLogs(format: 'json' | 'csv' = 'json'): Promise<string> {
    this.ensureInit();

    const rows = this.db!.prepare('SELECT * FROM audit_log ORDER BY id ASC').all() as AuditLogEntry[];

    if (format === 'csv') {
      const headers = 'id,timestamp,action,level,userId,resourceId,details,clientIp,sessionId,hash,prevHash';
      const csvRows = rows.map(r =>
        [r.id, r.timestamp, r.action, r.level, r.userId, r.resourceId,
         `"${r.details.replace(/"/g, '""')}"`, r.clientIp, r.sessionId, r.hash, r.prevHash].join(','),
      );
      return [headers, ...csvRows].join('\n');
    }

    return JSON.stringify(rows, null, 2);
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

/** 单例 */
export const auditLogService = new AuditLogService();