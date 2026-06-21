import React, { useState, useCallback } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';
import { HandwrittenSignaturePad } from './HandwrittenSignaturePad';

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

/** PAdES 签名选项 */
interface PadesSignOptions {
  signerName: string;
  reason: string;
  location: string;
  contactInfo?: string;
  p12Path?: string;
  p12Password?: string;
  visibleSignature?: {
    page: number;
    rect: { x: number; y: number; width: number; height: number };
    appearanceImage?: string;
    showTimestamp: boolean;
  };
}

/** 验证结果 */
interface VerifyResult {
  isSigned: boolean;
  isValid: boolean;
  signer?: string;
  timestamp?: string;
  certificateInfo?: CertificateInfo;
  documentIntact: boolean;
  message: string;
}

type TabType = 'cert' | 'handwritten' | 'verify';

export const DigitalSignatureDialog: React.FC<DigitalSignatureDialogProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('cert');
  const [signerName, setSignerName] = useState('');
  const [reason, setReason] = useState('文档审批');
  const [location, setLocation] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [p12Path, setP12Path] = useState('');
  const [p12Password, setP12Password] = useState('');
  const [useSelfSigned, setUseSelfSigned] = useState(true);
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState('');
  const [enableVisibleSig, setEnableVisibleSig] = useState(false);
  const [visiblePage, setVisiblePage] = useState(1);
  const [visibleX, setVisibleX] = useState(50);
  const [visibleY, setVisibleY] = useState(50);
  const [visibleW, setVisibleW] = useState(200);
  const [visibleH, setVisibleH] = useState(60);
  const [handwrittenImage, setHandwrittenImage] = useState<string | null>(null);

  const filePath = usePdfStore((s) => s.filePath);
  const pageCount = usePdfStore((s) => s.documentInfo?.pageCount ?? 1);
  const showToast = useUIStore.getState().showToast;

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
      try {
        const info = await window.verityAPI.loadCertificate(path, p12Password);
        setCertInfo(info as CertificateInfo);
      } catch (err) {
        setError('加载证书失败: ' + (err instanceof Error ? err.message : '密码错误'));
      }
    }
  }, [p12Password]);

  const handleSignPades = useCallback(async () => {
    if (!filePath) { showToast('请先打开 PDF 文件', 'warning'); return; }
    if (!useSelfSigned && !p12Path) { setError('请选择证书文件或使用自签名证书'); return; }
    if (!signerName && useSelfSigned) { setError('请输入签名者名称'); return; }

    setIsSigning(true);
    setError('');
    try {
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const options: PadesSignOptions = {
        signerName: signerName || 'Unknown', reason, location,
        contactInfo: contactInfo || undefined,
        p12Path: useSelfSigned ? undefined : p12Path,
        p12Password: useSelfSigned ? undefined : p12Password,
      };
      if (enableVisibleSig) {
        options.visibleSignature = {
          page: visiblePage,
          rect: { x: visibleX, y: visibleY, width: visibleW, height: visibleH },
          appearanceImage: handwrittenImage || undefined,
          showTimestamp: true,
        };
      }
      const result = await window.verityAPI.signPades(base64, options);
      const savePath = await window.verityAPI.showDialog({
        type: 'save', filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        defaultPath: filePath.replace(/\.pdf$/i, '_signed.pdf'),
      });
      if (!savePath) { setIsSigning(false); return; }
      const sigResult = result as { signedPdf: ArrayBuffer };
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(sigResult.signedPdf)));
      await window.verityAPI.saveFile(signedBase64, savePath);
      showToast('PAdES 签名成功', 'success');
      onClose();
    } catch (err) {
      setError('签名失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally { setIsSigning(false); }
  }, [filePath, signerName, reason, location, contactInfo, p12Path, p12Password, useSelfSigned, enableVisibleSig, visiblePage, visibleX, visibleY, visibleW, visibleH, handwrittenImage]);

  const handleSignBasic = useCallback(async () => {
    if (!filePath) { showToast('请先打开 PDF 文件', 'warning'); return; }
    if (!signerName && useSelfSigned) { setError('请输入签名者名称'); return; }
    setIsSigning(true); setError('');
    try {
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const result = await window.verityAPI.signPDF(base64, {
        signerName: signerName || 'Unknown', reason, location,
        p12Path: useSelfSigned ? undefined : p12Path,
        p12Password: useSelfSigned ? undefined : p12Password,
      });
      const savePath = await window.verityAPI.showDialog({
        type: 'save', filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      });
      if (!savePath) { setIsSigning(false); return; }
      const sigResult = result as { signedPdf: ArrayBuffer };
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(sigResult.signedPdf)));
      await window.verityAPI.saveFile(signedBase64, savePath);
      showToast('签名成功', 'success'); onClose();
    } catch (err) {
      setError('签名失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally { setIsSigning(false); }
  }, [filePath, signerName, reason, location, p12Path, p12Password, useSelfSigned]);

  const handleVerify = useCallback(async () => {
    if (!filePath) return;
    setIsVerifying(true); setVerifyResult(null);
    try {
      const data = await window.verityAPI.readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const result = await window.verityAPI.verifyPades(base64);
      const vr = result as VerifyResult;
      if (!vr.isSigned) {
        const br = await window.verityAPI.verifySignature(base64) as { isSigned: boolean; isValid: boolean; signer?: string; timestamp?: string; message: string };
        setVerifyResult({ isSigned: br.isSigned, isValid: br.isValid, signer: br.signer, timestamp: br.timestamp, documentIntact: true, message: br.message });
      } else { setVerifyResult(vr); }
    } catch (err) {
      setVerifyResult({ isSigned: false, isValid: false, documentIntact: false, message: '验证失败: ' + (err instanceof Error ? err.message : '未知错误') });
    } finally { setIsVerifying(false); }
  }, [filePath]);

  const handleHandwrittenConfirm = useCallback((base64: string) => {
    setHandwrittenImage(base64);
    showToast('手绘签名已保存', 'success');
  }, []);

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
          <div className="signature-tabs">
            <button className={`tab-btn ${activeTab === 'cert' ? 'active' : ''}`} onClick={() => setActiveTab('cert')}>证书签名</button>
            <button className={`tab-btn ${activeTab === 'handwritten' ? 'active' : ''}`} onClick={() => setActiveTab('handwritten')}>手绘签名</button>
            <button className={`tab-btn ${activeTab === 'verify' ? 'active' : ''}`} onClick={() => setActiveTab('verify')}>验证签名</button>
          </div>

          {activeTab === 'cert' && (
            <div className="signature-form">
              <div className="form-group">
                <label>签名方式</label>
                <div className="radio-group">
                  <label className="radio-item"><input type="radio" checked={useSelfSigned} onChange={() => setUseSelfSigned(true)} /><span>自签名证书</span></label>
                  <label className="radio-item"><input type="radio" checked={!useSelfSigned} onChange={() => setUseSelfSigned(false)} /><span>P12/PFX 证书文件</span></label>
                </div>
              </div>
              {useSelfSigned ? (
                <div className="form-group"><label>签名者名称</label><input type="text" className="form-input" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="输入您的姓名" /></div>
              ) : (
                <>
                  <div className="form-group"><label>证书文件</label><div className="file-input-row"><input type="text" className="form-input file-path" value={p12Path} readOnly placeholder="选择 .p12 或 .pfx 文件" /><button className="btn-secondary btn-sm" onClick={handleSelectP12}>浏览</button></div></div>
                  <div className="form-group"><label>证书密码</label><input type="password" className="form-input" value={p12Password} onChange={(e) => setP12Password(e.target.value)} placeholder="输入证书密码" /></div>
                  {certInfo && (
                    <div className="cert-info-panel">
                      <h4>证书信息</h4>
                      <div className="cert-info-row"><span>主题:</span> <span>{certInfo.subject}</span></div>
                      <div className="cert-info-row"><span>颁发者:</span> <span>{certInfo.issuer}</span></div>
                      <div className="cert-info-row"><span>有效期:</span> <span>{new Date(certInfo.validFrom).toLocaleDateString()} - {new Date(certInfo.validTo).toLocaleDateString()}</span></div>
                      <div className="cert-info-row"><span>指纹:</span> <span className="cert-fingerprint">{certInfo.fingerprint}</span></div>
                    </div>
                  )}
                </>
              )}
              <div className="form-group"><label>签名原因</label><input type="text" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：文档审批、合同签署" /></div>
              <div className="form-group"><label>签名位置</label><input type="text" className="form-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如：北京" /></div>
              <div className="form-group"><label>联系方式（可选）</label><input type="text" className="form-input" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="邮箱或电话" /></div>
              <div className="form-group"><label>签名时间</label><input type="text" className="form-input" value={new Date().toLocaleString()} readOnly /></div>
              <div className="form-group"><label className="checkbox-item"><input type="checkbox" checked={enableVisibleSig} onChange={(e) => setEnableVisibleSig(e.target.checked)} /><span>添加可见签名外观</span></label></div>
              {enableVisibleSig && (
                <div className="visible-sig-settings">
                  <div className="form-row"><label>页码</label><input type="number" className="form-input form-input-sm" min={1} max={pageCount} value={visiblePage} onChange={(e) => setVisiblePage(Number(e.target.value))} /></div>
                  <div className="form-row form-row-4">
                    <div><label>X</label><input type="number" className="form-input form-input-sm" value={visibleX} onChange={(e) => setVisibleX(Number(e.target.value))} /></div>
                    <div><label>Y</label><input type="number" className="form-input form-input-sm" value={visibleY} onChange={(e) => setVisibleY(Number(e.target.value))} /></div>
                    <div><label>宽</label><input type="number" className="form-input form-input-sm" value={visibleW} onChange={(e) => setVisibleW(Number(e.target.value))} /></div>
                    <div><label>高</label><input type="number" className="form-input form-input-sm" value={visibleH} onChange={(e) => setVisibleH(Number(e.target.value))} /></div>
                  </div>
                  {handwrittenImage && (<div className="form-group"><label>叠加手绘签名图</label><div className="handwritten-preview"><img src={handwrittenImage} alt="手绘签名" /></div></div>)}
                </div>
              )}
              <div className="sign-actions">
                <button className="btn-primary" onClick={handleSignPades} disabled={isSigning}>{isSigning ? '签名中...' : 'PAdES 签名'}</button>
                <button className="btn-secondary" onClick={handleSignBasic} disabled={isSigning}>基础签名</button>
              </div>
            </div>
          )}

          {activeTab === 'handwritten' && (
            <div className="handwritten-tab">
              <p className="handwritten-hint">使用鼠标或触摸屏在下方区域签名。签名可叠加到证书签名的可见外观上。</p>
              <HandwrittenSignaturePad width={380} height={180} onConfirm={handleHandwrittenConfirm} />
              {handwrittenImage && (<div className="handwritten-saved"><p>✓ 手绘签名已采集</p><img src={handwrittenImage} alt="已保存的手绘签名" style={{ maxWidth: 200 }} /></div>)}
            </div>
          )}

          {activeTab === 'verify' && (
            <div className="verify-tab">
              <button className="btn-primary" onClick={handleVerify} disabled={isVerifying || !filePath}>{isVerifying ? '验证中...' : '验证文档签名'}</button>
              {verifyResult && (
                <div className="verify-result-detail">
                  <div className={`verify-result-header ${verifyResult.isValid ? 'valid' : 'invalid'}`}>
                    <span className="verify-icon">{verifyResult.isValid ? '✓' : '✗'}</span>
                    <span>{verifyResult.message}</span>
                  </div>
                  <div className="verify-detail-list">
                    {verifyResult.signer && (<div className="verify-detail-row"><span className="verify-label">签名者:</span><span className="verify-value">{verifyResult.signer}</span></div>)}
                    {verifyResult.timestamp && (<div className="verify-detail-row"><span className="verify-label">签名时间:</span><span className="verify-value">{new Date(verifyResult.timestamp).toLocaleString()}</span></div>)}
                    <div className="verify-detail-row"><span className="verify-label">文档完整性:</span><span className={`verify-value ${verifyResult.documentIntact ? 'text-success' : 'text-danger'}`}>{verifyResult.documentIntact ? '未被篡改' : '可能被修改'}</span></div>
                    {verifyResult.certificateInfo && (
                      <>
                        <hr className="verify-divider" /><h4>证书详情</h4>
                        <div className="verify-detail-row"><span className="verify-label">主题:</span><span className="verify-value">{verifyResult.certificateInfo.subject}</span></div>
                        <div className="verify-detail-row"><span className="verify-label">颁发者:</span><span className="verify-value">{verifyResult.certificateInfo.issuer}</span></div>
                        <div className="verify-detail-row"><span className="verify-label">有效期:</span><span className="verify-value">{new Date(verifyResult.certificateInfo.validFrom).toLocaleDateString()} - {new Date(verifyResult.certificateInfo.validTo).toLocaleDateString()}</span></div>
                        <div className="verify-detail-row"><span className="verify-label">指纹:</span><span className="verify-value cert-fingerprint">{verifyResult.certificateInfo.fingerprint}</span></div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="dialog-footer"><button className="btn-secondary" onClick={onClose}>关闭</button></div>
      </div>
    </div>
  );
};
