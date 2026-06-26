import React, { useState } from 'react';
import { ShowJsResult } from '@/types/electron';

interface ShowJsDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const ShowJsDialog: React.FC<ShowJsDialogProps> = ({ pdfData, onClose }) => {
  const [result, setResult] = useState<ShowJsResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setProcessing(true);
    setError(null);

    try {
      const scanResult = await window.verityAPI.showPdfJavaScript(pdfData);
      setResult(scanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleExportJson = async () => {
    if (!result) return;

    try {
      const filePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });

      if (filePath) {
        const jsonData = JSON.stringify(result.scripts, null, 2);
        await window.verityAPI.saveFile(jsonData, filePath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export JSON');
    }
  };

  const getTypeBadgeClass = (type: string) => {
    return `type-badge type-${type.toLowerCase()}`;
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>PDF JavaScript Viewer</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          {!result && (
            <div className="scan-prompt">
              <p>Click "Scan" to detect JavaScript embedded in this PDF.</p>
            </div>
          )}

          {result && (
            <div className="scan-results">
              <div className="summary">
                <h3>Scan Summary</h3>
                <p>Total scripts found: {result.totalCount}</p>
                <p>Pages scanned: {result.pagesScanned}</p>
              </div>

              {result.scripts.length === 0 ? (
                <div className="no-scripts">
                  <p>No JavaScript found in this PDF</p>
                </div>
              ) : (
                <div className="script-list">
                  <h3>Scripts ({result.scripts.length})</h3>
                  {result.scripts.map((script, index) => (
                    <div key={index} className="script-item">
                      <div className="script-header">
                        <span className="script-location">{script.location}</span>
                        <span className={getTypeBadgeClass(script.type)}>{script.type}</span>
                      </div>
                      <pre className="script-code">
                        <code>{script.code}</code>
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose} className="cancel-button">
            Close
          </button>
          <button
            onClick={handleScan}
            disabled={processing}
            className="scan-button"
          >
            {processing ? 'Scanning...' : 'Scan'}
          </button>
          {result && result.scripts.length > 0 && (
            <button onClick={handleExportJson} className="export-button">
              Export JSON
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
