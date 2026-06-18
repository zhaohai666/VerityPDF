import React, { useState, useCallback } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';

interface DigitalSignatureDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 证书信息 */
interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

export const DigitalSignatureDialog: React.FC<DigitalSignatureDialogProps> = ({ open, onClose }) => {
  const [signerName, setSignerName] = useState('');
  const [reason, setReason] = useState('文档审批');
  const [location, setLocation] = useState('');
  const [p12Path, setP12Path] = useState('');
  const [p12Password, setP12Password] = useState('');
  const [useSelfSigned, setUseSelfSigned] = useState(true);
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ isSigned: boolean; isValid: boolean; signer?: string; timestamp?: string; message: string } | null>(null);
  const [error, setError] = useState('');

  const filePath = usePdfStore((s) => s.filePath);
  const showToast = useUIStore.getState().showToast;

  // 选择 P12 文件
  const handleSelectP12 = useCallback(async () => {
    const path = await window.verityAPI.showDialog({
      type: 'open',
      filters: [
        { name: '证书文件', extensions: ['p12', 'pfx'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (path) {
      setP12Path(path);
      setUseSelfSigned(false);
      // 加载证书信息
      try {
        const info = await window.verityAPI.loadCertificate(path, p12Password);
        setCertInfo(info as CertificateInfo);
      } catch (err) {
        setError('加载证书失败: ' + (err instanceof Error ? err.message : '密码错误'));
      }
    }
  }, [p12Password]);

  // 签名
  const handleSign = useCallback(async () => {
    if (!filePath) {
      showToast('请先打开 PDF 文件', 'warning');
      return;
    }
    if (!useSelfSigned && !p12Path) {
      setError('请选择证书文件或使用自签名证书');
      return;
    }
    if (!signerName && useSelfSigned) {
      setError('请输入签名者名称');
      return;
    }

    setIsSigning(true);
    setError('');
    try {
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));

      const result = await window.verityAPI.signPDF(base64, {
        signerName: signerName || 'Unknown',
        reason,
        location,
        p12Path: useSelfSigned ? undefined : p12Path,
        p12Password: useSelfSigned ? undefined : p12Password,
      });

      // 保存签名后的文件
      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      });
      if (!savePath) {
        setIsSigning(false);
        return;
      }

      const sigResult = result as { signedPdf: ArrayBuffer; signatureInfo: Record<string, unknown> };
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(sigResult.signedPdf)));
      await window.verityAPI.saveFile(signedBase64, savePath);
      showToast('签名成功', 'success');
      onClose();
    } catch (err) {
      setError('签名失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsSigning(false);
    }
  }, [filePath, signerName, reason, location, p12Path, p12Password, useSelfSigned]);

  // 验证签名
  const handleVerify = useCallback(async () => {
    if (!filePath) return;
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const result = await window.verityAPI.verifySignature(base64);
      setVerifyResult(result as { isSigned: boolean; isValid: boolean; signer?: string; timestamp?: string; message: string });
    } catch (err) {
      setVerifyResult({ isSigned: false, isValid: false, message: '验证失败: ' + (err instanceof Error ? err.message : '未知错误') });
    } finally {
      setIsVerifying(false);
    }
  }, [filePath]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog signature-dialog">
        <div className="dialog-header">
          <h3>数字签名</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          {/* 签名表单 */}
          <div className="signature-form">
            <div className="form-group">
              <label>签名方式</label>
              <div className="radio-group">
                <label className="radio-item">
                  <input
                    type="radio"
                    checked={useSelfSigned}
                    onChange={() => setUseSelfSigned(true)}
                  />
                  <span>自签名证书</span>
                </label>
                <label className="radio-item">
                  <input
                    type="radio"
                    checked={!useSelfSigned}
                    onChange={() => setUseSelfSigned(false)}
                  />
                  <span>P12/PFX 证书文件</span>
                </label>
              </div>
            </div>

            {useSelfSigned ? (
              <div className="form-group">
                <label>签名者名称</label>
                <input
                  type="text"
                  className="form-input"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="输入您的姓名"
                />
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>证书文件</label>
                  <div className="file-input-row">
                    <input
                      type="text"
                      className="form-input file-path"
                      value={p12Path}
                      readOnly
                      placeholder="选择 .p12 或 .pfx 文件"
                    />
                    <button className="btn-secondary btn-sm" onClick={handleSelectP12}>浏览</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>证书密码</label>
                  <input
                    type="password"
                    className="form-input"
                    value={p12Password}
                    onChange={(e) => setP12Password(e.target.value)}
                    placeholder="输入证书密码"
                  />
                </div>
                {certInfo && (
                  <div className="cert-info-panel">
                    <h4>证书信息</h4>
                    <div className="cert-info-row"><span>主题:</span> <span>{certInfo.subject}</span></div>
                    <div className="cert-info-row"><span>颁发者:</span> <span>{certInfo.issuer}</span></div>
                    <div className="cert-info-row"><span>序列号:</span> <span>{certInfo.serialNumber}</span></div>
                    <div className="cert-info-row"><span>有效期:</span> <span>{new Date(certInfo.validFrom).toLocaleDateString()} - {new Date(certInfo.validTo).toLocaleDateString()}</span></div>
                    <div className="cert-info-row"><span>指纹:</span> <span className="cert-fingerprint">{certInfo.fingerprint}</span></div>
                  </div>
                )}
              </>
            )}

            <div className="form-group">
              <label>签名原因</label>
              <input
                type="text"
                className="form-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="如：文档审批、合同签署"
              />
            </div>

            <div className="form-group">
              <label>签名位置</label>
              <input
                type="text"
                className="form-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="如：北京"
              />
            </div>
          </div>

          {/* 验证结果 */}
          {verifyResult && (
            <div className={`verify-result ${verifyResult.isValid ? 'valid' : 'invalid'}`}>
              <div className="verify-icon">{verifyResult.isValid ? '✓' : '✗'}</div>
              <div className="verify-text">
                <p>{verifyResult.message}</p>
                {verifyResult.signer && <p className="verify-detail">签名者: {verifyResult.signer}</p>}
                {verifyResult.timestamp && <p className="verify-detail">时间: {new Date(verifyResult.timestamp).toLocaleString()}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={handleVerify} disabled={isVerifying || !filePath}>
            {isVerifying ? '验证中...' : '验证签名'}
          </button>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSign} disabled={isSigning}>
            {isSigning ? '签名中...' : '签名并保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
