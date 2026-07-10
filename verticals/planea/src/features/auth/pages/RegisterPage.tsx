import { useHistory } from 'react-router-dom'
import { Register } from '../components/Register'

export function RegisterPage() {
  const history = useHistory()

  function handleSuccess() {
    history.push('/login', { successMessage: 'Registro exitoso. Revisa tu correo para confirmar tu cuenta.' })
  }

  function handleLoginClick() {
    history.push('/login')
  }

  return (
    <Register
      onSuccess={handleSuccess}
      onLoginClick={handleLoginClick}
    />
  )
}
