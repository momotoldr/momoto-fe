import {
  type PublicTestimonial,
  TESTIMONIAL_FEATURES,
  type TestimonialPerson,
} from '@/types/testimonialsType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const testimonialsClient = new AxiosClient()

/** Like the stats counters: below the fold, so not worth holding a slow link open for. */
const TESTIMONIALS_TIMEOUT_MS = 4000

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function toPerson(value: unknown): TestimonialPerson | null {
  const p = value as Partial<TestimonialPerson> | null
  if (!p || !isString(p.name) || !p.name.trim()) return null
  const place =
    p.place && isString(p.place.countryCode)
      ? { countryCode: p.place.countryCode, name: isString(p.place.name) ? p.place.name : null }
      : null
  return { name: p.name, place, avatarUrl: isString(p.avatarUrl) ? p.avatarUrl : null }
}

/** A card the section can render, or null — a malformed one is skipped, not guessed at. */
function toTestimonial(value: unknown): PublicTestimonial | null {
  const t = value as Partial<PublicTestimonial> | null
  if (!t || !isString(t.id) || !isString(t.quoteEn) || !isString(t.quoteId)) return null
  if (!(TESTIMONIAL_FEATURES as readonly unknown[]).includes(t.feature)) return null
  if (typeof t.rating !== 'number' || !Number.isInteger(t.rating) || t.rating < 1 || t.rating > 5) {
    return null
  }
  const people = Array.isArray(t.people) ? t.people.map(toPerson) : []
  if (people.length < 1 || people.length > 2 || people.some((p) => p === null)) return null
  return {
    id: t.id,
    quoteEn: t.quoteEn,
    quoteId: t.quoteId,
    feature: t.feature as PublicTestimonial['feature'],
    rating: t.rating,
    people: people as TestimonialPerson[],
  }
}

/**
 * The published testimonials, in the admin's order. Rejects when the server can't be
 * reached, answers an error, or sends something that isn't a list — the section then
 * stays away rather than showing anything it can't vouch for.
 */
export async function fetchTestimonials(signal?: AbortSignal): Promise<PublicTestimonial[]> {
  const { data } = await testimonialsClient.getData<{ items?: unknown }>(
    API_ROUTES.TESTIMONIALS,
    {},
    { timeout: TESTIMONIALS_TIMEOUT_MS, signal }
  )
  if (!Array.isArray(data?.items)) throw new Error('testimonials returned an invalid body')
  return data.items.map(toTestimonial).filter((t): t is PublicTestimonial => t !== null)
}
