import { FormEvent, useState } from 'react'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/20/solid'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/AuthProvider'
import { SuccessAlert } from '../../../shared/components/SuccessAlert'

interface LoginData {
  email: string
  password: string
}

type Props = {
  successMessage?: string
  onRegisterClick?: () => void
  onResetPasswordClick?: () => void
}

export function Login(props: Props) {
  const { successMessage, onRegisterClick, onResetPasswordClick } = props
  const { signIn } = useAuth()
  const { t, i18n } = useTranslation('auth')
  const [formData, setFormData] = useState<LoginData>({
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await signIn(formData.email, formData.password)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ocurrió un error.'
      setError(message)
    } finally {
      setLoading(false)
      setFormData((prev) => ({ ...prev, password: '' }))
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center bg-(--off-white) px-6 py-12 dark:bg-(--primary-400) lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="mx-auto h-24 w-24 rounded-xl overflow-hidden shadow-lg ring-2 ring-(--gray-100)">
          <img
            src={`${import.meta.env.BASE_URL}images/logo_800x800.jpeg`}
            alt="Planea"
            className="h-full w-full object-cover"
          />
        </div>
        <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-(--dark) dark:text-white">
          {t('login.form.title')}
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {successMessage !== undefined && (
          <div className="mb-6">
            <SuccessAlert message={successMessage} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm/6 font-medium text-(--dark) dark:text-(--gray-100)"
            >
              {t('login.form.emailLabel')}
            </label>
            <div className="mt-2">
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-(--dark) outline-1 -outline-offset-1 outline-(--gray-200) placeholder:text-(--gray-300) focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary3-400) sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-(--gray-300) dark:focus:outline-(--secondary3-200)"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm/6 font-medium text-(--dark) dark:text-(--gray-100)"
            >
              {t('login.form.passwordLabel')}
            </label>
            <div className="mt-2 grid grid-cols-1 focus-within:relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="col-start-1 row-start-1 block w-full rounded-md bg-white py-1.5 pr-10 pl-3 text-base text-(--dark) outline-1 -outline-offset-1 outline-(--gray-200) placeholder:text-(--gray-300) focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary3-400) sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-(--gray-300) dark:focus:outline-(--secondary3-200)"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="col-start-1 row-start-1 mr-3 flex items-center justify-self-end text-(--gray-300) hover:text-(--dark) dark:hover:text-white cursor-pointer"
                aria-label={showPassword ? t('login.form.hidePassword') : t('login.form.showPassword')}
              >
                {showPassword ? (
                  <EyeSlashIcon className="size-4" aria-hidden="true" />
                ) : (
                  <EyeIcon className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error !== null && (
            <div className="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-md bg-(--secondary3-400) px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-(--secondary3-200) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--secondary3-400) disabled:opacity-50 cursor-pointer"
            >
              {loading ? t('login.form.submittingButton') : t('login.form.submitButton')}
            </button>
          </div>
        </form>

        {onRegisterClick !== undefined && (
          <p className="mt-10 text-center text-sm/6 text-(--gray-300)">
            {t('login.links.noAccountText')}{' '}
            <button
              onClick={onRegisterClick}
              className="font-semibold text-(--secondary3-400) hover:text-(--secondary3-200) cursor-pointer"
            >
              {t('login.links.registerLink')}
            </button>
          </p>
        )}

        {onResetPasswordClick !== undefined && (
          <p className="mt-4 text-center text-sm/6 text-(--gray-300)">
            {t('login.links.forgotPasswordText')}{' '}
            <button
              onClick={onResetPasswordClick}
              className="font-semibold text-(--secondary3-400) hover:text-(--secondary3-200) cursor-pointer"
            >
              {t('login.links.resetPasswordLink')}
            </button>
          </p>
        )}

        <div className="mt-10">
          <p className="text-center text-xs text-(--gray-300) mb-3">{t('login.links.changeLanguageTitle')}</p>
          <div className="flex justify-center gap-6">
          <button
            onClick={() => i18n.changeLanguage('es')}
            className="flex items-center gap-2 text-sm text-(--gray-300) hover:text-(--dark) dark:hover:text-white cursor-pointer"
          >
            <span className="fi fi-co rounded-sm" />
            Español
          </button>
          <button
            onClick={() => i18n.changeLanguage('en')}
            className="flex items-center gap-2 text-sm text-(--gray-300) hover:text-(--dark) dark:hover:text-white cursor-pointer"
          >
            <span className="fi fi-us rounded-sm" />
            English
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
