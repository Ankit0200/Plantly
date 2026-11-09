/** Crop photos for the plan chat. */

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024 // matches the backend limit
const MAX_SIDE = 1600

/** Re-encode a photo as a JPEG no larger than 1600px on its longest side. This keeps uploads fast,
 *  strips EXIF data (including GPS location), and turns iPhone HEIC into JPEG where the browser can
 *  decode it. If the browser can't decode the file, the original is returned unchanged. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return jpeg ?? file
  } catch {
    return file
  }
}
