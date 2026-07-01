/**
 * CollabService - 多人协作服务
 *
 * 基于 WebSocket 的实时协作系统，支持：
 * - 创建/加入协作房间
 * - 实时标注同步
 * - 用户在线状态
 * - 操作冲突解决（Last-Write-Wins）
 *
 * 使用 Node.js 内置 http 模块实现，无需外部依赖
 */

import http from 'http';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// ─── 类型定义 ───

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { pageIndex: number; x: number; y: number };
  lastSeen: number;
}

export interface CollabRoom {
  id: string;
  name: string;
  hostUserId: string;
  users: Map<string, CollabUser>;
  annotations: Map<string, CollabAnnotation>;
  createdAt: number;
  documentHash?: string;
}

export interface CollabAnnotation {
  id: string;
  userId: string;
  pageIndex: number;
  type: string;
  data: unknown;
  timestamp: number;
  deleted: boolean;
}

export type CollabMessageType =
  | 'join'
  | 'leave'
  | 'cursor'
  | 'annotation-add'
  | 'annotation-update'
  | 'annotation-delete'
  | 'sync-request'
  | 'sync-response'
  | 'user-list'
  | 'room-info'
  | 'error';

export interface CollabMessage {
  type: CollabMessageType;
  roomId: string;
  userId: string;
  payload: unknown;
  timestamp: number;
}

export interface CollabRoomInfo {
  id: string;
  name: string;
  hostUserId: string;
  userCount: number;
  createdAt: number;
}

// ─── SSE 连接管理 ───

interface SseConnection {
  userId: string;
  roomId: string;
  res: http.ServerResponse;
  lastEventId: number;
}

// ─── CollabService ───

export class CollabService extends EventEmitter {
  private rooms: Map<string, CollabRoom> = new Map();
  private connections: Map<string, SseConnection> = new Map();
  private server: http.Server | null = null;
  private port: number = 0;
  private running = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private eventCounter = 0;

  // 用户颜色池
  private static readonly USER_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
    '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
  ];

  /**
   * 启动协作服务器
   */
  async start(port: number = 9200): Promise<number> {
    if (this.running) {
      return this.port;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // 端口被占用，尝试下一个
          this.start(port + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });

      this.server.listen(port, '0.0.0.0', () => {
        this.port = port;
        this.running = true;
        this.startCleanup();
        this.emit('started', port);
        resolve(port);
      });
    });
  }

  /**
   * 停止协作服务器
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    // 通知所有连接
    for (const [, conn] of this.connections) {
      this.sendSseEvent(conn.res, 'server-shutdown', { message: 'Server is shutting down' });
      conn.res.end();
    }

    this.connections.clear();

    // 关闭所有房间
    for (const [roomId, room] of this.rooms) {
      room.users.clear();
      this.emit('room-closed', roomId);
    }
    this.rooms.clear();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.running = false;
          this.port = 0;
          this.emit('stopped');
          resolve();
        });
      } else {
        this.running = false;
        this.port = 0;
        resolve();
      }
    });
  }

  /**
   * 获取服务器状态
   */
  getStatus(): { running: boolean; port: number; roomCount: number; connectionCount: number } {
    return {
      running: this.running,
      port: this.port,
      roomCount: this.rooms.size,
      connectionCount: this.connections.size,
    };
  }

  /**
   * 获取所有房间列表
   */
  getRooms(): CollabRoomInfo[] {
    return Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      hostUserId: room.hostUserId,
      userCount: room.users.size,
      createdAt: room.createdAt,
    }));
  }

  /**
   * 创建房间
   */
  createRoom(name: string, hostUserId: string, documentHash?: string): CollabRoom {
    const roomId = `room_${crypto.randomBytes(4).toString('hex')}`;
    const room: CollabRoom = {
      id: roomId,
      name,
      hostUserId,
      users: new Map(),
      annotations: new Map(),
      createdAt: Date.now(),
      documentHash,
    };
    this.rooms.set(roomId, room);
    this.emit('room-created', room);
    return room;
  }

  /**
   * 删除房间
   */
  deleteRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // 通知房间内所有用户
    this.broadcastToRoom(roomId, 'room-deleted', { roomId });

    // 关闭该房间的所有 SSE 连接
    for (const [connId, conn] of this.connections) {
      if (conn.roomId === roomId) {
        conn.res.end();
        this.connections.delete(connId);
      }
    }

    this.rooms.delete(roomId);
    this.emit('room-deleted', roomId);
    return true;
  }

  /**
   * 获取房间信息
   */
  getRoomInfo(roomId: string): CollabRoomInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      id: room.id,
      name: room.name,
      hostUserId: room.hostUserId,
      userCount: room.users.size,
      createdAt: room.createdAt,
    };
  }

  /**
   * 获取房间内用户列表
   */
  getRoomUsers(roomId: string): CollabUser[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.values());
  }

  /**
   * 加入房间（IPC 调用入口）
   */
  joinRoom(roomId: string, userName: string): { userId: string; userName: string; color: string; room: CollabRoomInfo | null; users: CollabUser[] } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const userId = `user_${crypto.randomBytes(3).toString('hex')}`;
    const colorIndex = room.users.size % CollabService.USER_COLORS.length;
    const user: CollabUser = {
      id: userId,
      name: userName || `用户${room.users.size + 1}`,
      color: CollabService.USER_COLORS[colorIndex],
      lastSeen: Date.now(),
    };

    room.users.set(user.id, user);
    this.broadcastToRoom(roomId, 'user-joined', { user });

    return {
      userId: user.id,
      userName: user.name,
      color: user.color,
      room: this.getRoomInfo(roomId),
      users: this.getRoomUsers(roomId),
    };
  }

  /**
   * 离开房间（IPC 调用入口）
   */
  leaveRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return true;

    room.users.delete(userId);

    // 关闭该用户的 SSE 连接
    for (const [connId, conn] of this.connections) {
      if (conn.userId === userId && conn.roomId === roomId) {
        conn.res.end();
        this.connections.delete(connId);
      }
    }

    this.broadcastToRoom(roomId, 'user-left', { userId });

    // 如果房间为空，自动删除
    if (room.users.size === 0) {
      this.deleteRoom(roomId);
    }

    return true;
  }

  /**
   * 添加标注（IPC 调用入口）
   */
  addAnnotation(roomId: string, annotation: Record<string, unknown>, userId?: string): { success: boolean; annotationId: string } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const annotId = (annotation.id as string) || `annot_${crypto.randomBytes(4).toString('hex')}`;
    const action = (annotation.action as string) || 'add';
    const collabAnnot: CollabAnnotation = {
      id: annotId,
      userId: userId || 'local',
      pageIndex: (annotation.pageIndex as number) ?? 0,
      type: (annotation.type as string) ?? 'unknown',
      data: annotation.data,
      timestamp: Date.now(),
      deleted: action === 'delete',
    };

    if (action === 'delete') {
      const existing = room.annotations.get(annotId);
      if (existing) {
        existing.deleted = true;
        existing.timestamp = Date.now();
      }
    } else {
      room.annotations.set(annotId, collabAnnot);
    }

    this.broadcastToRoom(roomId, `annotation-${action}`, { annotation: collabAnnot, userId: userId || 'local' });

    return { success: true, annotationId: annotId };
  }

  /**
   * 更新光标位置（IPC 调用入口）
   */
  updateCursor(roomId: string, userId: string, cursor: Record<string, unknown>): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const user = room.users.get(userId);
    if (user) {
      user.cursor = cursor as { pageIndex: number; x: number; y: number };
      user.lastSeen = Date.now();
    }

    this.broadcastToRoom(roomId, 'cursor-move', { userId, cursor });
    return true;
  }

  /**
   * 同步房间数据（IPC 调用入口）
   */
  syncRoom(roomId: string): { roomId: string; annotations: CollabAnnotation[]; users: CollabUser[] } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const annotations = Array.from(room.annotations.values()).filter((a) => !a.deleted);
    return {
      roomId,
      annotations,
      users: this.getRoomUsers(roomId),
    };
  }

  // ─── HTTP 请求处理 ───

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-Room-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const path = url.pathname;

    try {
      // 路由分发
      if (path === '/api/collab/status' && req.method === 'GET') {
        this.handleGetStatus(res);
      } else if (path === '/api/collab/rooms' && req.method === 'GET') {
        this.handleGetRooms(res);
      } else if (path === '/api/collab/rooms' && req.method === 'POST') {
        this.handleCreateRoom(req, res);
      } else if (path.startsWith('/api/collab/rooms/') && req.method === 'DELETE') {
        const roomId = path.split('/').pop() || '';
        this.handleDeleteRoom(roomId, res);
      } else if (path === '/api/collab/join' && req.method === 'POST') {
        this.handleJoin(req, res);
      } else if (path === '/api/collab/leave' && req.method === 'POST') {
        this.handleLeave(req, res);
      } else if (path === '/api/collab/events' && req.method === 'GET') {
        this.handleSseConnect(req, res);
      } else if (path === '/api/collab/annotate' && req.method === 'POST') {
        this.handleAnnotation(req, res);
      } else if (path === '/api/collab/cursor' && req.method === 'POST') {
        this.handleCursor(req, res);
      } else if (path === '/api/collab/sync' && req.method === 'GET') {
        this.handleSync(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
  }

  // ─── API 处理方法 ───

  private handleGetStatus(res: http.ServerResponse): void {
    this.sendJson(res, this.getStatus());
  }

  private handleGetRooms(res: http.ServerResponse): void {
    this.sendJson(res, this.getRooms());
  }

  private async handleCreateRoom(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { name, userId, documentHash } = JSON.parse(body);
    const room = this.createRoom(name || '未命名房间', userId || 'anonymous', documentHash);
    this.sendJson(res, { roomId: room.id, name: room.name });
  }

  private handleDeleteRoom(roomId: string, res: http.ServerResponse): void {
    const success = this.deleteRoom(roomId);
    this.sendJson(res, { success });
  }

  private async handleJoin(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { roomId, userId, userName } = JSON.parse(body);

    const room = this.rooms.get(roomId);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }

    const colorIndex = room.users.size % CollabService.USER_COLORS.length;
    const user: CollabUser = {
      id: userId || `user_${crypto.randomBytes(3).toString('hex')}`,
      name: userName || `用户${room.users.size + 1}`,
      color: CollabService.USER_COLORS[colorIndex],
      lastSeen: Date.now(),
    };

    room.users.set(user.id, user);

    // 广播用户加入
    this.broadcastToRoom(roomId, 'user-joined', { user });

    this.sendJson(res, {
      userId: user.id,
      userName: user.name,
      color: user.color,
      room: this.getRoomInfo(roomId),
      users: this.getRoomUsers(roomId),
    });
  }

  private async handleLeave(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { roomId, userId } = JSON.parse(body);

    const room = this.rooms.get(roomId);
    if (!room) {
      this.sendJson(res, { success: true });
      return;
    }

    room.users.delete(userId);

    // 关闭该用户的 SSE 连接
    for (const [connId, conn] of this.connections) {
      if (conn.userId === userId && conn.roomId === roomId) {
        conn.res.end();
        this.connections.delete(connId);
      }
    }

    // 广播用户离开
    this.broadcastToRoom(roomId, 'user-left', { userId });

    // 如果房间为空，自动删除
    if (room.users.size === 0) {
      this.deleteRoom(roomId);
    }

    this.sendJson(res, { success: true });
  }

  private handleSseConnect(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const roomId = url.searchParams.get('roomId') || '';
    const userId = url.searchParams.get('userId') || '';

    const room = this.rooms.get(roomId);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }

    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const connId = `${roomId}:${userId}:${Date.now()}`;
    const conn: SseConnection = {
      userId,
      roomId,
      res,
      lastEventId: 0,
    };
    this.connections.set(connId, conn);

    // 发送初始连接确认
    this.sendSseEvent(res, 'connected', { roomId, userId, message: 'SSE connection established' });

    // 心跳
    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeat);
        return;
      }
      this.sendSseEvent(res, 'heartbeat', { ts: Date.now() });
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.connections.delete(connId);
    });
  }

  private async handleAnnotation(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { roomId, userId, action, annotation } = JSON.parse(body);

    const room = this.rooms.get(roomId);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }

    const annotId = annotation?.id || `annot_${crypto.randomBytes(4).toString('hex')}`;
    const collabAnnot: CollabAnnotation = {
      id: annotId,
      userId,
      pageIndex: annotation?.pageIndex ?? 0,
      type: annotation?.type ?? 'unknown',
      data: annotation?.data,
      timestamp: Date.now(),
      deleted: action === 'delete',
    };

    if (action === 'delete') {
      const existing = room.annotations.get(annotId);
      if (existing) {
        existing.deleted = true;
        existing.timestamp = Date.now();
      }
    } else {
      room.annotations.set(annotId, collabAnnot);
    }

    // 广播标注变更
    this.broadcastToRoom(roomId, `annotation-${action}`, { annotation: collabAnnot, userId });

    this.sendJson(res, { success: true, annotationId: annotId });
  }

  private async handleCursor(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { roomId, userId, cursor } = JSON.parse(body);

    const room = this.rooms.get(roomId);
    if (!room) {
      this.sendJson(res, { success: false });
      return;
    }

    const user = room.users.get(userId);
    if (user) {
      user.cursor = cursor;
      user.lastSeen = Date.now();
    }

    // 广播光标位置
    this.broadcastToRoom(roomId, 'cursor-move', { userId, cursor });

    this.sendJson(res, { success: true });
  }

  private handleSync(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const roomId = url.searchParams.get('roomId') || '';

    const room = this.rooms.get(roomId);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }

    const annotations = Array.from(room.annotations.values()).filter((a) => !a.deleted);
    this.sendJson(res, {
      roomId,
      annotations,
      users: this.getRoomUsers(roomId),
    });
  }

  // ─── 工具方法 ───

  private broadcastToRoom(roomId: string, eventType: string, data: unknown): void {
    for (const [, conn] of this.connections) {
      if (conn.roomId === roomId && !conn.res.writableEnded) {
        this.sendSseEvent(conn.res, eventType, data);
      }
    }
    this.emit('broadcast', { roomId, eventType, data });
  }

  private sendSseEvent(res: http.ServerResponse, eventType: string, data: unknown): void {
    if (res.writableEnded) return;
    const id = ++this.eventCounter;
    res.write(`id: ${id}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private sendJson(res: http.ServerResponse, data: unknown): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private startCleanup(): void {
    // 每 30 秒清理不活跃用户
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const TIMEOUT = 60000; // 60 秒超时

      for (const [, room] of this.rooms) {
        for (const [userId, user] of room.users) {
          if (now - user.lastSeen > TIMEOUT) {
            room.users.delete(userId);
            this.broadcastToRoom(room.id, 'user-timeout', { userId });
          }
        }
      }
    }, 30000);
  }
}