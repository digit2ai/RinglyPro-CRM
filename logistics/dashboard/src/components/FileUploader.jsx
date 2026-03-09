import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const STATUS_CONFIG = {
  pending: {
    badge: null,
    borderClass: 'border-slate-600',
    iconColor: 'text-slate-500'
  },
  uploading: {
    badge: (
      <span className="badge bg-blue-500/20 text-blue-300 border border-blue-500/30">
        <svg className="animate-spin w-3 h-3 mr-1" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Uploading...
      </span>
    ),
    borderClass: 'border-blue-500/50',
    iconColor: 'text-blue-400'
  },
  success: {
    badge: (
      <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Parsed
      </span>
    ),
    borderClass: 'border-emerald-500/50',
    iconColor: 'text-emerald-400'
  },
  error: {
    badge: (
      <span className="badge bg-red-500/20 text-red-300 border border-red-500/30">
        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Error
      </span>
    ),
    borderClass: 'border-red-500/50',
    iconColor: 'text-red-400'
  }
}

export default function FileUploader({
  fileType,
  label,
  description,
  icon,
  required = false,
  status = 'pending',
  fileName,
  fileSize,
  rowCount = 0,
  warnings = [],
  onDrop
}) {
  const handleDrop = useCallback((acceptedFiles) => {
    if (onDrop) onDrop(acceptedFiles)
  }, [onDrop])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    maxFiles: 1,
    disabled: status === 'uploading'
  })

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all duration-200
        ${isDragActive ? 'border-logistics-500 bg-logistics-500/10' : config.borderClass}
        ${status === 'uploading' ? 'opacity-75 cursor-wait' : 'hover:border-logistics-500/60 hover:bg-slate-800/50'}
      `}
    >
      <input {...getInputProps()} />

      {/* Header Row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center ${config.iconColor}`}>
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-white">{label}</h4>
              {required && (
                <span className="text-[10px] text-red-400 font-medium uppercase tracking-wider">Required</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          </div>
        </div>
        {config.badge}
      </div>

      {/* File Info */}
      {fileName ? (
        <div className="bg-slate-700/50 rounded-lg p-3 mt-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-sm text-slate-200 font-medium truncate">{fileName}</span>
            <span className="text-xs text-slate-500 flex-shrink-0">{formatFileSize(fileSize)}</span>
          </div>
          {rowCount > 0 && (
            <p className="text-xs text-slate-400 ml-6">
              {rowCount.toLocaleString()} rows parsed successfully
            </p>
          )}
        </div>
      ) : (
        <div className="text-center py-3">
          <svg className="w-8 h-8 text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-xs text-slate-500">
            {isDragActive ? 'Drop file here...' : 'Drag & drop CSV/Excel or click to browse'}
          </p>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {warnings.map((warning, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 text-xs p-2 rounded-md ${
                status === 'error'
                  ? 'bg-red-500/10 text-red-300'
                  : 'bg-amber-500/10 text-amber-300'
              }`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{typeof warning === 'string' ? warning : warning.message || JSON.stringify(warning)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
