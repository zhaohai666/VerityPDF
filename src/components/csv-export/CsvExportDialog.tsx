import React, { useState } from 'react';
import { CsvExportResult } from '@/types/electron';

interface CsvExportDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const CsvExportDialog: React.FC<CsvExportDialogProps> = ({ pdfData, onClose }) => {
  const [options, setOptions] = useState({
    delimiter: ',',
    detectHeaders: true,
    rowDetectionTolerance: 5,
    columnDetectionMode: 'auto',
    includePageNumber: false,
    includeCoordinates: false,
    allPages: true,
    specificPages: '',
  });
  const [result, setResult] = useState<CsvExportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setProcessing(true);
    setError(null);

    try {
      const exportOptions = {
        delimiter: options.delimiter,
        detectHeaders: options.detectHeaders,
        rowDetectionTolerance: options.rowDetectionTolerance,
        columnDetectionMode: options.columnDetectionMode,
        includePageNumber: options.includePageNumber,
        includeCoordinates: options.includeCoordinates,
        pages: options.allPages ? undefined : options.specificPages,
      };

      const exportResult = await window.verityAPI.exportPdfToCsv(pdfData, exportOptions);
      setResult(exportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;

    try {
      const filePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      });

      if (filePath) {
        await window.verityAPI.saveFile(result.csv, filePath);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    }
  };

  const getPreviewLines = () => {
    if (!result) return '';
    const lines = result.csv.split('\n');
    return lines.slice(0, 20).join('\n');
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>CSV Export</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Delimiter:</label>
            <select
              value={options.delimiter}
              onChange={(e) => setOptions({ ...options, delimiter: e.target.value })}
            >
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value={'\t'}>Tab</option>
              <option value="|">Pipe (|)</option>
            </select>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={options.detectHeaders}
                onChange={(e) => setOptions({ ...options, detectHeaders: e.target.checked })}
              />
              Detect Headers
            </label>
          </div>

          <div className="form-group">
            <label>Row Detection Tolerance:</label>
            <input
              type="number"
              value={options.rowDetectionTolerance}
              onChange={(e) =>
                setOptions({ ...options, rowDetectionTolerance: Number(e.target.value) })
              }
              min="0"
            />
          </div>

          <div className="form-group">
            <label>Column Detection Mode:</label>
            <select
              value={options.columnDetectionMode}
              onChange={(e) =>
                setOptions({ ...options, columnDetectionMode: e.target.value })
              }
            >
              <option value="auto">Auto</option>
              <option value="tab">Tab</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={options.includePageNumber}
                onChange={(e) => setOptions({ ...options, includePageNumber: e.target.checked })}
              />
              Include Page Number
            </label>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={options.includeCoordinates}
                onChange={(e) => setOptions({ ...options, includeCoordinates: e.target.checked })}
              />
              Include Coordinates
            </label>
          </div>

          <div className="form-group">
            <label>Pages:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  checked={options.allPages}
                  onChange={() => setOptions({ ...options, allPages: true })}
                />
                All Pages
              </label>
              <label>
                <input
                  type="radio"
                  checked={!options.allPages}
                  onChange={() => setOptions({ ...options, allPages: false })}
                />
                Specific Pages:
              </label>
              <input
                type="text"
                value={options.specificPages}
                onChange={(e) => setOptions({ ...options, specificPages: e.target.value })}
                disabled={options.allPages}
                placeholder="e.g., 1-3, 5, 7-9"
              />
            </div>
          </div>

          {result && (
            <div className="result-info">
              <h3>Export Complete</h3>
              <div className="stats">
                <p>Rows: {result.rowCount}</p>
                <p>Columns: {result.columnCount}</p>
                <p>Pages processed: {result.pagesProcessed}</p>
                <p>Tables detected: {result.tablesDetected}</p>
              </div>
              <div className="csv-preview">
                <h4>Preview (first 20 lines):</h4>
                <textarea
                  value={getPreviewLines()}
                  readOnly
                  rows={10}
                  className="csv-textarea"
                />
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose} className="cancel-button">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={processing}
            className="export-button"
          >
            {processing ? 'Exporting...' : 'Export'}
          </button>
          {result && (
            <button onClick={handleSave} className="save-button">
              Save CSV
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
