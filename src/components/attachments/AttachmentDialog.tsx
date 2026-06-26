import React, { useState, useEffect } from 'react';
import { AttachmentInfo } from '@/types/electron';

interface AttachmentDialogProps {
  pdfData: string;
  onClose: () => void;
}

export const AttachmentDialog: React.FC<AttachmentDialogProps> = ({ pdfData, onClose }) => {
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAttachment, setNewAttachment] = useState({
    name: '',
    description: '',
    file: null as File | null,
  });

  useEffect(() => {
    loadAttachments();
  }, [pdfData]);

  const loadAttachments = async () => {
    setProcessing(true);
    setError(null);

    try {
      const list = await window.verityAPI.listAttachments(pdfData);
      setAttachments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attachments');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddAttachment = async () => {
    if (!newAttachment.file) {
      setError('Please select a file');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const buffer = reader.result as ArrayBuffer;
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

        await window.verityAPI.addAttachment(pdfData, {
          name: newAttachment.name || newAttachment.file!.name,
          data: base64,
          description: newAttachment.description,
        });

        setNewAttachment({ name: '', description: '', file: null });
        setShowAddForm(false);
        await loadAttachments();
      };
      reader.readAsArrayBuffer(newAttachment.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add attachment');
    } finally {
      setProcessing(false);
    }
  };

  const handleExtractAll = async () => {
    setProcessing(true);
    setError(null);

    try {
      const filePath = await window.verityAPI.showDialog({
        type: 'open',
      });

      if (!filePath) return;

      await window.verityAPI.extractAttachments(pdfData, filePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract attachments');
    } finally {
      setProcessing(false);
    }
  };

  const handleExtractSelected = async () => {
    if (selectedNames.size === 0) {
      setError('Please select attachments to extract');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const filePath = await window.verityAPI.showDialog({
        type: 'open',
      });

      if (!filePath) return;

      await window.verityAPI.extractAttachments(pdfData, filePath, Array.from(selectedNames));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract attachments');
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelection = (name: string) => {
    const newSelected = new Set(selectedNames);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedNames(newSelected);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>PDF Attachments</h2>
          <button onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-message">{error}</div>}

          <div className="attachment-controls">
            <button onClick={loadAttachments} disabled={processing}>
              Refresh
            </button>
            <button onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'Cancel' : 'Add Attachment'}
            </button>
            <button onClick={handleExtractAll} disabled={processing || attachments.length === 0}>
              Extract All
            </button>
            <button
              onClick={handleExtractSelected}
              disabled={processing || selectedNames.size === 0}
            >
              Extract Selected
            </button>
          </div>

          {showAddForm && (
            <div className="add-attachment-form">
              <input
                type="text"
                placeholder="Attachment name (optional)"
                value={newAttachment.name}
                onChange={(e) => setNewAttachment({ ...newAttachment, name: e.target.value })}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newAttachment.description}
                onChange={(e) =>
                  setNewAttachment({ ...newAttachment, description: e.target.value })
                }
              />
              <input
                type="file"
                onChange={(e) =>
                  setNewAttachment({ ...newAttachment, file: e.target.files?.[0] || null })
                }
              />
              <button onClick={handleAddAttachment} disabled={processing}>
                Add
              </button>
            </div>
          )}

          <table className="attachment-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Name</th>
                <th>Description</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((att) => (
                <tr key={att.name}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedNames.has(att.name)}
                      onChange={() => toggleSelection(att.name)}
                    />
                  </td>
                  <td>{att.name}</td>
                  <td>{att.description || '-'}</td>
                  <td>{formatSize(att.size)}</td>
                </tr>
              ))}
              {attachments.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center' }}>
                    No attachments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="dialog-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
