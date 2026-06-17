import React, { useState, useEffect, useCallback } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import type { Annotation, AnnotationStyle } from '@/types';

const PRESET_COLORS = [
  '#FF0000', '#FF6600', '#FFCC00', '#33CC00', '#0099FF',
  '#6633CC', '#FF3399', '#000000', '#666666', '#FFFFFF',
];

const DASH_OPTIONS = [
  { label: '实线', value: [] },
  { label: '虚线', value: [8, 4] },
  { label: '点线', value: [2, 4] },
  { label: '点划线', value: [8, 4, 2, 4] },
];

const TYPE_LABELS: Record<string, string> = {
  rect: '矩形', ellipse: '椭圆', arrow: '箭头', line: '直线',
  freehand: '画笔', text: '文本', highlight: '高亮', stickyNote: '便签',
  stamp: '印章', signature: '签名',
};

/** 数字输入组件 */
const NumInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}> = ({ label, value, onChange, min, max, step = 0.01, suffix }) => (
  <div className="prop-row">
    <label className="prop-label">{label}</label>
    <input
      type="number"
      className="prop-input"
      value={Number.isFinite(value) ? value.toFixed(3) : '0'}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
    />
    {suffix && <span className="prop-suffix">{suffix}</span>}
  </div>
);

/** 颜色选择组件 */
const ColorPicker: React.FC<{
  label: string;
  value: string;
  onChange: (c: string) => void;
  allowTransparent?: boolean;
}> = ({ label, value, onChange, allowTransparent }) => (
  <div className="prop-color-section">
    <label className="prop-label">{label}</label>
    <div className="prop-color-row">
      {allowTransparent && (
        <button
          className={`color-swatch-sm ${(value === 'transparent' || value === 'none') ? 'active' : ''}`}
          style={{ background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 6px 6px' }}
          onClick={() => onChange('transparent')}
          title="透明"
        />
      )}
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          className={`color-swatch-sm ${value === c ? 'active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
    <input type="color" className="prop-color-input" value={value === 'transparent' ? '#ffffff' : value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

export const PropertyPanel: React.FC = () => {
  const { selectedIds, annotations, updateAnnotation, removeAnnotation, clearSelection } = useAnnotationStore();
  const [ann, setAnn] = useState<Annotation | null>(null);

  // 当选中变化时更新
  useEffect(() => {
    if (selectedIds.length === 1) {
      const found = annotations.find((a) => a.id === selectedIds[0]) || null;
      setAnn(found);
    } else {
      setAnn(null);
    }
  }, [selectedIds, annotations]);

  const update = useCallback((changes: Partial<Annotation>) => {
    if (!ann) return;
    updateAnnotation(ann.id, changes);
  }, [ann, updateAnnotation]);

  const updateStyle = useCallback((styleChanges: Partial<AnnotationStyle>) => {
    if (!ann) return;
    updateAnnotation(ann.id, { style: { ...ann.style, ...styleChanges } });
  }, [ann, updateAnnotation]);

  if (!ann) return null;

  const isTextType = ann.type === 'text' || ann.type === 'stickyNote';
  const hasEndPoint = ann.type === 'arrow' || ann.type === 'line';
  const hasPoints = ann.type === 'freehand';

  return (
    <div className="property-panel">
      {/* 标题 */}
      <div className="prop-header">
        <span className="prop-type">{TYPE_LABELS[ann.type] || ann.type}</span>
        <span className="prop-page">P{ann.page}</span>
        <button className="prop-close-btn" onClick={clearSelection} title="取消选择">&times;</button>
      </div>

      <div className="prop-body">
        {/* 位置 */}
        <div className="prop-section">
          <div className="prop-section-title">位置</div>
          <div className="prop-grid">
            <NumInput label="X" value={ann.position.x} onChange={(v) => update({ position: { ...ann.position, x: v } })} />
            <NumInput label="Y" value={ann.position.y} onChange={(v) => update({ position: { ...ann.position, y: v } })} />
          </div>
        </div>

        {/* 尺寸 (非线段/画笔类型) */}
        {!hasEndPoint && !hasPoints && (
          <div className="prop-section">
            <div className="prop-section-title">尺寸</div>
            <div className="prop-grid">
              <NumInput label="宽" value={ann.size.width} onChange={(v) => update({ size: { ...ann.size, width: Math.max(0.001, v) } })} />
              <NumInput label="高" value={ann.size.height} onChange={(v) => update({ size: { ...ann.size, height: Math.max(0.001, v) } })} />
            </div>
          </div>
        )}

        {/* 终点 (箭头/直线) */}
        {hasEndPoint && ann.endPoint && (
          <div className="prop-section">
            <div className="prop-section-title">终点</div>
            <div className="prop-grid">
              <NumInput label="X" value={ann.endPoint.x} onChange={(v) => update({ endPoint: { ...ann.endPoint, x: v } })} />
              <NumInput label="Y" value={ann.endPoint.y} onChange={(v) => update({ endPoint: { ...ann.endPoint, y: v } })} />
            </div>
          </div>
        )}

        {/* 描边颜色 */}
        <div className="prop-section">
          <ColorPicker label="描边颜色" value={ann.style.stroke} onChange={(c) => updateStyle({ stroke: c })} />
        </div>

        {/* 填充颜色 (不适用于线/画笔/高亮) */}
        {!['line', 'freehand', 'highlight'].includes(ann.type) && (
          <div className="prop-section">
            <ColorPicker label="填充颜色" value={ann.style.fill} onChange={(c) => updateStyle({ fill: c })} allowTransparent />
          </div>
        )}

        {/* 线宽 */}
        <div className="prop-section">
          <div className="prop-section-title">线宽: {ann.style.strokeWidth}px</div>
          <input
            type="range" className="prop-range"
            min="0.5" max="12" step="0.5"
            value={ann.style.strokeWidth}
            onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })}
          />
        </div>

        {/* 透明度 */}
        <div className="prop-section">
          <div className="prop-section-title">透明度: {Math.round(ann.style.opacity * 100)}%</div>
          <input
            type="range" className="prop-range"
            min="0.05" max="1" step="0.05"
            value={ann.style.opacity}
            onChange={(e) => updateStyle({ opacity: Number(e.target.value) })}
          />
        </div>

        {/* 虚线 (不适用于画笔/高亮) */}
        {!['freehand', 'highlight', 'stickyNote'].includes(ann.type) && (
          <div className="prop-section">
            <div className="prop-section-title">线型</div>
            <div className="prop-dash-group">
              {DASH_OPTIONS.map((opt) => {
                const isActive = JSON.stringify(ann.style.dash || []) === JSON.stringify(opt.value);
                return (
                  <button
                    key={opt.label}
                    className={`prop-dash-btn ${isActive ? 'active' : ''}`}
                    onClick={() => updateStyle({ dash: opt.value })}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 文本内容 */}
        {isTextType && (
          <div className="prop-section">
            <div className="prop-section-title">内容</div>
            <textarea
              className="prop-textarea"
              value={ann.content || ''}
              onChange={(e) => update({ content: e.target.value })}
              rows={3}
              placeholder="输入内容..."
            />
          </div>
        )}

        {/* 字号 (仅文本) */}
        {ann.type === 'text' && (
          <div className="prop-section">
            <div className="prop-section-title">字号: {ann.style.fontSize || 14}px</div>
            <input
              type="range" className="prop-range"
              min="8" max="72" step="1"
              value={ann.style.fontSize || 14}
              onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
            />
          </div>
        )}

        {/* 删除按钮 */}
        <div className="prop-section prop-actions">
          <button className="prop-delete-btn" onClick={() => { removeAnnotation(ann.id); clearSelection(); }}>
            删除标注
          </button>
        </div>
      </div>
    </div>
  );
};
