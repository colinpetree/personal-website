export async function handleUpload(file) {
  const data = await handleUploadFull(file)
  return data.filename
}

export async function handleUploadFull(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
  return await res.json()
}
