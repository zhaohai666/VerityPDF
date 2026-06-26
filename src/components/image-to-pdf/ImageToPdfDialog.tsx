import React, { useState, useRef } from 'react';
import { ImageToPdfResult, ImageData } from '@/types/electron';

interface ImageToPdfDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const ImageToPdfDialog: React.FC<ImageToPdfDialogProps> = ({ pdfData: _pdfData, onClose }) => {
  const [options, setOptions] = useState<{
    pageSize: 'original' | 'a4' | 'letter' | 'fit';
    dpi: number;
    margin: number;
    fitMode: 'stretch' | 'contain' | 'cover';
  }>({
    pageSize: 'original',
    dpi: 72,
    margin: 0,
    fitMode: 'contain',
  });
  const [images, setImages] = useState<ImageData[]>([]);
  const [result, setResult] = useState<ImageToPdfResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mimeToFormat = (mime: string): 'png' | 'jpeg' => {
    return mime === 'image/png' ? 'png' : 'jpeg';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imagePromises = Array.from(files).map((file) => {
      return new Promise<ImageData>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({
            name: file.name,
            data: base64,
            format: mimeToFormat(file.type),
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    try {
      const newImages = await Promise.all(imagePromises);
      setImages((prev) => [...prev, ...newImages]);
      setError(null);
    } catch (err) {
      setError('Failed to read image files');
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConvert = async () => {
    if (images.length === 0) {
      setError('Please select at least one image');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const conversionResult = await window.verityAPI.convertImageToPdf({
        images,
        ...options,
      });
      setResult(conversionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;

    try {
      const filePath = await window.verityAPI.showDialog({
        type: 'save',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });

      if (filePath) {
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(result.pdfData))
        );
        await window.verityAPI.saveFile(base64, filePath);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>Image to PDF Conversion</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Select Images:</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg"
              onChange={handleFileSelect}
              className="file-input"
            />
          </div>

          {images.length > 0 && (
            <div className="image-list">
              <h3>Selected Images ({images.length})</h3>
              {images.map((img, index) => (
                <div key={index} className="image-thumbnail">
                  <img src={`data:image/${img.format};base64,${img.data}`} alt={img.name} />
                  <span className="image-name">{img.name}</span>
                  <button onClick={() => removeImage(index)} className="remove-button">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="form-group">
            <label>Page Size:</label>
            <select
              value={options.pageSize}
              onChange={(e) => setOptions({ ...options, pageSize: e.target.value as 'original' | 'a4' | 'letter' | 'fit' })}
            >
              <option value="original">Original</option>
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
              <option value="fit">Fit to Image</option>
            </select>
          </div>

          <div className="form-group">
            <label>DPI:</label>
            <select
              value={options.dpi}
              onChange={(e) => setOptions({ ...options, dpi: Number(e.target.value) })}
            >
              <option value={72}>72</option>
              <option value={150}>150</option>
              <option value={300}>300</option>
              <option value={600}>600</option>
            </select>
          </div>

          <div className="form-group">
            <label>Margin (px):</label>
            <input
              type="number"
              value={options.margin}
              onChange={(e) => setOptions({ ...options, margin: Number(e.target.value) })}
              min="0"
            />
          </div>

          <div className="form-group">
            <label>Fit Mode:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="contain"
                  checked={options.fitMode === 'contain'}
                  onChange={(e) => setOptions({ ...options, fitMode: e.target.value as 'stretch' | 'contain' | 'cover' })}
                />
                Contain
              </label>
              <label>
                <input
                  type="radio"
                  value="stretch"
                  checked={options.fitMode === 'stretch'}
                  onChange={(e) => setOptions({ ...options, fitMode: e.target.value as 'stretch' | 'contain' | 'cover' })}
                />
                Stretch
              </label>
              <label>
                <input
                  type="radio"
                  value="cover"
                  checked={options.fitMode === 'cover'}
                  onChange={(e) => setOptions({ ...options, fitMode: e.target.value as 'stretch' | 'contain' | 'cover' })}
                />
                Cover
              </label>
            </div>
          </div>

          {result && (
            <div className="result-info">
              <h3>Conversion Complete</h3>
              <p>Pages: {result.pageCount}</p>
              <p>Images processed: {result.totalImages}</p>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button onClick={onClose} className="cancel-button">
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={processing || images.length === 0}
            className="convert-button"
          >
            {processing ? 'Converting...' : 'Convert'}
          </button>
          {result && (
            <button onClick={handleSave} className="save-button">
              Save PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
