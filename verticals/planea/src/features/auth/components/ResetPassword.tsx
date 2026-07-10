import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SuccessAlert } from '../../../shared/components/SuccessAlert'

type Props = {
  onLoginClick?: () => void
  onSubmit?: (email: string) => Promise<void>
  loading?: boolean
  error?: string | null
  successMessage?: string
}

export function ResetPassword(props: Props) {
  const { onLoginClick, onSubmit, loading = false, error = null, successMessage } = props
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (onSubmit !== undefined) {
      await onSubmit(email)
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
          {t('resetPassword.form.title')}
        </h2>
        <p className="mt-2 text-center text-sm text-(--gray-300)">
          {t('resetPassword.form.description')}
        </p>
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
              {t('resetPassword.form.emailLabel')}
            </label>
            <div className="mt-2">
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-(--dark) outline-1 -outline-offset-1 outline-(--gray-200) placeholder:text-(--gray-300) focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary3-400) sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-(--gray-300) dark:focus:outline-(--secondary3-200)"
              />
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
              {loading ? t('resetPassword.form.submittingButton') : t('resetPassword.form.submitButton')}
            </button>
          </div>
        </form>

        {onLoginClick !== undefined && (
          <p className="mt-10 text-center text-sm/6 text-(--gray-300)">
            {t('resetPassword.links.alreadyAccountText')}{' '}
            <button
              onClick={onLoginClick}
              className="font-semibold text-(--secondary3-400) hover:text-(--secondary3-200) cursor-pointer"
            >
              {t('resetPassword.links.loginLink')}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
