/**
 * Convert a data URL (e.g. `canvas.toDataURL(...)`) to a Blob so it can be uploaded
 * as a raw body. Decodes the base64 payload directly instead of `fetch(dataUrl)` —
 * a strict CSP `connect-src` (which does not list the `data:` scheme) blocks fetching
 * data URLs, so decoding in-place keeps this working under the production policy.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const commaIndex = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  const mime = header.match(/^data:([^;,]+)/)?.[1] ?? 'application/octet-stream'

  if (/;base64/i.test(header)) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }

  // Non-base64 data URL: the payload is percent-encoded text.
  return new Blob([decodeURIComponent(payload)], { type: mime })
}
