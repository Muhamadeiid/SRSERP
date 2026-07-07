// src/components/HR/Attendance/UploadModal.jsx
import { useState, useRef } from 'react'
import { X, Upload, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { attendanceService } from '../../services/Attendanceservice'

export default function UploadModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first')
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const response = await attendanceService.uploadBiometric(file)
      
      if (response.success) {
        setResult(response.data)
        setTimeout(() => {
          onSuccess()
        }, 2000)
      } else {
        setError(response.message || 'Upload failed')
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err.response?.data?.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h3 className="text-lg font-bold text-secondary-700">Upload Biometric File</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Import attendance from fingerprint device</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          
          {/* File Input */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all
              ${file 
                ? 'border-primary bg-primary-50' 
                : 'border-neutral-200 bg-neutral-50 hover:border-primary hover:bg-primary-50/50'
              }
            `}
          >
            <div className="text-center">
              <Upload className={`w-10 h-10 mx-auto mb-3 ${file ? 'text-primary' : 'text-neutral-400'}`} />
              
              {file ? (
                <div>
                  <p className="text-sm font-semibold text-primary">{file.name}</p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-secondary-700">
                    Click to select file
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    Supported formats: .dat, .txt
                  </p>
                </div>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".dat,.txt"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Success Result */}
          {result && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-700">Upload Successful!</p>
                  <p className="text-xs text-green-600 mt-0.5">Processing attendance records...</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-2 border border-green-200">
                  <p className="text-xs text-neutral-400">Imported</p>
                  <p className="text-lg font-bold text-secondary-700">{result.imported}</p>
                </div>
                <div className="bg-white rounded-lg p-2 border border-green-200">
                  <p className="text-xs text-neutral-400">Processed</p>
                  <p className="text-lg font-bold text-secondary-700">{result.processed}</p>
                </div>
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-2">
                  <p className="text-xs text-orange-700 font-semibold">
                    {result.errors.length} warnings
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {result.errors.slice(0, 5).map((msg, i) => (
                      <li key={i} className="text-[11px] text-orange-700">{msg}</li>
                    ))}
                  </ul>
                  {result.errors.length > 5 && (
                    <p className="mt-1 text-[11px] text-orange-600">
                      +{result.errors.length - 5} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading || result}
            className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading && <Loader className="w-4 h-4 animate-spin" />}
            {uploading ? 'Uploading...' : result ? 'Done!' : 'Upload File'}
          </button>
        </div>

      </div>
    </div>
  )
}
