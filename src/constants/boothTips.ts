/**
 * The four screens a booth session moves through, in order. Each one gets its own
 * set of tips — what to do *here*, not a tour of the whole product — so the popup
 * always answers the question the person is actually looking at.
 *
 * The stage isn't derived: whichever component owns a screen declares it through
 * `useBoothStage`, so the branch conditions live in exactly one place (`CameraStage`
 * / `RoomLobby`) and can't drift out of step with a copy of themselves.
 */
export const BOOTH_STAGES = ['lobby', 'booth', 'arrange', 'result'] as const

export type BoothStage = (typeof BOOTH_STAGES)[number]

/**
 * Set when someone says they've used the booth before — the one part of this that
 * outlives the session, because it's a fact about the person rather than about this
 * particular run. Which stages have been read is deliberately *not* stored: the tips
 * are a walkthrough of the booth you're in, so every session gets one until the person
 * tells us they don't need it.
 */
export const TIPS_MUTED_STORAGE_KEY = 'momoto.tips.muted'

/**
 * How long the card has to stand on screen before it counts as read. It isn't a modal
 * any more, so most people will simply leave it be and carry on — moving off the
 * screen it belongs to is as good an acknowledgement as pressing "Got it".
 *
 * The threshold is what separates that from a card nobody actually saw: React mounts
 * a component twice in development, and a screen that unmounts and comes straight
 * back puts the card up and takes it away inside the same tick.
 */
export const TIPS_READ_MS = 1500
