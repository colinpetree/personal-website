export async function handleUpload(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
  const { filename } = await res.json()
  return filename
}
