import React, { useState } from 'react';
import { RemoveImagesResult } from '@/types/electron';

interface RemoveImagesDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const RemoveImagesDialog: React.FC<RemoveImagesDialogProps> = ({ pdfData, onClose }) => {
  const [options, setOptions] = useState({
    allPages: true,
    specificPages: '',
  });
  const [result, setResult] = useState<RemoveImagesResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemoveImages = async () => {
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const apiOptions = options.allPages
        ? {}
        : {
            pageIndices: options.specificPages
              .split(',')
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n)),
          };
      const res = await window.verityAPI.removeImages(pdfData, apiOptions);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove images');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;

    try {
      const filePath = await window.verityAPI.showDialog({
        type: 'save',
        defaultPath: 'output.pdf',
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
          <h2>Remove Images</h2>
          <button onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>
              <input
                type="radio"
                checked={options.allPages}
                onChange={() => setOptions({ ...options, allPages: true })}
              />
              Remove images from all pages
            </label>
          </div>

          <div className="form-group">
            <label>
              <input
                type="radio"
                checked={!options.allPages}
                onChange={() => setOptions({ ...options, allPages: false })}
              />
              Remove images from specific pages:
            </label>
            <input
              type="text"
              value={options.specificPages}
              onChange={(e) => setOptions({ ...options, specificPages: e.target.value })}
              placeholder="e.g., 1,3,5"
              disabled={options.allPages}
            />
          </div>

          {result && (
            <div className="result-info">
              <p>Images removed: {result.removedCount}</p>
              <p>Pages processed: {result.pagesProcessed}</p>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleRemoveImages} disabled={processing}>
            {processing ? 'Processing...' : 'Remove Images'}
          </button>
          {result && (
            <button onClick={handleSave}>Save PDF</button>
          )}
        </div>
      </div>
    </div>
  );
};
