import {
  ChevronRightIcon,
  ArrowRightStartOnRectangleIcon,
  LockClosedIcon,
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  EnvelopeIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useHistory } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../hooks/AuthProvider'
import { APP_VERSION } from '../../../configurations/app'
import { Toast } from '../../../shared/components/Toast'

function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? ''
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface SettingRow {
  icon: React.ReactNode
  label: string
  onPress: () => void
  danger?: boolean
}

export function ProfilePage() {
  const history = useHistory()
  const { user, signOut, updateProfile, deleteAccount } = useAuth()

  const fullName: string = user?.user_metadata?.full_name ?? user?.email ?? ''
  const initials = fullName.length > 0 ? getInitials(fullName) : '?'
  const email = user?.email ?? ''

  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(fullName)
  const [emailInput, setEmailInput] = useState(email)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [showNameSavedToast, setShowNameSavedToast] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showSupport, setShowSupport] = useState(false)
  const [copiedContact, setCopiedContact] = useState<string | null>(null)

  function handleEditClick() {
    setNameInput(fullName)
    setEmailInput(email)
    setFeedback(null)
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setFeedback(null)
  }

  function handleOpenDeleteDialog() {
    setDeleteConfirmText('')
    setDeleteError(null)
    setDeletingAccount(true)
  }

  function handleCancelDelete() {
    setDeletingAccount(false)
    setDeleteConfirmText('')
    setDeleteError(null)
  }

  async function handleConfirmDelete() {
    setDeleteLoading(true)
    setDeleteError(null)
    const result = await deleteAccount()
    setDeleteLoading(false)
    if (result.ok === false) {
      setDeleteError(result.message)
    }
  }

  async function handleSave() {
    setSaving(true)
    setFeedback(null)
    const result = await updateProfile(nameInput, emailInput)
    setSaving(false)
    if (result.ok) {
      setEditing(false)
      const emailChanged = emailInput.trim().toLowerCase() !== email.trim().toLowerCase()
      if (emailChanged) {
        setShowToast(true)
      } else {
        setShowNameSavedToast(true)
      }
    } else {
      setFeedback(result)
    }
  }

  const settingRows: SettingRow[] = [
    {
      icon: <LockClosedIcon className="size-5" />,
      label: 'Seguridad y contraseña',
      onPress: () => history.push('/change-password'),
    },
    {
      icon: <QuestionMarkCircleIcon className="size-5" />,
      label: 'Ayuda y soporte',
      onPress: () => setShowSupport(true),
    },
    {
      icon: <DocumentTextIcon className="size-5" />,
      label: 'Política de privacidad',
      onPress: () => window.open('https://planea.co/docs/politica-de-privacidad.pdf', '_blank'),
    },
    {
      icon: <DocumentTextIcon className="size-5" />,
      label: 'Términos y condiciones',
      onPress: () => window.open('https://planea.co/docs/terminos-y-condiciones.pdf', '_blank'),
    },
  ]

  async function handleSignOut() {
    try {
      await signOut()
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex h-full flex-col bg-(--off-white)">
      <div className="flex-1 overflow-y-auto">

    {/* ── HERO ── */}
        <div className="bg-(--primary-300) px-5 pb-6 pt-6 2xl:px-10 2xl:py-8">
          <div className="mx-auto 2xl:max-w-6xl">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/15 text-2xl font-bold text-white">
              {initials}
            </div>

            {/* Name + email */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-bold capitalize text-white">{fullName}</p>
              <p className="truncate text-base text-white/55">{email}</p>
            </div>

            {/* Edit button */}
            <button
              onClick={handleEditClick}
              aria-label="Editar perfil"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
            >
              <PencilIcon className="size-5" />
            </button>
          </div>
          </div>
        </div>

        {/* —— 2xl stack: vertical layout —— */}
        <div className="2xl:mx-auto 2xl:max-w-2xl 2xl:px-8 2xl:py-8">

        {/* —— ONBOARDING CTA —— */}
        <div className="mx-4 mt-4 2xl:mx-0 2xl:mt-0">
          <button
            onClick={() => history.push('/score')}
            className="flex w-full items-center justify-between rounded-2xl bg-(--secondary3-400) px-5 py-4 text-left transition-colors hover:bg-(--secondary3-300)"
          >
            <p className="text-base font-semibold text-white">Actualizar puntaje Planea</p>
            <ChevronRightIcon className="size-5 shrink-0 text-white/70" />
          </button>
        </div>

        {/* Right col at 2xl: settings + signout */}
        <div className="2xl:mt-6">
        {/* —— SETTINGS LIST —— */}
        <div className="mx-4 mt-5 overflow-hidden rounded-2xl bg-white shadow-sm 2xl:mx-0 2xl:mt-0">
          {settingRows.map(({ icon, label, onPress }, i) => (
            <button
              key={label}
              onClick={onPress}
              className={[
                'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-(--gray-50)',
                i < settingRows.length - 1 ? 'border-b border-(--gray-100)' : '',
              ].join(' ')}
            >
              <span className="text-(--gray-400)">{icon}</span>
              <span className="flex-1 text-base text-(--dark)">{label}</span>
              <ChevronRightIcon className="size-4 text-(--gray-300)" />
            </button>
          ))}
        </div>

        {/* ── SIGN OUT ── */}
        <div className="mx-4 mt-3 overflow-hidden rounded-2xl bg-white shadow-sm 2xl:mx-0">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-red-50"
          >
            <ArrowRightStartOnRectangleIcon className="size-5 text-red-400" />
            <span className="flex-1 text-base text-red-500">Cerrar sesión</span>
          </button>
        </div>

        {/* ── DELETE ACCOUNT ── */}
        <div className="mx-4 mt-3 mb-8 overflow-hidden rounded-2xl bg-white shadow-sm 2xl:mx-0">
          <button
            onClick={handleOpenDeleteDialog}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-red-50"
          >
            <TrashIcon className="size-5 text-red-400" />
            <span className="flex-1 text-base text-red-500">Eliminar cuenta</span>
          </button>
        </div>

        {/* ── APP VERSION ── */}
        <p className="mx-4 mb-10 text-center text-xs text-(--gray-300) 2xl:mx-0">
          Versión {APP_VERSION}
        </p>

        </div>{/* end right col */}

        </div>{/* end 2xl grid */}

      </div>

      {/* ── TOAST ── */}
      {showNameSavedToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 2xl:bottom-6">
          <Toast
            message="Datos guardados"
            description="Tu nombre se actualizó correctamente."
            onDismiss={() => setShowNameSavedToast(false)}
          />
        </div>
      )}
      {showToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 2xl:bottom-6">
          <Toast
            message="Verifica tu correo"
            description="Te enviamos un enlace para confirmar tu nuevo correo electrónico."
            onDismiss={() => setShowToast(false)}
          />
        </div>
      )}

      {/* ── EDIT PROFILE MODAL ── */}
      <Dialog open={editing} onClose={handleCancel} className="relative z-50">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

        <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
          <DialogPanel className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-2xl">
            <DialogTitle className="mb-5 text-lg font-semibold text-(--dark)">
              Editar datos personales
            </DialogTitle>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-(--gray-500)">
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full rounded-xl border border-(--gray-200) bg-(--off-white) px-4 py-3 text-base text-(--dark) outline-none focus:border-(--primary-300) focus:ring-2 focus:ring-(--primary-300)/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-(--gray-500)">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="Correo electrónico"
                  className="w-full rounded-xl border border-(--gray-200) bg-(--off-white) px-4 py-3 text-base text-(--dark) outline-none focus:border-(--primary-300) focus:ring-2 focus:ring-(--primary-300)/20"
                />
              </div>

              {feedback !== null && (
                <p className={`text-sm ${feedback.ok ? 'text-green-600' : 'text-red-500'}`}>
                  {feedback.message}
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex-1 rounded-xl border border-(--gray-200) py-3 text-base font-medium text-(--gray-500) transition-colors hover:bg-(--gray-50) disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-(--primary-300) py-3 text-base font-semibold text-white transition-colors hover:bg-(--primary-400) disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
      {/* ── SUPPORT DIALOG ── */}
      <Dialog open={showSupport} onClose={() => setShowSupport(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
          <DialogPanel className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-2xl">
            <div className="mb-1 flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold text-(--dark)">
                Ayuda y soporte
              </DialogTitle>
              <button
                onClick={() => setShowSupport(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-(--gray-400) transition-colors hover:bg-(--gray-100) hover:text-(--dark)"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
            <p className="mb-5 text-sm text-(--gray-400)">Ponte en contacto con nuestro equipo</p>

            <div className="space-y-3">
              {([
                { label: 'Correo electrónico', value: 'hola@planea.co' },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={value} className="grid grid-cols-2 items-center gap-3">
                  {/* Left: contact value + copy */}
                  <div className="flex min-w-0 items-center gap-1.5 rounded-xl bg-(--off-white) px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-(--dark)">{value}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(value).then(() => {
                          setCopiedContact(value)
                          setTimeout(() => setCopiedContact(null), 2000)
                        })
                      }}
                      aria-label={`Copiar ${label}`}
                      className="shrink-0 rounded-lg p-1 text-(--gray-400) transition-colors hover:bg-(--gray-100) hover:text-(--dark)"
                    >
                      {copiedContact === value
                        ? <CheckIcon className="size-4 text-green-500" />
                        : <ClipboardDocumentIcon className="size-4" />}
                    </button>
                  </div>

                  {/* Right: mailto button */}
                  <a
                    href={`mailto:${value}`}
                    className="flex items-center justify-center gap-2 rounded-xl bg-(--primary-300) px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--primary-400)"
                  >
                    <EnvelopeIcon className="size-4 shrink-0" />
                    <span>Enviar email</span>
                  </a>
                </div>
              ))}
            </div>

          </DialogPanel>
        </div>
      </Dialog>

      {/* ── DELETE ACCOUNT DIALOG ── */}
      <Dialog open={deletingAccount} onClose={handleCancelDelete} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

        <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
          <DialogPanel className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <TrashIcon className="size-6 text-red-500" />
            </div>

            <DialogTitle className="mb-2 text-lg font-semibold text-(--dark)">
              Eliminar cuenta
            </DialogTitle>

            <p className="mb-1 text-sm text-(--gray-500)">
              Esta acción es <span className="font-semibold text-(--dark)">permanente e irreversible</span>. Se borrarán todos tus datos: historial de puntaje, metas y progreso.
            </p>

            <p className="mb-4 text-sm text-(--gray-500)">
              Escribe <span className="font-semibold text-(--dark)">ELIMINAR</span> para confirmar.
            </p>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="ELIMINAR"
              className="w-full rounded-xl border border-(--gray-200) bg-(--off-white) px-4 py-3 text-base text-(--dark) outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
            />

            {deleteError !== null && (
              <p className="mt-2 text-sm text-red-500">{deleteError}</p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCancelDelete}
                disabled={deleteLoading}
                className="flex-1 rounded-xl border border-(--gray-200) py-3 text-base font-medium text-(--gray-500) transition-colors hover:bg-(--gray-50) disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteConfirmText !== 'ELIMINAR' || deleteLoading}
                className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
              >
                {deleteLoading ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  )
}

