export interface CapturedFrame {
  id: string
  /** PNG data URL of the captured cut. */
  dataUrl: string
  width: number
  height: number
  takenAt: number
}

export interface CompositeSource {
  video: HTMLVideoElement
  /** Flip horizontally (used for the local selfie feed). */
  mirror: boolean
}

/** How a cut's cameras are laid out inside one strip slot. */
export interface GridSpec {
  cols: number
  rows: number
  /** Aspect of a single camera's cell — what a live tile must be shaped to. */
  cellAspect: number
}

/**
 * The arrangement of `count` cameras inside a slot of aspect `slotAspect`.
 *
 * | cameras | grid | cell aspect (slot ≈ 1.4) |
 * | ------- | ---- | ------------------------ |
 * | 1       | 1×1  | 1.40 — a solo cut        |
 * | 2       | 2×1  | 0.70 — a date cut        |
 * | 3       | 3×1  | 0.47                     |
 * | 4       | 2×2  | 1.40                     |
 *
 * The 2×2 is the reason this is a grid and not a row. Dividing width and height
 * equally leaves each cell with **the aspect of the slot itself**, so a face in a
 * four-person cut is framed exactly like a solo one; four in a row would give each
 * person 0.35 — a vertical letterbox with the head cropped off. Three stays a single
 * row, in the same portrait family as the two-person cut, rather than a 2×2 with a hole
 * in it or a double-width bottom cell that crops the odd one out differently.
 */
export function compositeGrid(count: number, slotAspect: number): GridSpec {
  const cols = count >= 4 ? 2 : Math.max(1, count)
  const rows = Math.ceil(Math.max(1, count) / cols)
  return { cols, rows, cellAspect: (slotAspect / cols) * rows }
}

/** Draw a video into a target rect, cover-cropped (fill, center), optionally mirrored. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  mirror: boolean
) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return

  const scale = Math.max(dw / vw, dh / vh)
  const sw = dw / scale
  const sh = dh / scale
  const sx = (vw - sw) / 2
  const sy = (vh - sh) / 2

  ctx.save()
  if (mirror) {
    ctx.translate(dx + dw, dy)
    ctx.scale(-1, 1)
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh)
  } else {
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh)
  }
  ctx.restore()
}

/**
 * Composite the given camera frames into a single cut on `canvas`, laid out as
 * `compositeGrid(tiles, frameAspect)`, and return it as a PNG data URL.
 *
 * The whole cut is shaped to `frameAspect` — the aspect of the strip slot it is headed
 * for (see `slotAspect`) — and the cameras divide it into equal cells, each
 * cover-cropped from the centre. Sizing the cut to the slot is what keeps the strip from
 * re-cropping it: slots are landscape, so a portrait cut used to lose ~46% of its height
 * to `composeStrip`'s cover fit, which read as a hard zoom. The live preview tiles are
 * shaped to the same cell aspect, so what you frame is what lands on the paper.
 *
 * `tiles` is how many cells the grid has, and it is **passed in rather than counted from
 * `sources`**. The count is pinned when a capture run starts, so a camera that fails to
 * render one frame leaves that cell black instead of reflowing the geometry between cut
 * two and cut three of the same strip — four people and then three is not a strip anyone
 * asked for. Sources are drawn in order into the cells, reading left to right, top to
 * bottom; a source with no frame yet is skipped and its cell stays black. Returns `null`
 * if none of them render.
 */
export function captureCompositeFrame(
  sources: CompositeSource[],
  canvas: HTMLCanvasElement,
  frameAspect: number,
  tiles: number = sources.length
): CapturedFrame | null {
  const rendered = sources.map((source) => ({
    ...source,
    ready: Boolean(source.video && source.video.videoWidth > 0 && source.video.videoHeight > 0),
  }))
  const first = rendered.find((source) => source.ready)
  if (!first) return null

  const { cols, rows, cellAspect } = compositeGrid(tiles, frameAspect)

  // Largest cell of that aspect that still fits inside the native camera frame, so a
  // cut is only ever cropped, never upscaled past what the sensor gave us.
  const { videoWidth: nativeWidth, videoHeight: nativeHeight } = first.video
  let cellWidth = nativeWidth
  let cellHeight = Math.round(nativeWidth / cellAspect)
  if (cellHeight > nativeHeight) {
    cellHeight = nativeHeight
    cellWidth = Math.round(nativeHeight * cellAspect)
  }

  const width = cellWidth * cols
  const height = cellHeight * rows

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // `toDataURL` (and drawing) can throw — a tainted canvas (SecurityError) or an
  // oversized canvas. Honor the documented null-on-failure contract instead of
  // propagating an exception to callers that only handle null.
  try {
    canvas.width = width
    canvas.height = height
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)

    rendered.slice(0, cols * rows).forEach((source, index) => {
      if (!source.ready) return
      const dx = (index % cols) * cellWidth
      const dy = Math.floor(index / cols) * cellHeight
      drawCover(ctx, source.video, dx, dy, cellWidth, cellHeight, source.mirror)
    })

    return {
      id: crypto.randomUUID(),
      dataUrl: canvas.toDataURL('image/png'),
      width,
      height,
      takenAt: Date.now(),
    }
  } catch {
    return null
  }
}
