import { FormEvent, useState } from 'react'
import { saveRecoveredPassword } from '../api/auth.service'

interface Props {
  onSuccess?: () => void
}

export function ChangePasswordForm({ onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    setError(null)

    const result = await saveRecoveredPassword(password)

    setLoading(false)

    if (result.ok) {
      setSuccess(true)
      setPassword('')
      setConfirmPassword('')
      onSuccess?.()
    } else {
      setError(result.message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="cp-password"
          className="block text-sm/6 font-medium text-(--dark)"
        >
          Nueva contraseña
        </label>
        <div className="mt-2">
          <input
            id="cp-password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-(--dark) outline-1 -outline-offset-1 outline-(--gray-200) placeholder:text-(--gray-300) focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary3-400) sm:text-sm/6"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="cp-confirm"
          className="block text-sm/6 font-medium text-(--dark)"
        >
          Confirmar contraseña
        </label>
        <div className="mt-2">
          <input
            id="cp-confirm"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-(--dark) outline-1 -outline-offset-1 outline-(--gray-200) placeholder:text-(--gray-300) focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary3-400) sm:text-sm/6"
          />
        </div>
      </div>

      {error !== null && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-3">
          <p className="text-sm text-green-800">Contraseña actualizada correctamente.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full justify-center rounded-md bg-(--secondary3-400) px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-(--secondary3-300) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--secondary3-400) disabled:opacity-50 cursor-pointer"
      >
        {loading ? 'Guardando…' : 'Actualizar contraseña'}
      </button>
    </form>
  )
}
