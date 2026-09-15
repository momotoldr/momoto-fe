/**
 * Fallback footer title, drawn at the bottom of the strip when `composeStrip` is
 * called without a `title`. StripResult always passes the localised `brand.name`, so
 * this only shows up in tools and tests — it said "Virtual Photobooth", which is the
 * activity's name, not the wordmark that belongs on the paper. Keep it equal to
 * `brand.name` (and to STRIP_WATERMARK below) so a footer can never disagree with the
 * watermark tiled over the same strip.
 */
export const STRIP_TITLE = 'Momoto'

/** Fallback footer text color when a template doesn't define its own. */
export const STRIP_TEXT_COLOR = '#0f172a'

/**
 * Wordmark tiled diagonally across the strip as a watermark. Baked into the
 * preview + download so a free strip is always marked; a future paid download
 * removes it by composing with `watermark: false`.
 */
export const STRIP_WATERMARK = 'Momoto'
