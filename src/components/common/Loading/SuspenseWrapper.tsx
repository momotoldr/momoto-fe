import { Loading } from '@/components/common/Loading'
import { type ReactNode, Suspense } from 'react'

interface SuspenseWrapperProps {
  children: ReactNode
  fallback?: ReactNode
}

export default function SuspenseWrapper({
  children,
  fallback = <Loading />,
}: SuspenseWrapperProps) {
  return <Suspense fallback={fallback}>{children}</Suspense>
}
