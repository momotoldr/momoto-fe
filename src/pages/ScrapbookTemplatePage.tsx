import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ANALYTICS_EVENTS, trackEvents, useTrackPageView } from '@/analytics'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import {
  DEFAULT_SCRAPBOOK_TEMPLATE_ID,
  SCRAPBOOK_TEMPLATES,
  type ScrapbookTemplate,
} from '@/constants/scrapbookTemplates'
import { pageLabel } from '@/features/scrapbook/pageLabel'
import { ScrapbookPageView } from '@/features/scrapbook/ScrapbookPageView'
import { cn } from '@/lib/utils'
import { useScrapbookStore } from '@/store/useScrapbookStore'
import type { ScrapbookContent } from '@/types/scrapbookType'

import styles from './ScrapbookTemplatePage.module.scss'

/** A template shown as it is before anything is placed: art only. */
const EMPTY: ScrapbookContent = { strips: {}, texts: {} }

/**
 * Choosing a template — the step between "New scrapbook" and the editor (user decision,
 * 2026-10-15). Nothing is created until a template is picked: the draft is made by "Use
 * this template", and only then does the user land in the editor.
 *
 * Every page of the selected template is previewed, so it's clear what there is to fill
 * before committing. A scrapbook keeps its template for life (`Scrapbook.templateId`), so
 * the choice is made here or not at all.
 */
export function ScrapbookTemplatePage() {
  useTrackPageView()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useScrapbookStore((state) => state.create)
  const quota = useScrapbookStore((state) => state.quota)

  const [selectedId, setSelectedId] = useState(DEFAULT_SCRAPBOOK_TEMPLATE_ID)
  const [creating, setCreating] = useState(false)
  const selected =
    SCRAPBOOK_TEMPLATES.find((template) => template.id === selectedId) ?? SCRAPBOOK_TEMPLATES[0]

  // Known only once the shelf has loaded this session; otherwise the create itself answers.
  const full = quota !== null && quota.limit > 0 && quota.used >= quota.limit

  const start = async () => {
    if (!selected) return
    setCreating(true)
    const result = await create(selected.id)
    setCreating(false)
    if (result.ok) {
      trackEvents(ANALYTICS_EVENTS.SCRAPBOOK_CREATED, { from: 'new' })
      // Replace: Back from the editor returns to the shelf, not to this picker.
      navigate(ROUTES.scrapbookEdit.replace(':scrapbookId', result.scrapbook.id), {
        replace: true,
      })
      return
    }
    if (result.reason === 'limit') {
      toast.error(t('scrapbook.shelf.limit', { limit: quota?.limit ?? 0 }))
      navigate(ROUTES.scrapbook)
      return
    }
    toast.error(t('scrapbook.shelf.createError'))
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link to={ROUTES.scrapbook} className={styles.back}>
          <ArrowLeft aria-hidden="true" />
          {t('scrapbook.editor.back')}
        </Link>
        <h1 className={styles.title}>{t('scrapbook.picker.title')}</h1>
        <p className={styles.subtitle}>{t('scrapbook.picker.subtitle')}</p>
      </header>

      <div className={styles.body}>
        <section aria-label={t('scrapbook.picker.templates')}>
          <ul className={styles.templates} role="radiogroup">
            {SCRAPBOOK_TEMPLATES.map((template) => (
              <li key={template.id}>
                <TemplateCard
                  template={template}
                  selected={template.id === selected?.id}
                  onSelect={() => setSelectedId(template.id)}
                />
              </li>
            ))}
          </ul>
        </section>

        {selected && (
          <section className={styles.preview} aria-label={t('scrapbook.picker.pagesLabel')}>
            <h2 className={styles.previewTitle}>
              {t(`scrapbook.templates.${selected.label}`)}
              <span className={styles.previewCount}>
                {t('scrapbook.picker.pages', { count: selected.pages.length })}
              </span>
            </h2>
            <ol className={styles.pages}>
              {selected.pages.map((page, index) => (
                <li key={page.id} className={styles.pageItem}>
                  <ScrapbookPageView
                    template={selected}
                    page={page}
                    content={EMPTY}
                    strips={{}}
                    mode="thumb"
                  />
                  <span className={styles.pageLabel}>{pageLabel(page, index, t)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <div className={styles.actions}>
        {full && (
          <p className={styles.full}>{t('scrapbook.shelf.limit', { limit: quota.limit })}</p>
        )}
        <Button size="lg" disabled={!selected || creating || full} onClick={() => void start()}>
          {creating && <Loader2 className={styles.spin} />}
          {t(creating ? 'scrapbook.shelf.creating' : 'scrapbook.picker.use')}
        </Button>
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: ScrapbookTemplate
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const name = t(`scrapbook.templates.${template.label}`)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(styles.card, selected && styles.cardSelected)}
      onClick={onSelect}
    >
      <span className={styles.cardCover} style={{ aspectRatio: `${template.aspect}` }}>
        <img src={template.pages[0]?.background} alt="" className={styles.cardImage} />
        {selected && (
          <span className={styles.cardCheck} aria-hidden="true">
            <Check />
          </span>
        )}
      </span>
      <span className={styles.cardName}>{name}</span>
      <span className={styles.cardMeta}>
        {t('scrapbook.picker.pages', { count: template.pages.length })}
      </span>
    </button>
  )
}
