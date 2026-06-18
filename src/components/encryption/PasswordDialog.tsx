import React, { useState } from 'react';

interface PasswordDialogProps {
  open: boolean;
  fileName: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

/**
 * 打开加密 PDF 时的密码输入对话框
 */
export const PasswordDialog: React.FC<PasswordDialogProps> = ({ open, fileName, onSubmit, onCancel }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!password) {
      setError('请输入密码');
      return;
    }
    setIsSubmitting(true);
    setError('');
    // 提交密码（由父组件验证）
    try {
      onSubmit(password);
    } catch {
      setError('密码错误，请重试');
      setPassword('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog password-dialog">
        <div className="dialog-header">
          <h3>需要密码</h3>
        </div>

        <div className="dialog-body">
          <div className="password-icon">
            <svg viewBox="0 0 24 24" width="48" height="48">
              <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 11V7a4 4 0 118 0v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
            </svg>
          </div>

          <p className="password-filename">{fileName}</p>
          <p className="password-hint">此 PDF 文件已加密，请输入密码以继续打开。</p>

          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <input
              type="password"
              className="form-input password-input"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="输入密码"
              autoFocus
              aria-label="密码"
            />
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>取消</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={isSubmitting || !password}>
            {isSubmitting ? '验证中...' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
};
