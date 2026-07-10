import { useState } from 'react'
import { useHistory } from 'react-router-dom'
import { NewPassword } from '../components/NewPassword'
import { saveRecoveredPassword } from '../api/auth.service'
import { usePasswordRecovery } from '../hooks/usePasswordRecovery'
import { AUTH_ROUTES } from '../api/auth.constants'

export function NewPasswordPage() {
  const history = useHistory()
  const { isChecking, isRecoverySession } = usePasswordRecovery()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleLoginClick() {
    history.push(AUTH_ROUTES.login)
  }

  async function handleSubmit(password: string, confirmPassword: string) {
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    setError(null)

    const result = await saveRecoveredPassword(password)

    setLoading(false)

    if (result.ok) {
      history.replace(AUTH_ROUTES.login)
    } else {
      setError(result.message)
    }
  }

  return (
    <NewPassword
      onLoginClick={handleLoginClick}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      isChecking={isChecking}
      isRecoverySession={isRecoverySession}
    />
  )
}
