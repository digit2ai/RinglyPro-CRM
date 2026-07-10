import type { ReactNode } from 'react'
import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom'
import { useAuth } from '../features/auth/hooks/AuthProvider'
import { useAuthDeepLinks } from '../features/auth/hooks/useAuthDeepLinks'
import { AppHeader } from '../shared/components/AppHeader'
import { BottomNav } from '../shared/components/BottomNav'
import { SideNav } from '../shared/components/SideNav'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { RegisterPage } from '../features/auth/pages/RegisterPage'
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage'
import { NewPasswordPage } from '../features/auth/pages/NewPasswordPage'
import { ProfilePage } from '../features/auth/pages/ProfilePage'
import { ChangePasswordPage } from '../features/auth/pages/ChangePasswordPage'
import { SettingsPage } from '../features/auth/pages/SettingsPage'
import { ContactRequestMessagesPage } from '../features/contact-request-messages/pages/ContactRequestMessagesPage'
import { ContactRequestMessageDetailPage } from '../features/contact-request-messages/pages/ContactRequestMessageDetailPage'
import { HomePage } from '../features/home/pages/HomePage'
import { ScorePage } from '../features/scoring/pages/ScorePage'
import { ProgressPage } from '../features/progress/pages/ProgressPage'
import { PatrimonyPage } from '../features/scoring/pages/PatrimonyPage'

import '../theme/tailwind.css'
import '../../public/styles/theme.css'

export function AppRouter() {
  return (
    <BrowserRouter basename="/planea">
      <AppRoutes />
    </BrowserRouter>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  useAuthDeepLinks()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--off-white) dark:bg-(--primary-500)">
        <p className="text-(--gray-400) dark:text-(--gray-300)">Cargando...</p>
      </div>
    )
  }

  return (
    <Switch>
      <Route
        exact
        path="/score"
        render={() =>
          session !== null ? (
            <ScoreLayout showUser>
              <ScorePage />
            </ScoreLayout>
          ) : (
            <ScoreLayout>
              <ScorePage />
            </ScoreLayout>
          )
        }
      />

      <Route
        exact
        path="/new-password"
        render={() => (
          <CleanLayout>
            <NewPasswordPage />
          </CleanLayout>
        )}
      />

      {session !== null ? (
        <Route
          render={() => (
            <PrivateSessionLayout>
              <Switch>
                <Route exact path="/home" component={HomePage} />
                <Route exact path="/profile" component={ProfilePage} />
                <Route exact path="/change-password" component={ChangePasswordPage} />
                <Route exact path="/progress" component={ProgressPage} />
                <Route exact path="/patrimony" component={PatrimonyPage} />
                <Route exact path="/settings" component={SettingsPage} />
                <Route exact path="/admin/contact-request-messages" component={ContactRequestMessagesPage} />
                <Route exact path="/admin/contact-request-messages/:id" component={ContactRequestMessageDetailPage} />
                <Redirect to="/home" />
              </Switch>
            </PrivateSessionLayout>
          )}
        />
      ) : (
        <Route
          render={() => (
            <PublicSessionLayout>
              <Switch>
                <Route exact path="/login" component={LoginPage} />
                <Route exact path="/register" component={RegisterPage} />
                <Route exact path="/reset-password" component={ResetPasswordPage} />
                <Redirect to="/login" />
              </Switch>
            </PublicSessionLayout>
          )}
        />
      )}
    </Switch>
  )
}

function ScoreLayout({ showUser = false, children }: { showUser?: boolean; children?: ReactNode }) {
  if (showUser) {
    return (
      <div className="flex h-screen">
        <SideNav />

        {/* Mobile/tablet stack */}
        <div className="grid flex-1 min-w-0 2xl:hidden" style={{ gridTemplateRows: 'auto 1fr auto' }}>
          <AppHeader dark />
          <main className="overflow-y-auto">
            {children}
          </main>
          <BottomNav />
        </div>

        {/* Desktop main — sidebar handles nav */}
        <main className="hidden 2xl:flex flex-1 min-w-0 overflow-y-auto flex-col">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div
      className="grid h-screen bg-(--primary-300)"
      style={{ gridTemplateRows: 'auto 1fr' }}
    >
      <AppHeader hideUser dark />
      <main className="overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

function PrivateSessionLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-screen">
      {/* Sidebar — desktop only */}
      <SideNav />

      {/* Mobile/tablet stack */}
      <div className="grid flex-1 min-w-0 2xl:hidden" style={{ gridTemplateRows: 'auto 1fr auto' }}>
        <AppHeader />
        <main className="overflow-y-auto bg-(--off-white)">
          {children}
        </main>
        <BottomNav />
      </div>

      {/* Desktop main — sidebar handles nav */}
      <main className="hidden 2xl:flex flex-1 min-w-0 overflow-y-auto flex-col bg-(--off-white)">
        {children}
      </main>
    </div>
  )
}

function PublicSessionLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

function CleanLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col h-screen">
      <AppHeader hideUser />
      <main className="overflow-y-auto flex-1">
        {children}
      </main>
    </div>
  )
}
