import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../../configurations/supabase'
import type { ScoreEntry } from '../../scoring/components/PlaneaScoreOnboarding.types'
import { updateProfile, deleteAccount } from '../api/auth.service'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signUp: (fullName: string, email: string, password: string, scoreData?: ScoreEntry) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (fullName: string, email: string) => Promise<{ ok: boolean; message: string }>
  deleteAccount: () => Promise<{ ok: boolean; message: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let authEventReceived = false

    function applySession(nextSession: Session | null) {
      if (mounted === false) return

      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true
      applySession(nextSession)
    })

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()

      if (error !== null) {
        console.error('Error loading session:', error.message)
      }

      if (authEventReceived) return

      applySession(data.session)
    }

    void loadSession()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      loading,
      signUp: async (fullName: string, email: string, password: string, scoreData?: ScoreEntry) => {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              ...(scoreData !== undefined && { score_data: scoreData }),
            },
          },
        })

        if (error !== null) throw error
      },
      signIn: async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error !== null) throw error

        setSession(data.session)
        setUser(data.user)
        setLoading(false)
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()

        if (error !== null) throw error

        setSession(null)
        setUser(null)
        setLoading(false)
      },
      updateProfile: async (fullName: string, email: string) => {
        const result = await updateProfile(fullName, email)

        if (result.ok) {
          const { data } = await supabase.auth.getUser()
          if (data.user !== null) setUser(data.user)
        }

        return result
      },
      deleteAccount: async () => {
        const result = await deleteAccount()

        if (result.ok) {
          setSession(null)
          setUser(null)
          setLoading(false)
        }

        return result
      },
    }),
    [session, user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
