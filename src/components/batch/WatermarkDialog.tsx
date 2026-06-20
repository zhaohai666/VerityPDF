import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePdfStore } from '@/stores/pdfStore';
import { useUIStore } from '@/stores/uiStore';

interface WatermarkDialogProps {
  open: boolean;
  onClose: () => void;
}

type WmTab = 'watermark' | 'pagenum' | 'header';

export const WatermarkDialog: React.FC<WatermarkDialogProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<WmTab>('watermark');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ value: 0, message: '' });

  // 水印选项
  const [wmType, setWmType] = useState<'text' | 'image'>('text');
  const [wmText, setWmText] = useState('VerityPDF');
  const [wmOpacity, setWmOpacity] = useState(0.3);
  const [wmRotation, setWmRotation] = useState(45);
  const [wmFontSize, setWmFontSize] = useState(48);
  const [wmColor, setWmColor] = useState('#888888');
  const [wmPosition, setWmPosition] = useState<'center' | 'tile'>('center');
  const [wmTileSpacing, setWmTileSpacing] = useState(150);
  const [wmImageData, setWmImageData] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 页码选项
  const [pnPosition, setPnPosition] = useState<'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'>('bottom-center');
  const [pnStyle, setPnStyle] = useState<'arabic' | 'roman' | 'dash' | 'of-total'>('arabic');
  const [pnFontSize, setPnFontSize] = useState(12);
  const [pnColor, setPnColor] = useState('#333333');
  const [pnStartIndex, setPnStartIndex] = useState(1);

  // 页眉页脚选项
  const [hfHeaderText, setHfHeaderText] = useState('');
  const [hfFooterText, setHfFooterText] = useState('第 {page} 页 / 共 {total} 页');
  const [hfFontSize, setHfFontSize] = useState(10);
  const [hfColor, setHfColor] = useState('#666666');

  const { filePath } = usePdfStore();
  const showToast = useUIStore((s) => s.showToast);

  // 监听进度
  useEffect(() => {
    if (!open) return;
    const unsub = window.verityAPI.onBatchProgress((info) => {
      setProgress({ value: info.progress, message: info.message });
    });
    return unsub;
  }, [open]);

  const getPdfBase64 = useCallback(async (): Promise<string> => {
    if (!filePath) throw new Error('未打开文件');
    const data = await window.verityAPI.readFile(filePath);
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, [filePath]);

  const saveAndReload = useCallback(async (result: ArrayBuffer) => {
    if (!filePath) return;
    const base64 = Buffer.from(result).toString('base64');
    await window.verityAPI.saveFile(base64, filePath);
    window.dispatchEvent(new CustomEvent('verity:reloadPdf'));
    showToast('操作已应用', 'success');
  }, [filePath, showToast]);

  // 选择图片文件
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setWmImageData(reader.result as string);
      setWmType('image');
    };
    reader.readAsDataURL(file);
  }, []);

  // 添加水印
  const handleAddWatermark = useCallback(async () => {
    if (isProcessing) return;
    if (wmType === 'text' && !wmText.trim()) {
      showToast('请输入水印文字', 'error');
      return;
    }
    if (wmType === 'image' && !wmImageData) {
      showToast('请选择水印图片', 'error');
      return;
    }
    setIsProcessing(true);
    setProgress({ value: 0, message: '添加水印...' });
    try {
      const base64 = await getPdfBase64();
      const result = await window.verityAPI.addWatermark(base64, {
        type: wmType,
        content: wmType === 'text' ? wmText : wmImageData,
        opacity: wmOpacity,
        rotation: wmRotation,
        fontSize: wmFontSize,
        color: wmColor,
        position: wmPosition,
        tileSpacing: wmTileSpacing,
      });
      await saveAndReload(result);
      onClose();
    } catch (err) {
      showToast('添加水印失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, wmType, wmText, wmImageData, wmOpacity, wmRotation, wmFontSize, wmColor, wmPosition, wmTileSpacing, getPdfBase64, saveAndReload, showToast, onClose]);

  // 添加页码
  const handleAddPageNumbers = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProgress({ value: 0, message: '添加页码...' });
    try {
      const base64 = await getPdfBase64();
      const result = await window.verityAPI.addPageNumbers(base64, {
        position: pnPosition,
        style: pnStyle,
        fontSize: pnFontSize,
        color: pnColor,
        startIndex: pnStartIndex,
      });
      await saveAndReload(result);
      onClose();
    } catch (err) {
      showToast('添加页码失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, pnPosition, pnStyle, pnFontSize, pnColor, pnStartIndex, getPdfBase64, saveAndReload, showToast, onClose]);

  // 添加页眉页脚
  const handleAddHeaderFooter = useCallback(async () => {
    if (isProcessing) return;
    if (!hfHeaderText.trim() && !hfFooterText.trim()) {
      showToast('请输入页眉或页脚文字', 'error');
      return;
    }
    setIsProcessing(true);
    setProgress({ value: 0, message: '添加页眉页脚...' });
    try {
      const base64 = await getPdfBase64();
      const result = await window.verityAPI.addHeaderFooter(base64, {
        headerText: hfHeaderText || undefined,
        footerText: hfFooterText || undefined,
        fontSize: hfFontSize,
        color: hfColor,
      });
      await saveAndReload(result);
      onClose();
    } catch (err) {
      showToast('添加页眉页脚失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, hfHeaderText, hfFooterText, hfFontSize, hfColor, getPdfBase64, saveAndReload, showToast, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog watermark-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>水印 / 页码 / 页眉页脚</h3>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>

        <div className="batch-tabs">
          <button className={`batch-tab ${activeTab === 'watermark' ? 'active' : ''}`} onClick={() => setActiveTab('watermark')}>水印</button>
          <button className={`batch-tab ${activeTab === 'pagenum' ? 'active' : ''}`} onClick={() => setActiveTab('pagenum')}>页码</button>
          <button className={`batch-tab ${activeTab === 'header' ? 'active' : ''}`} onClick={() => setActiveTab('header')}>页眉页脚</button>
        </div>

        <div className="dialog-body">
          {/* 水印 */}
          {activeTab === 'watermark' && (
            <div className="wm-section">
              <div className="form-group">
                <label>水印类型</label>
                <div className="wm-type-toggle">
                  <button className={`wm-type-btn ${wmType === 'text' ? 'active' : ''}`} onClick={() => setWmType('text')}>文字</button>
                  <button className={`wm-type-btn ${wmType === 'image' ? 'active' : ''}`} onClick={() => { setWmType('image'); imageInputRef.current?.click(); }}>图片</button>
                </div>
                <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleImageSelect} />
              </div>

              {wmType === 'text' && (
                <div className="form-group">
                  <label>水印文字</label>
                  <input type="text" className="form-input" value={wmText} onChange={(e) => setWmText(e.target.value)} placeholder="输入水印文字" />
                </div>
              )}
              {wmType === 'image' && wmImageData && (
                <div className="form-group">
                  <label>水印图片预览</label>
                  <div className="wm-image-preview">
                    <img src={wmImageData} alt="水印预览" style={{ maxWidth: 120, maxHeight: 60 }} />
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group form-group-half">
                  <label>字号: {wmFontSize}pt</label>
                  <input type="range" min="12" max="120" step="2" value={wmFontSize} onChange={(e) => setWmFontSize(Number(e.target.value))} className="form-range" />
                </div>
                <div className="form-group form-group-half">
                  <label>颜色</label>
                  <input type="color" value={wmColor} onChange={(e) => setWmColor(e.target.value)} className="form-color" />
                </div>
              </div>

              <div className="form-group">
                <label>透明度: {Math.round(wmOpacity * 100)}%</label>
                <input type="range" min="0.05" max="1" step="0.05" value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} className="form-range" />
              </div>

              <div className="form-group">
                <label>旋转角度: {wmRotation}°</label>
                <input type="range" min="-90" max="90" step="5" value={wmRotation} onChange={(e) => setWmRotation(Number(e.target.value))} className="form-range" />
              </div>

              <div className="form-group">
                <label>位置模式</label>
                <div className="wm-position-toggle">
                  <button className={`wm-pos-btn ${wmPosition === 'center' ? 'active' : ''}`} onClick={() => setWmPosition('center')}>居中</button>
                  <button className={`wm-pos-btn ${wmPosition === 'tile' ? 'active' : ''}`} onClick={() => setWmPosition('tile')}>平铺</button>
                </div>
              </div>

              {wmPosition === 'tile' && (
                <div className="form-group">
                  <label>平铺间距: {wmTileSpacing}pt</label>
                  <input type="range" min="80" max="400" step="10" value={wmTileSpacing} onChange={(e) => setWmTileSpacing(Number(e.target.value))} className="form-range" />
                </div>
              )}
            </div>
          )}

          {/* 页码 */}
          {activeTab === 'pagenum' && (
            <div className="wm-section">
              <div className="form-group">
                <label>位置</label>
                <div className="pn-position-grid">
                  {([
                    { value: 'top-left', label: '顶部左' },
                    { value: 'top-center', label: '顶部居中' },
                    { value: 'top-right', label: '顶部右' },
                    { value: 'bottom-left', label: '底部左' },
                    { value: 'bottom-center', label: '底部居中' },
                    { value: 'bottom-right', label: '底部右' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      className={`pn-pos-btn ${pnPosition === value ? 'active' : ''}`}
                      onClick={() => setPnPosition(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>样式</label>
                <div className="pn-style-options">
                  {([
                    { value: 'arabic', label: '1, 2, 3...' },
                    { value: 'roman', label: 'I, II, III...' },
                    { value: 'dash', label: '- 1 -' },
                    { value: 'of-total', label: '第1页/共N页' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      className={`pn-style-btn ${pnStyle === value ? 'active' : ''}`}
                      onClick={() => setPnStyle(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group form-group-half">
                  <label>字号: {pnFontSize}pt</label>
                  <input type="range" min="8" max="24" step="1" value={pnFontSize} onChange={(e) => setPnFontSize(Number(e.target.value))} className="form-range" />
                </div>
                <div className="form-group form-group-half">
                  <label>颜色</label>
                  <input type="color" value={pnColor} onChange={(e) => setPnColor(e.target.value)} className="form-color" />
                </div>
              </div>

              <div className="form-group">
                <label>起始编号</label>
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={pnStartIndex}
                  onChange={(e) => setPnStartIndex(Math.max(1, Number(e.target.value)))}
                  className="form-input"
                  style={{ width: 100 }}
                />
              </div>
            </div>
          )}

          {/* 页眉页脚 */}
          {activeTab === 'header' && (
            <div className="wm-section">
              <div className="form-group">
                <label>页眉文字</label>
                <input
                  type="text"
                  className="form-input"
                  value={hfHeaderText}
                  onChange={(e) => setHfHeaderText(e.target.value)}
                  placeholder="输入页眉文字（留空则不添加）"
                />
              </div>

              <div className="form-group">
                <label>页脚文字</label>
                <input
                  type="text"
                  className="form-input"
                  value={hfFooterText}
                  onChange={(e) => setHfFooterText(e.target.value)}
                  placeholder="输入页脚文字（留空则不添加）"
                />
                <p className="form-hint">可用变量: {'{page}'} = 当前页码, {'{total}'} = 总页数, {'{date}'} = 当前日期</p>
              </div>

              <div className="form-row">
                <div className="form-group form-group-half">
                  <label>字号: {hfFontSize}pt</label>
                  <input type="range" min="8" max="20" step="1" value={hfFontSize} onChange={(e) => setHfFontSize(Number(e.target.value))} className="form-range" />
                </div>
                <div className="form-group form-group-half">
                  <label>颜色</label>
                  <input type="color" value={hfColor} onChange={(e) => setHfColor(e.target.value)} className="form-color" />
                </div>
              </div>
            </div>
          )}

          {/* 进度条 */}
          {isProcessing && (
            <div className="batch-progress">
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${Math.round(progress.value * 100)}%` }} />
              </div>
              <p className="progress-message">{progress.message}</p>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isProcessing}>取消</button>
          {activeTab === 'watermark' && (
            <button className="btn-primary" onClick={handleAddWatermark} disabled={isProcessing}>添加水印</button>
          )}
          {activeTab === 'pagenum' && (
            <button className="btn-primary" onClick={handleAddPageNumbers} disabled={isProcessing}>添加页码</button>
          )}
          {activeTab === 'header' && (
            <button className="btn-primary" onClick={handleAddHeaderFooter} disabled={isProcessing}>添加页眉页脚</button>
          )}
        </div>
      </div>
    </div>
  );
};
