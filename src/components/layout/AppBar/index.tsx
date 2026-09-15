import logoUrl from '@/assets/logo-momoto.png'
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/useAuthStore'
import { useCartStore } from '@/store/useCartStore'
import { Menu, ShoppingBag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation } from 'react-router-dom'
import styles from './Appbar.module.scss'
import { UserMenu } from './UserMenu'

/** How long the cart tip stays up before auto-dismissing (ms). */
const CART_TIP_TIMEOUT = 7000

const NAV_LINKS = [
  { to: ROUTES.home, label: 'nav.home', end: true, hash: false },
  { to: ROUTES.activities, label: 'nav.activities', end: false, hash: false },
]

/**
 * Links that only mean anything once signed in. The gallery holds unlocked strips, which
 * only exist against an account — showing it to a guest would offer a page that can only
 * bounce them to login.
 */
const AUTHED_NAV_LINKS = [{ to: ROUTES.gallery, label: 'nav.gallery', end: false, hash: false }]

export default function Appbar() {
  const { t } = useTranslation()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // Unpaid strips only. Unlocked ones live in the gallery now, so counting the whole
  // list would badge the cart with strips that aren't in it — and fire the "you saved a
  // strip" tip when one merely moved out.
  const cartCount = useCartStore((state) => state.items.reduce((n, i) => n + (i.paid ? 0 : 1), 0))
  // The cart holds this user's strips, so only surface it once signed in.
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const navLinks = isAuthenticated ? [...NAV_LINKS, ...AUTHED_NAV_LINKS] : NAV_LINKS

  // A little popup nudging the user to check out the strips they just saved. It pops
  // whenever the cart count grows (a strip was added) — unless they're already looking
  // at the cart — and auto-dismisses after a few seconds.
  const [tipOpen, setTipOpen] = useState(false)
  const prevCountRef = useRef(cartCount)
  const onCartPage = location.pathname === ROUTES.cart

  useEffect(() => {
    const grew = cartCount > prevCountRef.current
    prevCountRef.current = cartCount
    if (grew && cartCount > 0 && !onCartPage) setTipOpen(true)
  }, [cartCount, onCartPage])

  // Never show it on the cart page itself (they're already there).
  useEffect(() => {
    if (onCartPage) setTipOpen(false)
  }, [onCartPage])

  useEffect(() => {
    if (!tipOpen) return
    const id = window.setTimeout(() => setTipOpen(false), CART_TIP_TIMEOUT)
    return () => window.clearTimeout(id)
  }, [tipOpen])

  const closeMenu = () => setIsMenuOpen(false)
  const closeTip = () => setTipOpen(false)

  return (
    // `data-app-bar`: sticky chrome that outranks everything below it, so the booth's
    // tips card measures it and caps its own height instead of sliding underneath.
    <header className={styles.header} data-app-bar>
      <div className={styles.inner}>
        <Link to={ROUTES.home} className={styles.brand} onClick={closeMenu}>
          <img src={logoUrl} alt="" className={styles.brandLogo} />
        </Link>

        {/* Desktop nav */}
        <nav className={styles.nav} aria-label={t('nav.menu')}>
          {navLinks.map((link) =>
            link.hash ? (
              <Link key={link.to} to={link.to} className={styles.navLink}>
                {t(link.label)}
              </Link>
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                {t(link.label)}
              </NavLink>
            )
          )}
        </nav>

        <div className={styles.actions}>
          {isAuthenticated && (
            <div className={styles.cartWrap}>
              <NavLink
                to={ROUTES.cart}
                className={({ isActive }) => cn(styles.cartLink, isActive && styles.cartLinkActive)}
                aria-label={t('nav.cart')}
                title={t('nav.cart')}
                onClick={() => {
                  closeMenu()
                  closeTip()
                }}
              >
                <ShoppingBag />
                {cartCount > 0 && (
                  <span className={styles.cartBadge} aria-hidden="true">
                    {cartCount}
                  </span>
                )}
              </NavLink>

              {tipOpen && cartCount > 0 && (
                <>
                  <div className={styles.cartTip} role="status">
                    <button
                      type="button"
                      className={styles.cartTipClose}
                      onClick={closeTip}
                      aria-label={t('cart.tipDismiss')}
                    >
                      <X />
                    </button>
                    <p className={styles.cartTipTitle}>
                      {t('cart.tipTitle', { count: cartCount })}
                    </p>
                    <p className={styles.cartTipText}>{t('cart.tipText')}</p>
                    <Link to={ROUTES.cart} className={styles.cartTipCta} onClick={closeTip}>
                      {t('cart.tipCta')}
                    </Link>
                  </div>
                  {/* After the card in the DOM so it paints over the card's top border,
                    and outside it so it tracks the cart icon, not the card. */}
                  <span className={styles.cartTipArrow} aria-hidden="true" />
                </>
              )}
            </div>
          )}
          <UserMenu />
          <LanguageSwitcher />
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={isMenuOpen}
            aria-label={t('nav.menu')}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <nav className={styles.mobileNav} aria-label={t('nav.menu')}>
          {navLinks.map((link) =>
            link.hash ? (
              <Link key={link.to} to={link.to} onClick={closeMenu} className={styles.mobileNavLink}>
                {t(link.label)}
              </Link>
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={closeMenu}
                className={({ isActive }) =>
                  cn(styles.mobileNavLink, isActive && styles.navLinkActive)
                }
              >
                {t(link.label)}
              </NavLink>
            )
          )}
        </nav>
      )}
    </header>
  )
}
