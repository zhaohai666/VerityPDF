import React, { useState } from 'react';
import { SanitizeResult } from '@/types/electron';

interface SanitizeDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const SanitizeDialog: React.FC<SanitizeDialogProps> = ({ pdfData, onClose }) => {
  const [options, setOptions] = useState({
    removeMetadata: true,
    removeJavaScript: true,
    removeEmbeddedFiles: true,
    removeXmp: true,
    removeDocumentInfo: true,
  });
  const [result, setResult] = useState<SanitizeResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSanitize = async () => {
    setProcessing(true);
    setError(null);
    try {
      const res = await window.verityAPI.sanitizePdf(pdfData, options);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to sanitize PDF');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        defaultPath: 'sanitized.pdf',
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
          <h2>PDF Sanitize</h2>
        </div>
        <div className="dialog-body">
          <div className="options">
            <label>
              <input
                type="checkbox"
                checked={options.removeMetadata}
                onChange={(e) => setOptions({ ...options, removeMetadata: e.target.checked })}
              />
              Remove Metadata
            </label>
            <label>
              <input
                type="checkbox"
                checked={options.removeJavaScript}
                onChange={(e) => setOptions({ ...options, removeJavaScript: e.target.checked })}
              />
              Remove JavaScript
            </label>
            <label>
              <input
                type="checkbox"
                checked={options.removeEmbeddedFiles}
                onChange={(e) => setOptions({ ...options, removeEmbeddedFiles: e.target.checked })}
              />
              Remove Embedded Files
            </label>
            <label>
              <input
                type="checkbox"
                checked={options.removeXmp}
                onChange={(e) => setOptions({ ...options, removeXmp: e.target.checked })}
              />
              Remove XMP
            </label>
            <label>
              <input
                type="checkbox"
                checked={options.removeDocumentInfo}
                onChange={(e) => setOptions({ ...options, removeDocumentInfo: e.target.checked })}
              />
              Remove Document Info
            </label>
          </div>

          {error && <div className="error">{error}</div>}

          {result && (
            <div className="result">
              <p>Cleaned {result.cleanedCount} items</p>
              <ul>
                {result.removedItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button onClick={handleSanitize} disabled={processing}>
            {processing ? 'Processing...' : 'Sanitize'}
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
