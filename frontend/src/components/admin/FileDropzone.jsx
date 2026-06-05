import { useDropzone } from 'react-dropzone'

export default function FileDropzone({ accept, onFile, currentUrl, file }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple: false,
    onDrop: files => files[0] && onFile(files[0]),
  })

  return (
    <div
      {...getRootProps()}
      className={`flex items-center gap-4 rounded-md border px-4 py-3 cursor-pointer transition-colors text-sm
        ${isDragActive
          ? 'border-gray-400 bg-gray-50'
          : 'border-gray-300 bg-white hover:bg-gray-50'
        }`}
    >
      <input {...getInputProps()} />

      {currentUrl && !file && (
        <img src={currentUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
      )}

      {file && (
        <img src={URL.createObjectURL(file)} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
      )}

      <div className="flex flex-col">
        {file ? (
          <>
            <span className="text-gray-900 font-medium">{file.name}</span>
            <span className="text-xs text-gray-400">Click or drag to replace</span>
          </>
        ) : isDragActive ? (
          <span className="text-gray-600">Drop file here…</span>
        ) : (
          <>
            <span className="text-gray-700 font-medium">
              {currentUrl ? 'Replace file' : 'Choose file'}
            </span>
            <span className="text-xs text-gray-400">or drag and drop here</span>
          </>
        )}
      </div>
    </div>
  )
}
