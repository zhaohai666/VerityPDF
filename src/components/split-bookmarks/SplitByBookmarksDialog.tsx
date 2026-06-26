import React, { useState } from 'react';
import { SplitByBookmarksResult } from '@/types/electron';

interface SplitByBookmarksDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const SplitByBookmarksDialog: React.FC<SplitByBookmarksDialogProps> = ({ pdfData, onClose }) => {
  const [options, setOptions] = useState({
    level: 'top',
    outputDir: '',
  });
  const [result, setResult] = useState<SplitByBookmarksResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = async () => {
    try {
      const dirPath = await window.verityAPI.showDialog({
        type: 'open',
      });
      if (dirPath) {
        setOptions({ ...options, outputDir: dirPath });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to select directory');
    }
  };

  const handleSplit = async () => {
    if (!options.outputDir) {
      setError('Please select an output directory');
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const res = await window.verityAPI.splitByBookmarks(pdfData, {
        level: options.level as 'top' | 'all',
        outputDir: options.outputDir,
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to split by bookmarks');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>Split by Bookmarks</h2>
        </div>
        <div className="dialog-body">
          <div className="options">
            <fieldset>
              <legend>Bookmark Level</legend>
              <label>
                <input
                  type="radio"
                  name="level"
                  value="top"
                  checked={options.level === 'top'}
                  onChange={(e) => setOptions({ ...options, level: e.target.value })}
                />
                Top Level Only
              </label>
              <label>
                <input
                  type="radio"
                  name="level"
                  value="all"
                  checked={options.level === 'all'}
                  onChange={(e) => setOptions({ ...options, level: e.target.value })}
                />
                All Levels
              </label>
            </fieldset>
            <div className="output-dir">
              <label>Output Directory:</label>
              <div className="dir-input">
                <input
                  type="text"
                  value={options.outputDir}
                  onChange={(e) => setOptions({ ...options, outputDir: e.target.value })}
                  placeholder="Select output directory..."
                />
                <button onClick={handleBrowse}>Browse</button>
              </div>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          {result && (
            <div className="result">
              <p>Split into {result.splitCount} files</p>
              <h4>Bookmarks:</h4>
              <ul>
                {result.bookmarks.map((bookmark, idx) => (
                  <li key={idx}>{bookmark.title}</li>
                ))}
              </ul>
              <h4>Output Files:</h4>
              <ul>
                {result.outputFiles.map((file, idx) => (
                  <li key={idx}>{file}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button onClick={handleSplit} disabled={processing}>
            {processing ? 'Processing...' : 'Split'}
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
