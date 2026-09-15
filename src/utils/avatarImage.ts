/** Edge length of the square we store. Retina-sharp at the 64px it renders at. */
export const AVATAR_SIZE = 256

/** Reject absurd source files before decoding one into memory. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024

/**
 * How far in the editor lets someone push. Past this the stored 256px square is
 * mostly invented detail, and the crop gets fiddly to place — a slider whose useful
 * range is all in its first third is worse than a shorter one.
 */
export const MAX_ZOOM = 4

/** Thrown when the chosen file can't be turned into an avatar. */
export class AvatarImageError extends Error {
  constructor(readonly reason: 'tooLarge' | 'notAnImage' | 'encodeFailed') {
    super(reason)
    this.name = 'AvatarImageError'
  }
}

/**
 * Which square of the source image becomes the avatar.
 *
 * Held in **source pixels** rather than in screen offsets so it stays meaningful
 * whatever size the editor happens to be rendered at — the preview canvas and the
 * final encode read the same numbers and differ only in where they draw them.
 *
 * `zoom` is relative to the largest square the image allows: 1 shows all of it, 2
 * shows a square half that wide. `cx`/`cy` are that square's centre.
 */
export interface AvatarCrop {
  cx: number
  cy: number
  zoom: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The largest square the source allows — the crop at zoom 1. */
export function baseSquare(source: ImageBitmap): number {
  return Math.min(source.width, source.height)
}

/**
 * The crop we open the editor on: dead centre, zoomed all the way out.
 *
 * Deliberately the same square the old automatic center-crop produced, so someone
 * who doesn't want to adjust anything can just press save and get what they used to.
 */
export function initialCrop(source: ImageBitmap): AvatarCrop {
  return { cx: source.width / 2, cy: source.height / 2, zoom: 1 }
}

/**
 * Pull a crop back inside the image.
 *
 * Applied on every change rather than only at the end, so the square can never leave
 * the picture and the preview never shows a transparent wedge along one edge. The
 * range is always non-empty: the crop is at most the shorter side, so its half-width
 * can't exceed the centre of either axis.
 */
export function clampCrop(source: ImageBitmap, crop: AvatarCrop): AvatarCrop {
  const zoom = clamp(crop.zoom, 1, MAX_ZOOM)
  const half = baseSquare(source) / zoom / 2
  return {
    zoom,
    cx: clamp(crop.cx, half, source.width - half),
    cy: clamp(crop.cy, half, source.height - half),
  }
}

/** The crop as a source rectangle, ready to hand to `drawImage`. */
export function cropRect(
  source: ImageBitmap,
  crop: AvatarCrop
): { sx: number; sy: number; size: number } {
  const size = baseSquare(source) / crop.zoom
  return { sx: crop.cx - size / 2, sy: crop.cy - size / 2, size }
}

/**
 * Paint a crop into a square canvas.
 *
 * The **one** place the crop is turned into pixels. The editor's live preview and the
 * blob that actually gets uploaded both come through here, differing only in `edge`,
 * which is what makes the editor honestly WYSIWYG — there is no second copy of the
 * geometry to drift out of step with the first.
 */
export function drawCrop(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  crop: AvatarCrop,
  edge: number
): void {
  canvas.width = edge
  canvas.height = edge
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AvatarImageError('encodeFailed')

  const { sx, sy, size } = cropRect(source, crop)
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, edge, edge)
  ctx.drawImage(source, sx, sy, size, size, 0, 0, edge, edge)
}

/**
 * Decode a chosen file into a bitmap the editor can work on.
 *
 * Split from the encode so the file is decoded **once** per pick: the editor holds
 * the result and redraws from it on every drag, which is what keeps panning smooth
 * on a 12-megapixel phone photo.
 *
 * The caller owns the bitmap and must `close()` it — it's off-heap, and a few of
 * these left behind after a session of trying different pictures is real memory.
 */
export async function decodeAvatarSource(file: File): Promise<ImageBitmap> {
  if (file.size > MAX_SOURCE_BYTES) throw new AvatarImageError('tooLarge')
  try {
    // `from-image` applies the EXIF rotation, so a portrait phone photo isn't edited
    // on its side — the tag we're about to strip is honoured before it goes.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new AvatarImageError('notAnImage')
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Encode the chosen crop as the square we upload.
 *
 * Everything happens here rather than on the server: no multi-megabyte upload, and
 * what lands in the bucket is tens of kilobytes. Re-encoding also drops EXIF — phone
 * photos carry GPS coordinates, and an avatar is the last place someone expects to
 * publish where they live.
 *
 * WebP with a JPEG fallback for anything that can't encode it. Both are square by
 * construction, which is what the server re-checks on arrival.
 */
export async function renderAvatarBlob(source: ImageBitmap, crop: AvatarCrop): Promise<Blob> {
  const canvas = document.createElement('canvas')
  drawCrop(canvas, source, clampCrop(source, crop), AVATAR_SIZE)

  const webp = await toBlob(canvas, 'image/webp', 0.85)
  if (webp && webp.type === 'image/webp') return webp

  const jpeg = await toBlob(canvas, 'image/jpeg', 0.85)
  if (jpeg) return jpeg

  throw new AvatarImageError('encodeFailed')
}
