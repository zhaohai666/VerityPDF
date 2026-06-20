import React, { useState, useEffect } from 'react';

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
  onDecrypt?: (password: string) => void;
}

type EncryptTab = 'encrypt' | 'decrypt';

export const EncryptionDialog: React.FC<EncryptionDialogProps> = ({ open, onClose, onApply, onDecrypt }) => {
  const [activeTab, setActiveTab] = useState<EncryptTab>('encrypt');
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
  const [qpdfStatus, setQpdfStatus] = useState<{ available: boolean; version?: string } | null>(null);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [decryptError, setDecryptError] = useState('');

  // 检测 QPDF 可用性
  useEffect(() => {
    if (!open) return;
    window.verityAPI.checkQpdf().then(setQpdfStatus).catch(() => setQpdfStatus({ available: false }));
  }, [open]);

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

  const handleDecrypt = () => {
    if (!decryptPassword) {
      setDecryptError('请输入密码');
      return;
    }
    setDecryptError('');
    if (onDecrypt) onDecrypt(decryptPassword);
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

        {/* QPDF 状态指示 */}
        <div className={`qpdf-status-bar ${qpdfStatus?.available ? 'qpdf-available' : 'qpdf-unavailable'}`}>
          {qpdfStatus === null ? (
            <span>正在检测加密引擎...</span>
          ) : qpdfStatus.available ? (
            <span>AES-256 加密引擎已就绪 {qpdfStatus.version && `(v${qpdfStatus.version})`}</span>
          ) : (
            <span>基础加密模式（未检测到 QPDF，加密仅 VerityPDF 可识别）</span>
          )}
        </div>

        {/* 标签页 */}
        <div className="dialog-tabs">
          <button className={`tab-btn ${activeTab === 'encrypt' ? 'active' : ''}`} onClick={() => setActiveTab('encrypt')}>
            应用加密
          </button>
          <button className={`tab-btn ${activeTab === 'decrypt' ? 'active' : ''}`} onClick={() => setActiveTab('decrypt')}>
            移除加密
          </button>
        </div>

        <div className="dialog-body">
          {/* 应用加密标签页 */}
          {activeTab === 'encrypt' && (
            <>
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

              {/* 密码强度提示 */}
              {userPassword && userPassword.length >= 4 && userPassword.length < 8 && (
                <div className="password-strength-weak">
                  密码强度较弱，建议至少 8 位，包含数字和字母
                </div>
              )}

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
            </>
          )}

          {/* 移除加密标签页 */}
          {activeTab === 'decrypt' && (
            <>
              {decryptError && <div className="error-message">{decryptError}</div>}

              <div className="form-group">
                <label>文档密码</label>
                <input
                  type="password"
                  className="form-input"
                  value={decryptPassword}
                  onChange={(e) => setDecryptPassword(e.target.value)}
                  placeholder="输入文档的已知密码"
                  aria-label="解密密码"
                />
                <p className="form-hint">输入加密时设置的密码以移除加密保护</p>
              </div>

              <div className="decrypt-info">
                <p>移除加密后，文档将不再需要密码即可打开，所有权限限制也将解除。</p>
              </div>
            </>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          {activeTab === 'encrypt' && (
            <button className="btn-primary" onClick={handleApply}>应用加密</button>
          )}
          {activeTab === 'decrypt' && (
            <button className="btn-primary" onClick={handleDecrypt}>移除加密</button>
          )}
        </div>
      </div>
    </div>
  );
};
