import React, { useState, useRef } from 'react';
import api from '../services/api';

export default function ImagingUpload({ caseId, onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...dropped]);
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    setFiles(prev => [...prev, ...selected]);
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('caseId', caseId);
    files.forEach(f => formData.append('files', f));

    try {
      const token = localStorage.getItem('msk_token');
      const res = await fetch('/msk/api/v1/imaging/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setFiles([]);
      setProgress(100);
      if (onUploadComplete) onUploadComplete(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (name) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['dcm', 'dicom'].includes(ext)) return '🩻';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return '🖼️';
    if (ext === 'pdf') return '📄';
    return '📁';
  };

  return (
    <div>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-dark-600 rounded-xl p-8 text-center cursor-pointer hover:border-msk-500/50 transition-all bg-dark-900/50"
      >
        <div className="text-3xl mb-3">📤</div>
        <p className="text-white font-medium">Drop imaging files here</p>
        <p className="text-dark-400 text-sm mt-1">or click to browse — DICOM, JPEG, PNG, PDF (up to 500MB)</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".dcm,.dicom,.jpg,.jpeg,.png,.pdf,.nii"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between bg-dark-800 rounded-lg px-4 py-2">
              <div className="flex items-center gap-3">
                <span>{getFileIcon(f.name)}</span>
                <div>
                  <p className="text-white text-sm font-medium truncate max-w-xs">{f.name}</p>
                  <p className="text-dark-400 text-xs">{formatSize(f.size)}</p>
                </div>
              </div>
              <button onClick={() => removeFile(i)} className="text-dark-400 hover:text-red-400 text-sm">Remove</button>
            </div>
          ))}

          <button onClick={uploadFiles} disabled={uploading} className="btn-primary w-full mt-3">
            {uploading ? `Uploading...` : `Upload ${files.length} file${files.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      {progress === 100 && !error && <p className="text-green-400 text-sm mt-3">Upload complete!</p>}
    </div>
  );
}
