/**
 * RestApiServer - REST API 服务
 *
 * 基于 Node.js 内置 http 模块的轻量 REST API 服务器，
 * 将 VerityPDF 的 PDF 操作能力暴露为 HTTP 端点，
 * 支持外部程序通过 REST API 调用 PDF 处理功能。
 *
 * 端点列表：
 *   GET  /api/status          - 服务器状态
 *   POST /api/pdf/info        - 获取 PDF 元信息
 *   POST /api/pdf/repair      - 修复 PDF
 *   POST /api/pdf/encrypt     - 加密 PDF
 *   POST /api/pdf/decrypt     - 解密 PDF
 *   POST /api/pdf/merge       - 合并多个 PDF
 *   POST /api/pdf/split       - 拆分 PDF
 *   POST /api/pdf/watermark   - 添加水印
 *   POST /api/pdf/compress    - 压缩 PDF
 *   POST /api/pdf/rotate      - 旋转页面
 *   POST /api/pdf/extract-text - 提取文本
 *   POST /api/pdf/extract-images - 提取图片
 *   POST /api/pdf/bookmarks   - 获取书签
 *   POST /api/pdf/hyperlinks  - 获取超链接
 *   POST /api/pdf/form-fields - 检测表单字段
 *   POST /api/pdf/sanitize    - 消毒处理
 *   POST /api/pdf/convert-pdfA - PDF/A 转换
 */

import http from 'http';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ─── 类型定义 ───

export interface RestApiConfig {
  port: number;
  host: string;
  authToken?: string;
  maxFileSize: number;  // bytes
  corsEnabled: boolean;
}

export interface RestApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
  timestamp: number;
}

export interface ApiKeyInfo {
  key: string;
  label: string;
  createdAt: number;
  lastUsed: number;
  requestCount: number;
}

// ─── RestApiServer ───

export class RestApiServer extends EventEmitter {
  private server: http.Server | null = null;
  private config: RestApiConfig;
  private running = false;
  private apiKeys: Map<string, ApiKeyInfo> = new Map();
  private requestCount = 0;
  private uploadDir: string;
  private pdfHandler: ((action: string, payload: unknown) => Promise<unknown>) | null = null;

  constructor(config?: Partial<RestApiConfig>) {
    super();
    this.config = {
      port: 8080,
      host: '0.0.0.0',
      maxFileSize: 100 * 1024 * 1024, // 100MB
      corsEnabled: true,
      ...config,
    };
    this.uploadDir = path.join(os.tmpdir(), 'veritypdf-api-uploads');
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  /**
   * 设置 PDF 操作处理器
   * 由外部注入，将 API 请求转发到实际的 PDF 服务
   */
  setPdfHandler(handler: (action: string, payload: unknown) => Promise<unknown>): void {
    this.pdfHandler = handler;
  }

  /**
   * 启动 REST API 服务器
   */
  async start(): Promise<number> {
    if (this.running) return this.config.port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.config.port++;
          this.server = null;
          this.start().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.running = true;
        this.emit('started', this.config.port);
        resolve(this.config.port);
      });
    });
  }

  /**
   * 停止 REST API 服务器
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.running = false;
          this.emit('stopped');
          resolve();
        });
      } else {
        this.running = false;
        resolve();
      }
    });
  }

  /**
   * 获取服务器状态
   */
  getStatus() {
    return {
      running: this.running,
      port: this.config.port,
      host: this.config.host,
      requestCount: this.requestCount,
      apiKeyCount: this.apiKeys.size,
      uptime: this.running ? process.uptime() : 0,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<RestApiConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<RestApiConfig>): void {
    Object.assign(this.config, updates);
    this.emit('config-updated', this.config);
  }

  /**
   * 生成 API Key
   */
  generateApiKey(label: string): ApiKeyInfo {
    const key = `vpk_${crypto.randomBytes(16).toString('hex')}`;
    const info: ApiKeyInfo = {
      key,
      label,
      createdAt: Date.now(),
      lastUsed: 0,
      requestCount: 0,
    };
    this.apiKeys.set(key, info);
    this.emit('api-key-generated', info);
    return info;
  }

  /**
   * 撤销 API Key
   */
  revokeApiKey(key: string): boolean {
    return this.apiKeys.delete(key);
  }

  /**
   * 列出所有 API Key
   */
  listApiKeys(): ApiKeyInfo[] {
    return Array.from(this.apiKeys.values()).map((info) => ({
      ...info,
      key: `${info.key.substring(0, 8)}...`, // 隐藏完整 key
    }));
  }

  // ─── HTTP 请求处理 ───

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.requestCount++;

    // CORS
    if (this.config.corsEnabled) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 鉴权
    if (this.config.authToken && !this.authenticate(req)) {
      this.sendError(res, 401, 'Unauthorized', 'AUTH_REQUIRED');
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);
    const pathname = url.pathname;

    try {
      this.route(req, res, pathname);
    } catch (err) {
      this.sendError(res, 500, String(err), 'INTERNAL_ERROR');
    }
  }

  private authenticate(req: http.IncomingMessage): boolean {
    // API Key 方式
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey && this.apiKeys.has(apiKey)) {
      const info = this.apiKeys.get(apiKey)!;
      info.lastUsed = Date.now();
      info.requestCount++;
      return true;
    }

    // Bearer Token 方式
    const authHeader = req.headers['authorization'] as string;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return token === this.config.authToken;
    }

    // 无 token 配置时允许访问
    if (!this.config.authToken && this.apiKeys.size === 0) {
      return true;
    }

    return false;
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
    // ─── 管理 API ───
    if (pathname === '/api/status' && req.method === 'GET') {
      this.sendJson(res, this.getStatus());
      return;
    }

    if (pathname === '/api/config' && req.method === 'GET') {
      this.sendJson(res, {
        port: this.config.port,
        host: this.config.host,
        corsEnabled: this.config.corsEnabled,
        maxFileSize: this.config.maxFileSize,
      });
      return;
    }

    if (pathname === '/api/keys' && req.method === 'GET') {
      this.sendJson(res, this.listApiKeys());
      return;
    }

    if (pathname === '/api/keys' && req.method === 'POST') {
      const body = await this.readBody(req);
      const { label } = JSON.parse(body);
      const info = this.generateApiKey(label || 'default');
      this.sendJson(res, info);
      return;
    }

    if (pathname.startsWith('/api/keys/') && req.method === 'DELETE') {
      const key = pathname.split('/').pop() || '';
      const success = this.revokeApiKey(key);
      this.sendJson(res, { success });
      return;
    }

    // ─── PDF 操作 API ───
    if (pathname.startsWith('/api/pdf/') && req.method === 'POST') {
      await this.handlePdfOperation(req, res, pathname);
      return;
    }

    // ─── 健康检查 ───
    if (pathname === '/health' && req.method === 'GET') {
      this.sendJson(res, { status: 'ok', timestamp: Date.now() });
      return;
    }

    // ─── API 文档 ───
    if (pathname === '/' || pathname === '/api') {
      this.sendJson(res, {
        name: 'VerityPDF REST API',
        version: '1.0.0',
        endpoints: [
          'GET  /api/status         - 服务器状态',
          'GET  /api/config         - 服务器配置',
          'GET  /api/keys           - 列出 API Keys',
          'POST /api/keys           - 生成 API Key',
          'DELETE /api/keys/:key    - 撤销 API Key',
          'POST /api/pdf/info       - 获取 PDF 信息',
          'POST /api/pdf/repair     - 修复 PDF',
          'POST /api/pdf/encrypt    - 加密 PDF',
          'POST /api/pdf/decrypt    - 解密 PDF',
          'POST /api/pdf/merge      - 合并 PDF',
          'POST /api/pdf/split      - 拆分 PDF',
          'POST /api/pdf/watermark  - 添加水印',
          'POST /api/pdf/compress   - 压缩 PDF',
          'POST /api/pdf/rotate     - 旋转页面',
          'POST /api/pdf/extract-text    - 提取文本',
          'POST /api/pdf/extract-images  - 提取图片',
          'POST /api/pdf/bookmarks       - 获取书签',
          'POST /api/pdf/hyperlinks      - 获取超链接',
          'POST /api/pdf/form-fields     - 检测表单字段',
          'POST /api/pdf/sanitize        - 消毒处理',
          'POST /api/pdf/convert-pdfA    - PDF/A 转换',
          'GET  /health             - 健康检查',
        ],
      });
      return;
    }

    this.sendError(res, 404, 'Not found', 'NOT_FOUND');
  }

  private async handlePdfOperation(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string
  ): Promise<void> {
    if (!this.pdfHandler) {
      this.sendError(res, 503, 'PDF handler not configured', 'NO_HANDLER');
      return;
    }

    // 从路径提取操作名: /api/pdf/repair → repair
    const action = pathname.replace('/api/pdf/', '').replace(/-/g, '_');

    // 读取请求体
    const body = await this.readBody(req);
    let payload: unknown;

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      // multipart: 解析文件上传
      payload = await this.parseMultipart(body, contentType);
    } else {
      // JSON
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { rawBody: body };
      }
    }

    try {
      const result = await this.pdfHandler(action, payload);
      this.sendJson(res, {
        success: true,
        data: result,
        timestamp: Date.now(),
      });
    } catch (err) {
      this.sendError(
        res,
        500,
        err instanceof Error ? err.message : String(err),
        'PDF_OPERATION_FAILED'
      );
    }
  }

  // ─── 工具方法 ───

  private sendJson(res: http.ServerResponse, data: unknown): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private sendError(res: http.ServerResponse, statusCode: number, message: string, errorCode: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: message,
      errorCode,
      timestamp: Date.now(),
    }));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private async parseMultipart(body: string, contentType: string): Promise<unknown> {
    // 简化的 multipart 解析 - 提取文件内容
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) return { rawBody: body };

    const parts = body.split(`--${boundary}`);
    const files: Array<{ name: string; filename: string; content: string; contentType: string }> = [];

    for (const part of parts) {
      if (part.includes('filename=')) {
        const nameMatch = part.match(/name="([^"]+)"/);
        const filenameMatch = part.match(/filename="([^"]+)"/);
        const ctMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);

        if (nameMatch && filenameMatch) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const content = part.substring(headerEnd + 4).trim();
            files.push({
              name: nameMatch[1],
              filename: filenameMatch[1],
              content,
              contentType: ctMatch?.[1] || 'application/octet-stream',
            });
          }
        }
      }
    }

    return { files, fileCount: files.length };
  }
}