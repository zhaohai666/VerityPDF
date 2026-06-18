import React, { useState } from 'react';

interface EncryptionDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (options: {
    userPassword: string;
    ownerPassword: string;
    permissions: {
      print: boolean;
      copy: boolean;
      modify: boolean;
      annotate: boolean;
      fillForms: boolean;
      extract: boolean;
    };
  }) => void;
}

export const EncryptionDialog: React.FC<EncryptionDialogProps> = ({ open, onClose, onApply }) => {
  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [permissions, setPermissions] = useState({
    print: true,
    copy: true,
    modify: true,
    annotate: true,
    fillForms: true,
    extract: true,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleApply = () => {
    if (!userPassword && !ownerPassword) {
      setError('请设置至少一个密码');
      return;
    }
    if (userPassword && userPassword.length < 4) {
      setError('用户密码至少 4 个字符');
      return;
    }
    setError('');
    onApply({ userPassword, ownerPassword, permissions });
  };

  const togglePerm = (key: keyof typeof permissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog encryption-dialog">
        <div className="dialog-header">
          <h3>加密与权限设置</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>用户密码（打开文档时输入）</label>
            <input
              type="password"
              className="form-input"
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder="输入用户密码"
              aria-label="用户密码"
            />
            <p className="form-hint">用户需要此密码才能打开 PDF 文件</p>
          </div>

          <div className="form-group">
            <label>所有者密码（修改权限时输入）</label>
            <input
              type="password"
              className="form-input"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              placeholder="输入所有者密码"
              aria-label="所有者密码"
            />
            <p className="form-hint">所有者密码用于控制权限设置</p>
          </div>

          <button
            className="btn-secondary"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '收起权限设置' : '展开权限设置'}
          </button>

          {showAdvanced && (
            <div className="permissions-panel">
              <label className="perm-item">
                <input type="checkbox" checked={permissions.print} onChange={() => togglePerm('print')} />
                <span>允许打印</span>
              </label>
              <label className="perm-item">
                <input type="checkbox" checked={permissions.copy} onChange={() => togglePerm('copy')} />
                <span>允许复制内容</span>
              </label>
              <label className="perm-item">
                <input type="checkbox" checked={permissions.modify} onChange={() => togglePerm('modify')} />
                <span>允许修改内容</span>
              </label>
              <label className="perm-item">
                <input type="checkbox" checked={permissions.annotate} onChange={() => togglePerm('annotate')} />
                <span>允许添加注释</span>
              </label>
              <label className="perm-item">
                <input type="checkbox" checked={permissions.fillForms} onChange={() => togglePerm('fillForms')} />
                <span>允许填写表单</span>
              </label>
              <label className="perm-item">
                <input type="checkbox" checked={permissions.extract} onChange={() => togglePerm('extract')} />
                <span>允许提取内容</span>
              </label>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleApply}>应用加密</button>
        </div>
      </div>
    </div>
  );
};
