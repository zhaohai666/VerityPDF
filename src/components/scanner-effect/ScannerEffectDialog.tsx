import React, { useState } from 'react';
import { ScannerEffectResult } from '@/types/electron';

interface ScannerEffectDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const ScannerEffectDialog: React.FC<ScannerEffectDialogProps> = ({ pdfData, onClose }) => {
  const [options, setOptions] = useState({
    dpi: 300,
    grayscale: false,
    contrast: 1.0,
    brightness: 1.0,
    addNoise: false,
    deskew: false,
  });
  const [result, setResult] = useState<ScannerEffectResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApplyEffect = async () => {
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const res = await window.verityAPI.applyScannerEffect(pdfData, options);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply scanner effect');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;

    try {
      const filePath = await window.verityAPI.showDialog({
        type: 'save',
        defaultPath: 'scanned-output.pdf',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });

      if (!filePath) return;

      const buffer = new Uint8Array(result.pdfData);
      const base64 = btoa(String.fromCharCode(...buffer));
      await window.verityAPI.saveFile(filePath, base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>Scanner Effect</h2>
          <button onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>DPI:</label>
            <select
              value={options.dpi}
              onChange={(e) => setOptions({ ...options, dpi: Number(e.target.value) })}
            >
              <option value={150}>150</option>
              <option value={200}>200</option>
              <option value={300}>300</option>
              <option value={600}>600</option>
            </select>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={options.grayscale}
                onChange={(e) => setOptions({ ...options, grayscale: e.target.checked })}
              />
              Grayscale
            </label>
          </div>

          <div className="form-group">
            <label>Contrast: {options.contrast.toFixed(1)}</label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={options.contrast}
              onChange={(e) => setOptions({ ...options, contrast: Number(e.target.value) })}
            />
          </div>

          <div className="form-group">
            <label>Brightness: {options.brightness.toFixed(1)}</label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={options.brightness}
              onChange={(e) => setOptions({ ...options, brightness: Number(e.target.value) })}
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={options.addNoise}
                onChange={(e) => setOptions({ ...options, addNoise: e.target.checked })}
              />
              Add Noise
            </label>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={options.deskew}
                onChange={(e) => setOptions({ ...options, deskew: e.target.checked })}
              />
              Deskew
            </label>
          </div>

          {result && (
            <div className="result-info">
              <p>Pages processed: {result.processedPages}</p>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleApplyEffect} disabled={processing}>
            {processing ? 'Processing...' : 'Apply Effect'}
          </button>
          {result && (
            <button onClick={handleSave}>Save PDF</button>
          )}
        </div>
      </div>
    </div>
  );
};
