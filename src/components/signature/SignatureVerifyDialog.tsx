import React, { useState, useEffect } from 'react';
import type { SignatureChainVerifyResult, ChainCertInfo } from '@/types/electron';

interface Props {
  pdfData: string;
  onClose: () => void;
}

export const SignatureVerifyDialog: React.FC<Props> = ({ pdfData, onClose }) => {
  const [result, setResult] = useState<SignatureChainVerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => { verify(); }, []);

  const verify = async () => {
    try {
      const data = await window.verityAPI.verifySignatureChain(pdfData);
      setResult(data as SignatureChainVerifyResult);
      setExpanded(new Set((data as SignatureChainVerifyResult).signatures.map((_, i) => i)));
    } catch (e: any) { setError(e.message || '验证失败'); }
    finally { setLoading(false); }
  };

  const toggleExpand = (i: number) => {
    const next = new Set(expanded);
    next.has(i) ? next.delete(i) : next.add(i);
    setExpanded(next);
  };

  const CertItem: React.FC<{ cert: ChainCertInfo; depth: number }> = ({ cert, depth }) => (
    <div style={{ marginLeft: depth * 16, padding: '6px 8px', borderLeft: '2px solid #ddd', marginBottom: 4 }}>
      <div style={{ fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500 }}>{cert.subject || '未知主体'}</span>
        {cert.isExpired && <span className="badge badge-danger">已过期</span>}
        {cert.isSelfSigned && <span className="badge badge-info">自签名</span>}
      </div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
        签发者: {cert.issuer || '未知'}
      </div>
      <div style={{ fontSize: 11, color: '#888' }}>
        有效期: {new Date(cert.validFrom).toLocaleDateString()} ~ {new Date(cert.validTo).toLocaleDateString()}
      </div>
      <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace' }}>
        指纹: {cert.fingerprint?.slice(0, 32)}...
      </div>
    </div>
  );

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog-box" style={{ maxWidth: 560 }}>
        <div className="dialog-header">
          <h3>数字签名验证</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {error && <div className="error-msg">{error}</div>}
          {loading ? (
            <p>正在验证签名...</p>
          ) : !result ? (
            <p>验证失败</p>
          ) : !result.isSigned ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#888' }}>
              <div style={{ fontSize: 32 }}>🔓</div>
              <p>{result.overallMessage}</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {result.isValid ? (
                  <span style={{ color: '#52c41a', fontWeight: 600 }}>✓ 签名有效</span>
                ) : (
                  <span style={{ color: '#ff4d4f', fontWeight: 600 }}>✗ 签名存在问题</span>
                )}
                <span style={{ fontSize: 12, color: '#888' }}>
                  文档完整性: {result.documentIntact ? '完整' : '异常'}
                </span>
              </div>

              <p style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>{result.overallMessage}</p>

              {result.signatures.map((sig, i) => (
                <div key={i} style={{ border: '1px solid #e0e0e0', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
                  <div onClick={() => toggleExpand(i)} style={{ padding: '8px 12px', cursor: 'pointer', background: '#f8f8f8', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{expanded.has(i) ? '▼' : '▶'}</span>
                    <span style={{ fontWeight: 500 }}>{sig.signer || '未知签名者'}</span>
                    <span className={`badge ${sig.isValid ? 'badge-success' : 'badge-danger'}`}>
                      {sig.isValid ? '有效' : '无效'}
                    </span>
                    {sig.timestamp && <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>{new Date(sig.timestamp).toLocaleString()}</span>}
                  </div>
                  {expanded.has(i) && (
                    <div style={{ padding: 12 }}>
                      <div style={{ fontSize: 12, marginBottom: 8 }}>{sig.message}</div>
                      {sig.hashAlgorithm && (
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                          哈希算法: {sig.hashAlgorithm}
                        </div>
                      )}
                      {sig.certificateChain.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>证书链 ({sig.certificateChain.length})</div>
                          {sig.certificateChain.map((cert, j) => (
                            <CertItem key={j} cert={cert} depth={j} />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};
