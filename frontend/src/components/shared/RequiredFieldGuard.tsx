import type { ReactNode } from 'react'

interface RequiredFieldGuardProps {
  required?: boolean
  children: ReactNode
  label?: string
  errorMessage?: string
}

export default function RequiredFieldGuard({
  required = true,
  children,
  label: _label,
  errorMessage: _errorMessage,
}: RequiredFieldGuardProps) {
  // UI requirement: required fields should be indicated only by "*" in the label.
  // No extra red ring or warning badge.
  void required
  return <>{children}</>
}
