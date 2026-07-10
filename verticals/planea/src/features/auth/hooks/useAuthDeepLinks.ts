import { useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { useHistory } from 'react-router-dom'
import { supabase } from '../../../configurations/supabase'
import { AUTH_ROUTES } from '../api/auth.constants'

function getParsedUrl(url: string) {
  return new URL(url, window.location.origin)
}

function getHashParams(parsedUrl: URL) {
  return new URLSearchParams(parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash)
}

function isPasswordRecoveryUrl(url: string) {
  const parsedUrl = getParsedUrl(url)

  if (parsedUrl.searchParams.get('type') === 'recovery') {
    return true
  }

  return getHashParams(parsedUrl).get('type') === 'recovery'
}

async function restoreSessionFromUrl(url: string) {
  const parsedUrl = getParsedUrl(url)
  const hashParams = getHashParams(parsedUrl)
  const accessToken = parsedUrl.searchParams.get('access_token') ?? hashParams.get('access_token')
  const refreshToken = parsedUrl.searchParams.get('refresh_token') ?? hashParams.get('refresh_token')

  if (accessToken === null || refreshToken === null) {
    await supabase.auth.getSession()
    return
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error !== null) {
    console.error('Error restoring auth session from deep link:', error.message)
  }
}

export function useAuthDeepLinks() {
  const history = useHistory()

  useEffect(() => {
    function navigateToNewPassword() {
      if (window.location.pathname !== AUTH_ROUTES.newPassword) {
        history.replace(AUTH_ROUTES.newPassword)
      }
    }

    if (isPasswordRecoveryUrl(window.location.href)) {
      navigateToNewPassword()
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigateToNewPassword()
      }

      if (event === 'USER_UPDATED') {
        void supabase.auth.getUser()
      }
    })

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (url.length === 0) return

      if (isPasswordRecoveryUrl(url)) {
        navigateToNewPassword()
      }

      await restoreSessionFromUrl(url)
    })

    return () => {
      subscription.unsubscribe()
      listenerPromise.then((handle) => handle.remove())
    }
  }, [history])
}
