function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.setAttribute('crossOrigin', 'anonymous')
    img.src = src
  })
}

// Crops `imageSrc` to the pixel rectangle described by `cropPixels` (as
// produced by react-easy-crop's onCropComplete) and resolves a PNG Blob of
// exactly that rectangle. `outputWidth`/`outputHeight` downsample/upsample
// the result to a fixed size so uploads aren't arbitrary huge resolutions —
// `outputHeight` defaults to `outputWidth` for square crops (avatars,
// favicons); pass both explicitly for a non-square aspect (e.g. thumbnails).
export async function getCroppedImageBlob(imageSrc, cropPixels, outputWidth = 512, outputHeight = outputWidth) {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext('2d')

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outputWidth,
    outputHeight
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Failed to crop image'))), 'image/png')
  })
}
