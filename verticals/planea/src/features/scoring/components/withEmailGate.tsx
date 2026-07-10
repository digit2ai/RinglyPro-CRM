import { useState } from 'react'
import { flushSync } from 'react-dom'
import { EmailCapture } from './EmailCapture'

export interface WithEmailProps {
  userEmail: string
}

export function withEmailGate<P extends WithEmailProps>(
  WrappedComponent: React.ComponentType<P>,
) {
  return function EmailGated(props: Omit<P, keyof WithEmailProps>) {
    const [email, setEmail] = useState<string | null>(null)

    function handleEmailSubmit(submittedEmail: string) {
      if ('startViewTransition' in document) {
        const transition = document.startViewTransition(() => {
          requestAnimationFrame(() => {
            flushSync(() => setEmail(submittedEmail))
          })
        })
        transition.ready.catch(() => {})
      } else {
        setEmail(submittedEmail)
      }
    }

    if (email === null) {
      return (
        <div style={{ viewTransitionName: 'email-gate-form' }}>
          <EmailCapture onSubmit={handleEmailSubmit} />
        </div>
      )
    }

    return (
      <div style={{ viewTransitionName: 'email-gate-form' }}>
        <WrappedComponent {...(props as P)} userEmail={email} />
      </div>
    )
  }
}
