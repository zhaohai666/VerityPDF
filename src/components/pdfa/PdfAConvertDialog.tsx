import React, { useState } from 'react';
import { PdfAConvertResult } from '@/types/electron';

interface PdfAConvertDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const PdfAConvertDialog: React.FC<PdfAConvertDialogProps> = ({ pdfData, onClose }) => {
  const [options, setOptions] = useState({
    conformance: 'pdfa-2b',
    includeXmp: true,
  });
  const [result, setResult] = useState<PdfAConvertResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = async () => {
    setProcessing(true);
    setError(null);
    try {
      const res = await window.verityAPI.convertToPdfA(pdfData, {
        conformance: options.conformance as 'pdfa-1b' | 'pdfa-2b' | 'pdfa-3b',
        includeXmp: options.includeXmp,
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to convert to PDF/A');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      const savePath = await window.verityAPI.showDialog({
        type: 'save',
        defaultPath: 'converted.pdf',
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
          <h2>PDF/A Conversion</h2>
        </div>
        <div className="dialog-body">
          <div className="options">
            <fieldset>
              <legend>Conformance Level</legend>
              <label>
                <input
                  type="radio"
                  name="conformance"
                  value="pdfa-1b"
                  checked={options.conformance === 'pdfa-1b'}
                  onChange={(e) => setOptions({ ...options, conformance: e.target.value })}
                />
                PDF/A-1b
              </label>
              <label>
                <input
                  type="radio"
                  name="conformance"
                  value="pdfa-2b"
                  checked={options.conformance === 'pdfa-2b'}
                  onChange={(e) => setOptions({ ...options, conformance: e.target.value })}
                />
                PDF/A-2b
              </label>
              <label>
                <input
                  type="radio"
                  name="conformance"
                  value="pdfa-3b"
                  checked={options.conformance === 'pdfa-3b'}
                  onChange={(e) => setOptions({ ...options, conformance: e.target.value })}
                />
                PDF/A-3b
              </label>
            </fieldset>
            <label>
              <input
                type="checkbox"
                checked={options.includeXmp}
                onChange={(e) => setOptions({ ...options, includeXmp: e.target.checked })}
              />
              Include XMP Metadata
            </label>
          </div>

          {error && <div className="error">{error}</div>}

          {result && (
            <div className="result">
              <p>Converted to {result.conformance}</p>
              <p>{result.message}</p>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button onClick={handleConvert} disabled={processing}>
            {processing ? 'Processing...' : 'Convert'}
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
