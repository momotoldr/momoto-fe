/** Trigger a browser download of a data URL or blob URL under the given filename. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** Trigger a browser download of a Blob, then revoke the object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  downloadDataUrl(objectUrl, filename)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}

/**
 * Re-encode an image blob as PNG for handing to the user.
 *
 * Strips are stored as WebP — the clean copy losslessly — because that is roughly a
 * tenth of the bucket and a tenth of the upload. What someone downloads should still
 * be a PNG: WhatsApp treats a `.webp` as a sticker rather than a photo, and print
 * shops and older desktop software reject it outright. The browser has already
 * decoded the image to display it, so re-encoding here costs the user a moment of
 * their own CPU and costs the server nothing at all.
 *
 * Alpha survives the round trip: the canvas starts transparent and PNG carries an
 * alpha channel, so a template with a cut-out is not flattened onto black.
 *
 * Returns the original blob unchanged if anything fails — a very large canvas on a
 * weak phone is the realistic case. The caller must therefore name the file from the
 * *returned* blob's type, never assume `.png`: a file named `.png` that holds WebP
 * bytes is worse than an honest `.webp`.
 */
export async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close?.()
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return png ?? blob
  } catch {
    return blob
  }
}

/**
 * Whether this is iOS or iPadOS.
 *
 * Every browser on iOS is WKWebView underneath — Chrome, Firefox, Edge and the rest are
 * skins over Safari's engine — so the platform, not the brand, is what a capability
 * check has to key on. iPadOS reports itself as a Mac, hence the touch-point half.
 */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return (
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)
  )
}

/**
 * Whether this is Safari proper rather than another skin over the same engine.
 *
 * Only Safari implements the `download` attribute on iOS. The others share its renderer
 * but not its download handling, and they can't be told apart by feature detection:
 * `'download' in <a>` is true in all of them, because the property exists whether or not
 * anything honours it. The user agent is the only signal there is.
 */
function isIosSafari(): boolean {
  if (!isIos()) return false
  return !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser|GSA/.test(navigator.userAgent)
}

/** How {@link saveImageBlob} ended up handing the file over (or failing to). */
export type SaveImageResult = 'downloaded' | 'shared' | 'cancelled' | 'unsupported'

/**
 * Hand an image to the user by whatever route this browser actually supports.
 *
 * `<a download>` is the route everywhere except non-Safari iOS. There the attribute is
 * silently ignored, the click degrades into a top-level navigation to a `blob:` URL,
 * WKWebView refuses to load that, and the user sees precisely nothing happen — which is
 * exactly the report: works in Safari, dead in Chrome on an iPhone.
 *
 * The replacement on those browsers is the native share sheet, whose `Save Image` writes
 * to Photos. `navigator.share` needs a live user activation, and WebKit only keeps one
 * for a few seconds, so a slow fetch before the call can expire it — that rejects with
 * `NotAllowedError`, which is reported as `unsupported` so the caller can tell the user
 * to press and hold the image instead. Nothing changes on desktop, Android or iOS
 * Safari; those keep the anchor.
 */
export async function saveImageBlob(blob: Blob, filename: string): Promise<SaveImageResult> {
  if (isIos() && !isIosSafari()) {
    const file = new File([blob], filename, { type: blob.type || 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
        return 'shared'
      } catch (err) {
        // The user backing out of the sheet is a completed action, not a failure.
        if ((err as DOMException)?.name === 'AbortError') return 'cancelled'
      }
    }
    return 'unsupported'
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}

/** File extension matching an image blob's actual type. */
export function extensionForBlob(blob: Blob): string {
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/jpeg') return 'jpg'
  return 'png'
}
