import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/AuthProvider'
import { useScoreStore } from '../../scoring/stores/scoreStore'
import { useOnboardingUserDataStore } from '../../scoring/stores/onboardingUserDataStore'
import { answersToArray } from '../../scoring/api/scoreOnboarding.calculations'
import type { ScoreEntry } from '../../scoring/components/PlaneaScoreOnboarding.types'

interface RegisterData {
  email: string
  fullName: string
  password: string
}

type Props = {
  onSuccess?: () => void
  onLoginClick?: () => void
}

export function Register(props: Props) {
  const { onSuccess, onLoginClick } = props
  const { signUp } = useAuth()
  const { t } = useTranslation('auth')
  const scoreResult  = useScoreStore(state => state.scoreResult)
  const scoreAnswers = useScoreStore(state => state.scoreAnswers)
  const onboardingEmail = useOnboardingUserDataStore(state => state.userData.email)
  const [formData, setFormData] = useState<RegisterData>({
    email: onboardingEmail ?? '',
    fullName: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (formData.fullName.trim().length === 0) {
      setError(t('register.form.fullNameRequired'))
      setLoading(false)
      return
    }

    try {
      const scoreData: ScoreEntry | undefined =
        scoreResult !== null && scoreAnswers !== null
          ? {
              timestamp: new Date().toISOString(),
              company: null,
              score: scoreResult.score,
              answers: answersToArray(scoreAnswers),
              source: 'survey' as const,
            }
          : undefined

      await signUp(formData.fullName, formData.email, formData.password, scoreData)
      
      if (onSuccess !== undefined) {
        onSuccess()
      } else {
        setMessage(t('register.form.successMessage'))
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error.'
      setError(errorMessage)
    } finally {
      setLoading(false)
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
          {t('register.form.title')}
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm/6 font-medium text-(--dark) dark:text-(--gray-100)"
            >
              {t('register.form.emailLabel')}
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
              htmlFor="fullName"
              className="block text-sm/6 font-medium text-(--dark) dark:text-(--gray-100)"
            >
              {t('register.form.fullNameLabel')}
            </label>
            <div className="mt-2">
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                autoComplete="name"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-(--dark) outline-1 -outline-offset-1 outline-(--gray-200) placeholder:text-(--gray-300) focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary3-400) sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-(--gray-300) dark:focus:outline-(--secondary3-200)"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm/6 font-medium text-(--dark) dark:text-(--gray-100)"
            >
              {t('register.form.passwordLabel')}
            </label>
            <div className="mt-2">
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-(--dark) outline-1 -outline-offset-1 outline-(--gray-200) placeholder:text-(--gray-300) focus:outline-2 focus:-outline-offset-2 focus:outline-(--secondary3-400) sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-(--gray-300) dark:focus:outline-(--secondary3-200)"
              />
            </div>
          </div>

          {error !== null && (
            <div className="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
            </div>
          )}

          {message !== null && (
            <div className="rounded-md bg-green-50 p-3 dark:bg-green-900/20">
              <p className="text-sm text-green-800 dark:text-green-400">{message}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-md bg-(--secondary3-400) px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-(--secondary3-200) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--secondary3-400) disabled:opacity-50 cursor-pointer"
            >
              {loading ? t('register.form.submittingButton') : t('register.form.submitButton')}
            </button>
          </div>
        </form>

        {onLoginClick !== undefined && (
          <p className="mt-10 text-center text-sm/6 text-(--gray-300)">
            {t('register.links.alreadyAccountText')}{' '}
            <button
              onClick={onLoginClick}
              className="font-semibold text-(--secondary3-400) hover:text-(--secondary3-200) cursor-pointer"
            >
              {t('register.links.loginLink')}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
