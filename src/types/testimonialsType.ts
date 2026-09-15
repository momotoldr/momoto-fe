/** Feature tag keys; labels live under `landing.testimonials.features`. */
export const TESTIMONIAL_FEATURES = [
  'date',
  'group',
  'solo',
  'templates',
  'stickers',
  'print',
  'invite',
] as const

export type TestimonialFeature = (typeof TESTIMONIAL_FEATURES)[number]

/** Where someone on a card lives. The country name is added in the reader's language. */
export interface TestimonialPlace {
  /** ISO 3166-1 alpha-2; 'ID' for Indonesia. */
  countryCode: string
  /** "Bandung" / "Kab. Bandung" in Indonesia, the typed city abroad, or null. */
  name: string | null
}

export interface TestimonialPerson {
  name: string
  place: TestimonialPlace | null
  /** An uploaded picture on the CDN, or null — the card then shows an initial. */
  avatarUrl: string | null
}

/** One published card from `GET /testimonials`. */
export interface PublicTestimonial {
  id: string
  quoteEn: string
  quoteId: string
  feature: TestimonialFeature
  /** The author's stars, 1–5. */
  rating: number
  /** The author, then their partner on a couple card. */
  people: TestimonialPerson[]
}
