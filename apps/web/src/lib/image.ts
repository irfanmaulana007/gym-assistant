// Client-side avatar downscaling (PRD 0008 §4.6): resize a picked image to a
// small square and encode it as a JPEG data URL, keeping the stored string well
// under the API's size cap. No crop editor — a center-cropped square.

const MAX_DIMENSION = 256

/** Read a File, center-crop to a square, downscale to ≤256px, return a JPEG
 * data URL. Rejects when the file isn't a decodable image. */
export function downscaleImageToDataURL(file: File, maxDimension = MAX_DIMENSION): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the image file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode the image'))
      img.onload = () => {
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        const size = Math.min(side, maxDimension)

        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas is not supported'))
          return
        }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
