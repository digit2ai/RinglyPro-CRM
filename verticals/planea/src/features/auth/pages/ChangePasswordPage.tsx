import { useHistory } from 'react-router-dom'
import { ChevronLeftIcon } from '@heroicons/react/24/outline'
import { ChangePasswordForm } from '../components/ChangePasswordForm'

export function ChangePasswordPage() {
  const history = useHistory()

  return (
    <div className="flex h-full flex-col bg-(--off-white)">
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <button
          onClick={() => history.goBack()}
          className="mb-6 flex items-center gap-1 text-sm font-medium text-(--gray-400) hover:text-(--gray-400) cursor-pointer"
        >
          <ChevronLeftIcon className="size-4" />
          Volver
        </button>

        <h1 className="mb-1 text-2xl font-bold text-(--dark)">Seguridad y contraseña</h1>
        <p className="mb-8 text-base text-(--gray-300)">Actualiza tu contraseña de acceso.</p>

        <ChangePasswordForm onSuccess={() => history.goBack()} />
      </div>
    </div>
  )
}
