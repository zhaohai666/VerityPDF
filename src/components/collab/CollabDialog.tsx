import React, { useState, useEffect, useCallback } from 'react';
import {
  CollabRoomInfo,
  CollabRoomDetail,
  CollabUser,
  CollabStatus,
} from '@/types/electron';

interface CollabDialogProps {
  onClose: () => void;
}

export const CollabDialog: React.FC<CollabDialogProps> = ({ onClose }) => {
  const [status, setStatus] = useState<CollabStatus | null>(null);
  const [rooms, setRooms] = useState<CollabRoomInfo[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<CollabRoomDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'main' | 'create' | 'room'>('main');

  // 创建房间表单
  const [roomName, setRoomName] = useState('');
  const [creating, setCreating] = useState(false);

  // 加入房间
  const [userName, setUserName] = useState('');
  const [joining, setJoining] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await window.verityAPI.getCollabStatus();
      setStatus(s);
    } catch {
      // ignore
    }
  }, []);

  const refreshRooms = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.verityAPI.listCollabRooms();
      setRooms(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取房间列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshRooms();
  }, [refreshStatus, refreshRooms]);

  const handleStartServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await window.verityAPI.startCollab();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动协作服务失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStopServer = async () => {
    setLoading(true);
    setError(null);
    try {
      await window.verityAPI.stopCollab();
      await refreshStatus();
      setRooms([]);
      setSelectedRoom(null);
      setMode('main');
    } catch (err) {
      setError(err instanceof Error ? err.message : '停止协作服务失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await window.verityAPI.createCollabRoom(roomName.trim());
      await refreshRooms();
      setRoomName('');
      setMode('main');
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建房间失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    try {
      await window.verityAPI.deleteCollabRoom(roomId);
      await refreshRooms();
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(null);
        setMode('main');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除房间失败');
    }
  };

  const handleViewRoom = async (roomId: string) => {
    setLoading(true);
    setError(null);
    try {
      const detail = await window.verityAPI.getCollabRoom(roomId);
      setSelectedRoom(detail);
      setMode('room');
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取房间详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!userName.trim()) return;
    setJoining(true);
    setError(null);
    try {
      await window.verityAPI.joinCollabRoom({ roomId, userName: userName.trim() });
      await handleViewRoom(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入房间失败');
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveRoom = async (roomId: string, userId: string) => {
    try {
      await window.verityAPI.leaveCollabRoom(roomId, userId);
      await handleViewRoom(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '离开房间失败');
    }
  };

  const isRunning = status?.running ?? false;

  return (
    <div className="dialog-overlay">
      <div className="dialog-box" style={{ width: '720px' }}>
        <div className="dialog-header">
          <h2>多人协作</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="dialog-body">
          {error && (
            <div className="error-message" style={{ marginBottom: '12px' }}>
              {error}
              <button onClick={() => setError(null)} style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
            </div>
          )}

          {/* 服务器状态 */}
          <div style={{
            padding: '12px 16px',
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '14px' }}>
                协作服务器
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {isRunning
                  ? `运行中 · 端口 ${status?.port} · ${status?.roomCount ?? 0} 个房间 · ${status?.totalUsers ?? 0} 位用户`
                  : '未启动'}
              </div>
            </div>
            <button
              onClick={isRunning ? handleStopServer : handleStartServer}
              disabled={loading}
              className={isRunning ? 'btn-secondary' : 'btn-primary'}
              style={{ fontSize: '13px' }}
            >
              {loading ? '处理中...' : isRunning ? '停止服务' : '启动服务'}
            </button>
          </div>

          {isRunning && mode === 'main' && (
            <>
              {/* 房间列表 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontWeight: 500 }}>房间列表 ({rooms.length})</span>
                <button onClick={() => setMode('create')} className="btn-primary" style={{ fontSize: '13px' }}>
                  创建房间
                </button>
              </div>

              {rooms.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  暂无协作房间，点击"创建房间"开始
                </div>
              ) : (
                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      style={{
                        padding: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{room.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          房主: {room.hostUserId.substring(0, 8)}... · {room.userCount} 位用户 · 创建于 {new Date(room.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleViewRoom(room.id)}
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          查看
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 10px', color: '#e74c3c' }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 加入房间 */}
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>加入房间</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="输入用户名"
                    className="form-input"
                    style={{ flex: 1, fontSize: '13px' }}
                  />
                  <select
                    className="form-input"
                    style={{ fontSize: '13px', minWidth: '120px' }}
                    id="room-select"
                  >
                    <option value="">选择房间</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const sel = document.getElementById('room-select') as HTMLSelectElement;
                      if (sel.value && userName.trim()) {
                        handleJoinRoom(sel.value);
                      }
                    }}
                    disabled={joining || !userName.trim()}
                    className="btn-primary"
                    style={{ fontSize: '13px' }}
                  >
                    {joining ? '加入中...' : '加入'}
                  </button>
                </div>
              </div>
            </>
          )}

          {isRunning && mode === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>房间名称</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="输入房间名称"
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setMode('main')} className="btn-secondary">取消</button>
                <button
                  onClick={handleCreateRoom}
                  disabled={creating || !roomName.trim()}
                  className="btn-primary"
                >
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </div>
          )}

          {isRunning && mode === 'room' && selectedRoom && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <button onClick={() => setMode('main')} className="btn-secondary" style={{ fontSize: '12px', padding: '4px 8px' }}>
                  ← 返回
                </button>
                <span style={{ fontWeight: 500, fontSize: '15px' }}>{selectedRoom.name}</span>
              </div>

              {/* 房间信息 */}
              <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  房间 ID: {selectedRoom.id}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  房主: {selectedRoom.hostUserId.substring(0, 8)}... · 标注数: {selectedRoom.annotationCount} · 创建于 {new Date(selectedRoom.createdAt).toLocaleString()}
                </div>
              </div>

              {/* 用户列表 */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>
                  在线用户 ({selectedRoom.users.length})
                </div>
                {selectedRoom.users.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>暂无用户</div>
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {selectedRoom.users.map((user: CollabUser) => (
                      <div
                        key={user.id}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--border-color)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: user.color,
                          }} />
                          <span style={{ fontSize: '13px' }}>{user.name}</span>
                          {user.id === selectedRoom.hostUserId && (
                            <span style={{ fontSize: '11px', color: 'var(--accent-color)' }}>房主</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleLeaveRoom(selectedRoom.id, user.id)}
                          className="btn-secondary"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                        >
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 同步数据 */}
              <button
                onClick={async () => {
                  try {
                    const data = await window.verityAPI.syncCollabData(selectedRoom.id);
                    setSelectedRoom({ ...selectedRoom, users: data.users, annotationCount: data.annotations.length });
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '同步失败');
                  }
                }}
                className="btn-secondary"
                style={{ fontSize: '13px' }}
              >
                同步数据
              </button>
            </div>
          )}

          {!isRunning && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
              <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px' }}>多人协作</div>
              <div style={{ fontSize: '13px' }}>启动协作服务器以创建或加入协作房间</div>
              <div style={{ fontSize: '12px', marginTop: '8px' }}>基于 SSE 实时推送，支持标注同步和光标共享</div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose} className="btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};