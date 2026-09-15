import { Instagram } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import logoUrl from '@/assets/logo-momoto.svg'
import { ROUTES } from '@/constants/routes'

import styles from './Footer.module.scss'

const INSTAGRAM_URL = 'https://instagram.com/momoto.ldr'

/**
 * The pages every visitor is entitled to reach from anywhere. The two documents sit
 * here as well as in the profile — a signed-out visitor has no profile. The Help
 * Center sits here *only*: it answers "is it free?" and "do I need an app?", which are
 * questions people ask before they have an account, so the footer is its one way in.
 */
const LEGAL_LINKS = [
  { to: ROUTES.help, labelKey: 'nav.help' },
  { to: ROUTES.terms, labelKey: 'terms.title' },
  { to: ROUTES.privacy, labelKey: 'privacy.title' },
] as const

export default function Footer() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        {/* Four strips of coloured tape along the top edge, inset to the content
         * width. It's the one flourish the footer borrows from the landing pinboard,
         * and it does the job the old backdrop blur was doing: marking where the page
         * stops. */}
        <span className={styles.tape} aria-hidden="true">
          <span className={styles.tapePink} />
          <span className={styles.tapeAmber} />
          <span className={styles.tapeMint} />
          <span className={styles.tapeBlue} />
        </span>

        <div className={styles.brandBlock}>
          <img src={logoUrl} alt={t('brand.name')} className={styles.logo} />
          <span className={styles.tag}>{t('landing.footerTag')}</span>
        </div>

        <div className={styles.end}>
          <nav className={styles.nav} aria-label={t('footer.legal')}>
            {LEGAL_LINKS.map(({ to, labelKey }) => (
              <Link key={to} className={styles.navLink} to={to}>
                {t(labelKey)}
              </Link>
            ))}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.social}
              aria-label={t('footer.instagram')}
              title={t('footer.instagram')}
            >
              <Instagram />
            </a>
          </nav>
          <span className={styles.copyright}>
            &copy; {year} {t('brand.name')}. {t('common.copyright')}
          </span>
        </div>
      </div>
    </footer>
  )
}
