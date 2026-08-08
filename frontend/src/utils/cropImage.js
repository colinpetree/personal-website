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
// exactly that rectangle. `outputSize` downsamples/upsamples the result to a
// fixed square so avatars aren't uploaded at arbitrary huge resolutions.
export async function getCroppedImageBlob(imageSrc, cropPixels, outputSize = 512) {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outputSize,
    outputSize
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Failed to crop image'))), 'image/png')
  })
}
