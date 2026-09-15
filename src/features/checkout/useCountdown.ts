import { useEffect, useState } from 'react'

/**
 * `mm:ss` remaining until `expiresAt`, or null once there is nothing left to count.
 *
 * Shared by the checkout modal and the cart's resume banner so a payment shows the same
 * deadline wherever the user happens to be looking at it.
 */
export function useCountdown(expiresAt: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!expiresAt) {
      setLabel(null)
      return
    }
    const render = () => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      if (ms <= 0) {
        setLabel(null)
        return
      }
      const total = Math.floor(ms / 1000)
      const mm = String(Math.floor(total / 60)).padStart(2, '0')
      const ss = String(total % 60).padStart(2, '0')
      setLabel(`${mm}:${ss}`)
    }
    render()
    const id = setInterval(render, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  return label
}
