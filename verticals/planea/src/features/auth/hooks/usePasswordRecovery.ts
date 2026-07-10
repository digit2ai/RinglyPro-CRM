import { useEffect, useState } from 'react'
import { supabase } from '../../../configurations/supabase'

export function usePasswordRecovery() {
  const [isChecking, setIsChecking] = useState(true)
  const [isRecoverySession, setIsRecoverySession] = useState(false)

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      const { data } = await supabase.auth.getSession()

      if (mounted === false) return

      setIsRecoverySession(data.session !== null)
      setIsChecking(false)
    }

    bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true)
        setIsChecking(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { isChecking, isRecoverySession }
}
