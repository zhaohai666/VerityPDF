import React, { useState } from 'react';
import { PdfInfoJsonResult } from '@/types/electron';

interface InfoJsonDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const InfoJsonDialog: React.FC<InfoJsonDialogProps> = ({ pdfData, onClose }) => {
  const [result, setResult] = useState<PdfInfoJsonResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetchInfo = async () => {
    setProcessing(true);
    setError(null);

    try {
      const info = await window.verityAPI.getPdfInfoJson(pdfData);
      setResult(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch PDF info');
    } finally {
      setProcessing(false);
    }
  };

  const handleExportJson = async () => {
    if (!result) return;

    try {
      const filePath = await window.verityAPI.showDialog({
        type: 'save',
        defaultPath: 'pdf-info.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });

      if (!filePath) return;

      const jsonString = JSON.stringify(result, null, 2);
      const buffer = new TextEncoder().encode(jsonString);
      const base64 = btoa(String.fromCharCode(...buffer));
      await window.verityAPI.saveFile(filePath, base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export JSON');
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>PDF Info JSON</h2>
          <button onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          {!result && (
            <button onClick={handleFetchInfo} disabled={processing}>
              {processing ? 'Fetching...' : 'Fetch PDF Info'}
            </button>
          )}

          {result && (
            <div className="pdf-info">
              <section className="info-section">
                <h3>Document Info</h3>
                <pre>{JSON.stringify(result.info, null, 2)}</pre>
              </section>

              <section className="info-section">
                <h3>Metadata</h3>
                <pre>{JSON.stringify(result.metadata, null, 2)}</pre>
              </section>

              <section className="info-section">
                <h3>Statistics</h3>
                <ul>
                  <li>Page Count: {result.pageCount}</li>
                  <li>Images: {result.images}</li>
                  <li>Form Fields: {result.formFields}</li>
                </ul>
              </section>

              <section className="info-section">
                <h3>Fonts ({result.fonts.length})</h3>
                {result.fonts.length > 0 ? (
                  <ul>
                    {result.fonts.map((font, idx) => (
                      <li key={idx}>{font}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No fonts found</p>
                )}
              </section>

              <section className="info-section">
                <h3>Bookmarks ({result.bookmarks.length})</h3>
                {result.bookmarks.length > 0 ? (
                  <ul>
                    {result.bookmarks.map((bookmark, idx) => (
                      <li key={idx}>
                        {bookmark.title} - Page {bookmark.pageIndex + 1}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No bookmarks found</p>
                )}
              </section>

              <section className="info-section">
                <h3>Attachments ({result.attachments.length})</h3>
                {result.attachments.length > 0 ? (
                  <ul>
                    {result.attachments.map((att, idx) => (
                      <li key={idx}>
                        {att.name} ({att.description || 'No description'})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No attachments found</p>
                )}
              </section>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose}>Close</button>
          {result && (
            <button onClick={handleExportJson}>Export JSON</button>
          )}
        </div>
      </div>
    </div>
  );
};
