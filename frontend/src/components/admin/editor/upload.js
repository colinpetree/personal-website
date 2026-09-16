export async function handleUpload(file) {
  const data = await handleUploadFull(file)
  return data.filename
}

// context: pass 'header' for HeaderNode background/split images, which render edge-to-edge
// at up to the full viewport width. The backend uses a wider resize cap for those than
// for regular inline content images (see HEADER_IMAGE_MAX_DIM in backend/upload_utils.py).
export async function handleUploadFull(file, context) {
  const formData = new FormData()
  formData.append('file', file)
  if (context) formData.append('context', context)
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
  return await res.json()
}
