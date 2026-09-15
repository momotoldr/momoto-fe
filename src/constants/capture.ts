/** Number of shots that make up a photo strip. */
export const SHOT_COUNT = 4

/** Countdown length (seconds) shown before each shot. */
export const COUNTDOWN_SECONDS = 3

/** How long the just-captured shot is shown before the next countdown (ms). */
export const SHOT_REVIEW_MS = 1000

/**
 * Capture the mirrored image so the saved frame matches the mirrored on-screen
 * preview (selfie-style). Set to `false` to store the true (un-mirrored) camera
 * image.
 */
export const MIRROR_CAPTURE = true

/**
 * A cut's aspect is not a constant: it comes from the chosen strip template's slot
 * (`slotAspect` in constants/stripTemplates), since the template is picked before
 * capture. Each person's cell is that aspect divided by the number of cameras, and
 * the live preview tiles are shaped to match — see `captureCompositeFrame`.
 */
