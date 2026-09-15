import { Star } from 'lucide-react'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchTestimonials } from '@/api/services/testimonialsService'
import type {
  PublicTestimonial,
  TestimonialPerson,
  TestimonialPlace,
} from '@/types/testimonialsType'

import styles from './LandingTestimonials.module.scss'

/** The most cards the row holds — the same cap the server puts on published ones. */
const MAX_TESTIMONIALS = 10

/** Fewer than this and the section stays away: a one- or two-card marquee repeats the
 * same face all the way across the screen. */
const TESTIMONIALS_MIN = 3

const STARS = [1, 2, 3, 4, 5] as const

/** Tape and avatar share a tone, cycled by position — the same pink / mint / blue the
 * stats dashes use — so neighbouring cards read apart at a glance. */
const TONES = [
  { tape: styles.tapePink, avatar: styles.avatarPink },
  { tape: styles.tapeMint, avatar: styles.avatarMint },
  { tape: styles.tapeBlue, avatar: styles.avatarBlue },
]

/** "Bandung", "Kab. Bandung", "Tokyo, Japan", or just "Japan" — in the reader's language. */
function placeText(place: TestimonialPlace | null, countryNames: Intl.DisplayNames): string | null {
  if (!place) return null
  if (place.countryCode === 'ID') return place.name
  let country = place.countryCode
  try {
    country = countryNames.of(place.countryCode) ?? place.countryCode
  } catch {
    // An unexpected code prints as itself rather than taking the card down.
  }
  return place.name ? `${place.name}, ${country}` : country
}

/** A couple's places joined in name order, once if they match; null when nobody has one. */
function metaLine(people: TestimonialPerson[], countryNames: Intl.DisplayNames): string | null {
  const places = people
    .map((person) => placeText(person.place, countryNames))
    .filter((place): place is string => Boolean(place))
  const unique = places.filter((place, index) => places.indexOf(place) === index)
  return unique.length > 0 ? unique.join(' — ') : null
}

/** "What people say" — real rating comments an admin has published, gliding past in one row.
 *
 * The cards are exactly what `GET /testimonials` returns, and only after it answers:
 * nothing renders while loading, on a failure, or with fewer than `TESTIMONIALS_MIN`. There
 * is deliberately no `localStorage` head start like `LandingStats` has — a stale copy
 * could show a card that has since been unpublished, and the section is below the fold.
 *
 * The row is a CSS marquee: the cards are rendered twice, side by side, and the pair
 * slides left by exactly one copy's width before looping, so the seam never shows. The
 * second copy is `aria-hidden` — a screen reader hears each quote once. Hovering or
 * focusing the row pauses it, and visitors who ask for reduced motion get a still,
 * swipeable row instead (all in the stylesheet).
 *
 * Sits between the stats and the closing call to action: the numbers say people are
 * here, the quotes say why they stay. */
export function LandingTestimonials() {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<PublicTestimonial[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchTestimonials(controller.signal)
      .then(setItems)
      // A failure keeps the section away; there's nothing stale to fall back to.
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const lang = i18n.language.toLowerCase().startsWith('id') ? 'id' : 'en'
  const countryNames = useMemo(() => new Intl.DisplayNames([lang], { type: 'region' }), [lang])

  if (!items || items.length < TESTIMONIALS_MIN) return null
  const shown = items.slice(0, MAX_TESTIMONIALS)

  const cards = shown.map((item, index) => {
    const tone = TONES[index % TONES.length]
    const partnerTone = TONES[(index + 1) % TONES.length]
    const meta = metaLine(item.people, countryNames)

    return (
      <li key={item.id} className={styles.card}>
        <span className={`${styles.tape} ${tone.tape}`}>
          {t(`landing.testimonials.features.${item.feature}`)}
        </span>
        <figure className={styles.figure}>
          <span
            className={styles.stars}
            role="img"
            aria-label={t('landing.testimonials.rated', { count: item.rating })}
          >
            {STARS.map((star) => (
              <Star
                key={star}
                className={star <= item.rating ? styles.starOn : styles.starOff}
                aria-hidden="true"
              />
            ))}
          </span>
          <blockquote className={styles.quote}>
            <p>{lang === 'id' ? item.quoteId : item.quoteEn}</p>
          </blockquote>
          <figcaption className={styles.author}>
            {/* Names carry who it is; the pictures are decoration. */}
            <span className={styles.avatars} aria-hidden="true">
              {item.people.map((person, i) =>
                person.avatarUrl ? (
                  <img
                    key={i}
                    className={styles.avatarImage}
                    src={person.avatarUrl}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span
                    key={i}
                    className={`${styles.avatar} ${i === 0 ? tone.avatar : partnerTone.avatar}`}
                  >
                    {person.name.charAt(0)}
                  </span>
                )
              )}
            </span>
            <span className={styles.authorText}>
              <span className={styles.name}>{item.people.map((p) => p.name).join(' & ')}</span>
              {meta ? <span className={styles.meta}>{meta}</span> : null}
            </span>
          </figcaption>
        </figure>
      </li>
    )
  })

  return (
    <section className={styles.testimonials} aria-labelledby="testimonials-heading">
      <div className={styles.head}>
        <h2 id="testimonials-heading" className={styles.title}>
          {t('landing.testimonials.title')}
        </h2>
        <p className={styles.subtitle}>{t('landing.testimonials.subtitle')}</p>
      </div>

      {/* Focusable so a keyboard reader can pause the marquee too, not just a mouse.
       * The count sets the loop's duration, so the speed stays the same however many
       * quotes there are. */}
      <div
        className={styles.viewport}
        tabIndex={0}
        role="region"
        aria-label={t('landing.testimonials.title')}
        style={{ '--testimonial-count': shown.length } as CSSProperties}
      >
        <div className={styles.marquee}>
          <ul className={styles.track}>{cards}</ul>
          <ul className={`${styles.track} ${styles.clone}`} aria-hidden="true">
            {cards}
          </ul>
        </div>
      </div>
    </section>
  )
}
