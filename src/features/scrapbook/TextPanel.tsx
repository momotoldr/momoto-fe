import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Textarea } from '@/components/ui/textarea'
import type { ScrapbookTextSlot } from '@/constants/scrapbookTemplates'
import { cn } from '@/lib/utils'
import { layoutScrapbookText } from '@/utils/scrapbook/layoutText'

import styles from './TextPanel.module.scss'

/**
 * The longest version of `next` that fits the slot, keeping everything that was already in
 * `previous`: the inserted run is found by the text the two share at each end, then cut to
 * the longest prefix of it that still fits (binary search — each probe is one layout).
 */
function fitInsertion(previous: string, next: string, slot: ScrapbookTextSlot): string {
  let head = 0
  while (head < previous.length && previous[head] === next[head]) head++
  let tail = 0
  while (
    tail < previous.length - head &&
    previous[previous.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail++
  }
  const before = next.slice(0, head)
  const inserted = Array.from(next.slice(head, next.length - tail))
  const after = next.slice(next.length - tail)
  let low = 0
  let high = inserted.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = before + inserted.slice(0, mid).join('') + after
    if (layoutScrapbookText(candidate, slot).fits) low = mid
    else high = mid - 1
  }
  return before + inserted.slice(0, low).join('') + after
}

interface TextPanelProps {
  slot: ScrapbookTextSlot
  value: string
  onChange: (value: string) => void
}

/**
 * Where a text slot is written. A regular-size field rather than typing on the page
 * itself: on a phone a whole page is ~360px wide and a note's text is a few pixels tall,
 * so the page shows the result live while the writing happens here.
 *
 * Input that wouldn't fit the slot — past its character limit or its line count, as
 * `layoutScrapbookText` measures it — is refused as it's typed, so what's saved always
 * fits and the PDF never has to cut anything off. Deleting is always allowed.
 */
export function TextPanel({ slot, value, onChange }: TextPanelProps) {
  const { t } = useTranslation()
  const [full, setFull] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const single = slot.maxLines === 1

  // A new slot picked: start typing in it straight away.
  useEffect(() => {
    setFull(false)
    field.current?.focus()
  }, [slot.id])

  const lines = useMemo(() => layoutScrapbookText(value, slot).lines.length, [value, slot])

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    let next = event.target.value.replace(/\r\n?/g, '\n')
    if (single) next = next.replace(/\n/g, ' ')
    if (next.length < value.length || layoutScrapbookText(next, slot).fits) {
      setFull(false)
      onChange(next)
      return
    }
    // Too much for the slot. Keep as much of what was just typed or pasted as fits,
    // wherever the caret was: a paste longer than the slot is cut, not thrown away whole.
    const fitted = fitInsertion(value, next, slot)
    setFull(true)
    if (fitted !== value) onChange(fitted)
  }

  // A one-line slot has nowhere for a new line to go.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (single && event.key === 'Enter') event.preventDefault()
  }

  return (
    <section className={styles.panel}>
      <label className={styles.label} htmlFor={`scrapbook-text-${slot.id}`}>
        {t(`scrapbook.text.label_${slot.placeholder}`)}
      </label>
      <Textarea
        id={`scrapbook-text-${slot.id}`}
        ref={field}
        value={value}
        maxLength={slot.maxLength}
        rows={single ? 1 : Math.min(slot.maxLines, 6)}
        placeholder={t(`scrapbook.placeholders.${slot.placeholder}`)}
        className={styles.field}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <div className={styles.meta}>
        <span className={cn(styles.full, !full && styles.fullHidden)} role="status">
          {t('scrapbook.text.full')}
        </span>
        <span className={styles.counter}>
          {!single && (
            <>
              {t('scrapbook.text.lines', { used: Math.max(1, lines), max: slot.maxLines })}
              {' · '}
            </>
          )}
          {t('scrapbook.text.counter', { used: value.length, max: slot.maxLength })}
        </span>
      </div>
    </section>
  )
}
