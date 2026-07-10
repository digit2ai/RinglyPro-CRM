import { supabase } from '../../../configurations/supabase'
import { AUTH_PWA_LINKS } from './auth.constants'
import { isValidEmail, validatePassword } from './auth.validators'

export type AuthActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  const normalizedEmail = email.trim().toLowerCase()

  if (isValidEmail(normalizedEmail) === false) {
    return { ok: false, message: 'Correo inválido' }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: AUTH_PWA_LINKS.newPassword,
  })

  if (error !== null) {
    return { ok: false, message: error.message }
  }

  return {
    ok: true,
    message: 'Si el correo existe, recibirás instrucciones para restablecer la contraseña',
  }
}

export async function updateProfile(fullName: string, email: string): Promise<AuthActionResult> {
  const trimmedName = fullName.trim()
  const normalizedEmail = email.trim().toLowerCase()

  if (trimmedName.length === 0) {
    return { ok: false, message: 'El nombre no puede estar vacío' }
  }

  if (isValidEmail(normalizedEmail) === false) {
    return { ok: false, message: 'Correo inválido' }
  }

  const { error } = await supabase.auth.updateUser(
    {
      email: normalizedEmail,
      data: { full_name: trimmedName },
    },
    { emailRedirectTo: AUTH_PWA_LINKS.login },
  )

  if (error !== null) {
    return { ok: false, message: error.message }
  }

  return { ok: true, message: 'Perfil actualizado' }
}

export async function deleteAccount(): Promise<AuthActionResult> {
  const { error } = await supabase.functions.invoke('delete-account')

  if (error !== null) {
    return { ok: false, message: error.message }
  }

  await supabase.auth.signOut()

  return { ok: true, message: 'Cuenta eliminada' }
}

export async function saveRecoveredPassword(password: string): Promise<AuthActionResult> {
  const validationError = validatePassword(password)

  if (validationError !== null) {
    return { ok: false, message: validationError }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error !== null) {
    return { ok: false, message: error.message }
  }

  return {
    ok: true,
    message: 'Contraseña actualizada',
  }
}
