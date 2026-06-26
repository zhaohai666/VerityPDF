import React, { useState } from 'react';
import { InvertColorsResult } from '@/types/electron';

interface InvertColorsDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const InvertColorsDialog: React.FC<InvertColorsDialogProps> = ({ pdfData, onClose }) => {
  const [options, setOptions] = useState({
    allPages: true,
    specificPages: '',
  });
  const [result, setResult] = useState<InvertColorsResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInvert = async () => {
    setProcessing(true);
    setError(null);
    try {
      const apiOptions = options.allPages
        ? {}
        : {
            pageIndices: options.specificPages
              .split(',')
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n)),
          };
      const res = await window.verityAPI.invertColors(pdfData, apiOptions);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to invert colors');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        defaultPath: 'inverted.pdf',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (savePath) {
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(result.pdfData))
        );
        await window.verityAPI.saveFile(savePath, base64);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save file');
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>Invert Colors</h2>
        </div>
        <div className="dialog-body">
          <div className="options">
            <label>
              <input
                type="radio"
                name="pageSelection"
                checked={options.allPages}
                onChange={() => setOptions({ ...options, allPages: true })}
              />
              All Pages
            </label>
            <div className="specific-pages">
              <label>
                <input
                  type="radio"
                  name="pageSelection"
                  checked={!options.allPages}
                  onChange={() => setOptions({ ...options, allPages: false })}
                />
                Specific Pages:
              </label>
              <input
                type="text"
                value={options.specificPages}
                onChange={(e) => setOptions({ ...options, specificPages: e.target.value })}
                placeholder="e.g., 0, 2, 4"
                disabled={options.allPages}
              />
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          {result && (
            <div className="result">
              <p>Processed {result.processedPages} pages</p>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button onClick={handleInvert} disabled={processing}>
            {processing ? 'Processing...' : 'Invert'}
          </button>
          {result && (
            <button onClick={handleSave}>Save</button>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
