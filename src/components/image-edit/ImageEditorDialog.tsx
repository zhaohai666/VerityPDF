import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Text, Group } from 'react-konva';
import type { PageImageInfo } from '@/types/electron';

interface ImageEditorDialogProps {
  pdfData: string;
  onClose: () => void;
}

/**
 * PDF 图片编辑器对话框
 * 使用 Konva Canvas 显示 PDF 页面中的图片，支持选择和替换
 */
export const ImageEditorDialog: React.FC<ImageEditorDialogProps> = ({ pdfData, onClose }) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [images, setImages] = useState<PageImageInfo[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 });
  const [imagePreviews, setImagePreviews] = useState<Map<string, HTMLImageElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载页面图片
  const loadPageImages = useCallback(async (idx: number) => {
    if (!pdfData) return;
    setLoading(true);
    setSelectedRef(null);
    try {
      const [imgs, lay] = await Promise.all([
        window.verityAPI.extractPageImages(pdfData, idx),
        window.verityAPI.getPageImageLayout(pdfData, idx),
      ]);
      setImages(imgs);

      // 计算页面尺寸（从 layout 推断）
      if (lay.length > 0) {
        const maxX = Math.max(...lay.map(l => l.x + l.width));
        const maxY = Math.max(...lay.map(l => l.y + l.height));
        setPageSize({
          width: Math.max(595, maxX + 20),
          height: Math.max(842, maxY + 20),
        });
      }

      // 生成图片预览
      const previews = new Map<string, HTMLImageElement>();
      for (const img of imgs) {
        try {
          const htmlImg = new Image();
          const mime = img.format === 'png' ? 'image/png' : 'image/jpeg';
          htmlImg.src = `data:${mime};base64,${img.data}`;
          await new Promise<void>((resolve) => {
            htmlImg.onload = () => resolve();
            htmlImg.onerror = () => resolve();
          });
          previews.set(img.ref, htmlImg);
        } catch { /* skip */ }
      }
      setImagePreviews(previews);
    } catch (err) {
      console.error('加载图片失败:', err);
    } finally {
      setLoading(false);
    }
  }, [pdfData]);

  useEffect(() => {
    loadPageImages(pageIndex);
  }, [pageIndex, loadPageImages]);

  // 替换图片
  const handleReplaceImage = useCallback(async (file: File) => {
    if (!selectedRef || !pdfData) return;
    setReplacing(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 提取 base64 数据
      const base64 = dataUrl.split(',')[1];
      const format = file.type === 'image/png' ? 'png' : 'jpeg';

      const result = await window.verityAPI.replacePageImage(
        pdfData, pageIndex, selectedRef, base64, format
      );

      if (result.replacedCount > 0) {
        // 更新 pdfData 并重新加载
        window.dispatchEvent(new CustomEvent('verity:pdf-reloaded', { detail: { pdfData: result.pdfData } }));
        // 重新加载当前页图片
        await loadPageImages(pageIndex);
      }
    } catch (err) {
      console.error('替换图片失败:', err);
    } finally {
      setReplacing(false);
    }
  }, [selectedRef, pdfData, pageIndex, loadPageImages]);

  // 文件选择
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleReplaceImage(file);
    // 重置 input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleReplaceImage]);

  // 缩放以适应视口
  const maxCanvasWidth = 600;
  const maxCanvasHeight = 700;
  const scale = Math.min(
    maxCanvasWidth / pageSize.width,
    maxCanvasHeight / pageSize.height,
    1
  );

  const canvasWidth = pageSize.width * scale;
  const canvasHeight = pageSize.height * scale;

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-content" style={{ width: '750px', maxHeight: '90vh' }}>
        <div className="dialog-header">
          <h3>PDF 图片编辑</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 页面导航 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn-secondary"
              disabled={pageIndex <= 0 || loading}
              onClick={() => setPageIndex(p => p - 1)}
            >
              上一页
            </button>
            <span>
              第 {pageIndex + 1} 页
            </span>
            <button
              className="btn-secondary"
              disabled={loading}
              onClick={() => setPageIndex(p => p + 1)}
            >
              下一页
            </button>
            <span style={{ color: '#888', fontSize: '12px' }}>
              共 {images.length} 张图片
            </span>
          </div>

          {/* Canvas 画布 */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>
          ) : images.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
              此页面没有找到图片
            </div>
          ) : (
            <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden', background: '#f5f5f5' }}>
              <Stage width={canvasWidth} height={canvasHeight}>
                <Layer>
                  {/* 页面背景 */}
                  <Rect
                    x={0} y={0}
                    width={canvasWidth}
                    height={canvasHeight}
                    fill="white"
                    stroke="#ccc"
                    strokeWidth={1}
                  />

                  {/* 图片 */}
                  {images.map((img) => {
                    const isSelected = selectedRef === img.ref;
                    const preview = imagePreviews.get(img.ref);

                    return (
                      <Group
                        key={img.ref}
                        x={img.x * scale}
                        y={img.y * scale}
                        onClick={() => setSelectedRef(img.ref)}
                        onTap={() => setSelectedRef(img.ref)}
                      >
                        {preview ? (
                          <KonvaImage
                            image={preview}
                            width={img.width * scale}
                            height={img.height * scale}
                          />
                        ) : (
                          <Rect
                            width={img.width * scale}
                            height={img.height * scale}
                            fill="#eee"
                          />
                        )}
                        {/* 选中边框 */}
                        {isSelected && (
                          <Rect
                            width={img.width * scale}
                            height={img.height * scale}
                            stroke="#2196F3"
                            strokeWidth={2}
                            dash={[5, 3]}
                          />
                        )}
                        {/* 标签 */}
                        <Text
                          y={-14}
                          text={`${img.ref} (${img.originalWidth}x${img.originalHeight})`}
                          fontSize={10}
                          fill={isSelected ? '#2196F3' : '#666'}
                        />
                      </Group>
                    );
                  })}
                </Layer>
              </Stage>
            </div>
          )}

          {/* 操作区 */}
          {selectedRef && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', background: '#e3f2fd', borderRadius: '4px' }}>
              <span style={{ fontSize: '13px' }}>
                已选择: <strong>{selectedRef}</strong>
              </span>
              <button
                className="btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={replacing}
              >
                {replacing ? '替换中...' : '替换图片'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => setSelectedRef(null)}
              >
                取消选择
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>
          )}

          {/* 图片列表 */}
          {images.length > 0 && (
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <th style={{ textAlign: 'left', padding: '4px' }}>引用</th>
                    <th style={{ textAlign: 'left', padding: '4px' }}>位置</th>
                    <th style={{ textAlign: 'left', padding: '4px' }}>尺寸</th>
                    <th style={{ textAlign: 'left', padding: '4px' }}>格式</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((img) => (
                    <tr
                      key={img.ref}
                      style={{
                        cursor: 'pointer',
                        background: selectedRef === img.ref ? '#e3f2fd' : 'transparent',
                      }}
                      onClick={() => setSelectedRef(img.ref)}
                    >
                      <td style={{ padding: '4px' }}>{img.ref}</td>
                      <td style={{ padding: '4px' }}>({img.x}, {img.y})</td>
                      <td style={{ padding: '4px' }}>{img.originalWidth} x {img.originalHeight}</td>
                      <td style={{ padding: '4px' }}>{img.format.toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default ImageEditorDialog;
