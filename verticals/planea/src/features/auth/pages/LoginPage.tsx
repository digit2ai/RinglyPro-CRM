import { useHistory, useLocation } from 'react-router-dom'
import { Login } from '../components/Login'

interface LocationState {
  successMessage?: string
}

export function LoginPage() {
  const history = useHistory()
  const location = useLocation()

  function handleRegisterClick() {
    history.push('/register')
  }

  function handleResetPasswordClick() {
    history.push('/reset-password')
  }

  return (
    <Login
      successMessage={(location.state as LocationState)?.successMessage}
      onRegisterClick={handleRegisterClick}
      onResetPasswordClick={handleResetPasswordClick}
    />
  )
}
