import { useState } from 'react'
import { useHistory } from 'react-router-dom'
import { ResetPassword } from '../components/ResetPassword'
import { requestPasswordReset } from '../api/auth.service'

export function ResetPasswordPage() {
  const history = useHistory()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | undefined>(undefined)
  const [formKey, setFormKey] = useState(0)

  function handleLoginClick() {
    history.push('/login')
  }

  async function handleSubmit(email: string) {
    setLoading(true)
    setError(null)
    setSuccessMessage(undefined)

    const result = await requestPasswordReset(email)

    setLoading(false)

    if (result.ok) {
      setSuccessMessage(result.message)
      setFormKey((k) => k + 1)
    } else {
      setError(result.message)
    }
  }

  return (
    <ResetPassword
      key={formKey}
      onLoginClick={handleLoginClick}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      successMessage={successMessage}
    />
  )
}
