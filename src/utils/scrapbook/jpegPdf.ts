/**
 * A PDF whose pages are each one full-bleed JPEG — all a finished scrapbook is.
 *
 * Written here rather than with a PDF library: the format for this case is a handful of
 * objects, and each page's JPEG goes in byte for byte (`/DCTDecode`), so nothing is
 * re-encoded and nothing is added to the bundle. The plan named `jspdf`; this replaces it
 * (docs/PLAN-scrapbook.md §7).
 *
 * Structure: catalog → pages → for each page a page object, its content stream (draw the
 * image over the whole page) and the image itself; then the cross-reference table the
 * format requires, with every object's byte offset.
 */

export interface PdfPageImage {
  /** Baseline JPEG bytes, as `canvas.toBlob('image/jpeg')` produces. */
  jpeg: Uint8Array
  /** The image's pixel size. */
  width: number
  height: number
}

/** A5 in PDF points (1/72 in): 148 × 210 mm. */
export const A5_POINTS = { width: 419.53, height: 595.28 }

const encoder = new TextEncoder()

export function jpegPagesToPdf(
  pages: PdfPageImage[],
  pageSize: { width: number; height: number } = A5_POINTS
): Blob {
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  /** Start object `n`, recording where it begins for the xref table. */
  const begin = (n: number) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
  }

  const w = pageSize.width.toFixed(2)
  const h = pageSize.height.toFixed(2)
  // Objects: 1 catalog, 2 pages, 3 info, then three per page from 4.
  const pageObject = (index: number) => 4 + index * 3

  // The header's second line is binary on purpose: it tells tools the file holds binary.
  push('%PDF-1.4\n%âãÏÓ\n')

  begin(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  begin(2)
  const kids = pages.map((_, index) => `${pageObject(index)} 0 R`).join(' ')
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`)

  begin(3)
  push('<< /Producer (Momoto) /Creator (Momoto scrapbook) >>\nendobj\n')

  pages.forEach((page, index) => {
    const pageId = pageObject(index)
    const contentId = pageId + 1
    const imageId = pageId + 2

    begin(pageId)
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    )

    // Scale the unit-square image to the whole page and draw it.
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`
    begin(contentId)
    push(`<< /Length ${encoder.encode(draw).length} >>\nstream\n${draw}endstream\nendobj\n`)

    begin(imageId)
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
    )
    push(page.jpeg)
    push('\nendstream\nendobj\n')
  })

  const objectCount = 3 + pages.length * 3
  const xref = length
  push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`)
  for (let n = 1; n <= objectCount; n++) {
    push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  }
  push(
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  )

  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
