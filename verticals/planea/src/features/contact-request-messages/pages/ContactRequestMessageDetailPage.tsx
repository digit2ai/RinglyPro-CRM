import { useState } from 'react'
import { useLocation, useHistory } from 'react-router-dom'
import { ChevronLeftIcon, ClipboardDocumentIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { updateContactRequestMessageStatus } from '../api/contactRequestMessages.service'
import type {
  ContactRequestMessage,
  ContactRequestMessageStatus
} from '../api/contactRequestMessages.types'

const STATUS_OPTIONS: { value: ContactRequestMessageStatus; label: string; description: string }[] =
  [
    { value: 'pending', label: 'Pendiente', description: 'Aún sin revisar' },
    { value: 'read', label: 'Leído', description: 'Revisado por el equipo' },
    { value: 'archived', label: 'Archivado', description: 'Ya no requiere acción' },
  ]

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'No se pudo actualizar el estado.'
}

export function ContactRequestMessageDetailPage() {
  const history = useHistory()
  const location = useLocation()

  const initialMessage = (
    location.state as { message?: ContactRequestMessage } | null
  )?.message

  const [message, setMessage] = useState<ContactRequestMessage | null>(
    initialMessage ?? null
  )
  const [selectedStatus, setSelectedStatus] =
    useState<ContactRequestMessageStatus | null>(initialMessage?.status ?? null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

  async function handleCopyEmail() {
    await navigator.clipboard.writeText(message?.email ?? '')
    setEmailCopied(true)
  }

  if (message === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
        <p className="text-sm/6 text-gray-500">No se encontró el mensaje.</p>
        <button
          type="button"
          onClick={() => history.push('/admin/contact-request-messages')}
          className="text-sm/6 font-medium text-(--primary-500) hover:text-(--primary-400)"
        >
          Volver al listado
        </button>
      </div>
    )
  }

  const statusChanged =
    selectedStatus !== null && selectedStatus !== message.status

  function handleStatusChange(status: ContactRequestMessageStatus) {
    setSelectedStatus(status)
    setSaveError(null)
    setSaveSuccess(false)
  }

  async function handleSave() {
    if (message === null || selectedStatus === null || statusChanged === false || saving) return

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const result = await updateContactRequestMessageStatus(
        message.id,
        selectedStatus
      )

      if (result.ok === false) {
        setSaveError(result.message)
        return
      }

      setMessage((currentMessage) => {
        if (currentMessage === null) return currentMessage
        return { ...currentMessage, status: selectedStatus }
      })

      setSaveSuccess(true)
    } catch (error) {
      setSaveError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">

      {/* Back nav */}
      <div className="mb-6">
        <nav aria-label="Volver" className="sm:hidden">
          <button
            type="button"
            onClick={() => history.goBack()}
            className="flex items-center text-sm/6 font-medium text-gray-500 hover:text-gray-700"
          >
            <ChevronLeftIcon aria-hidden="true" className="-ml-1 mr-1 size-5 shrink-0 text-gray-400" />
            Volver
          </button>
        </nav>
        <nav aria-label="Breadcrumb" className="hidden sm:flex">
          <ol role="list" className="flex items-center space-x-2">
            <li>
              <button
                type="button"
                onClick={() => history.push('/admin/contact-request-messages')}
                className="text-sm/6 font-medium text-gray-500 hover:text-gray-700"
              >
                Mensajes de contacto
              </button>
            </li>
            <li>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5 shrink-0 text-gray-400">
                <path d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" fillRule="evenodd" />
              </svg>
            </li>
            <li>
              <span aria-current="page" className="text-sm/6 font-medium text-gray-500">
                {message.name}
              </span>
            </li>
          </ol>
        </nav>
      </div>

      {/* Page heading */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl/7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Detalle del mensaje
          </h1>
          <p className="mt-1 text-sm/6 text-gray-500">{message.email}</p>
        </div>
      </div>

      {/* Description list */}
      <div className="mt-8">
        <div className="border-t border-gray-200">
          <dl className="divide-y divide-gray-100">
            <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm/6 font-medium text-gray-900">Nombre</dt>
              <dd className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0">
                {message.name}
              </dd>
            </div>
            <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm/6 font-medium text-gray-900">Correo electrónico</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0">
                {message.email}
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  aria-label="Copiar correo electrónico"
                  className="ml-auto shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-(--primary-500)"
                >
                  <ClipboardDocumentIcon className="size-5" aria-hidden="true" />
                </button>
              </dd>
            </div>
            <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm/6 font-medium text-gray-900">Fecha</dt>
              <dd className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0">
                {formatDate(message.created_at)}
              </dd>
            </div>
            <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm/6 font-medium text-gray-900">Mensaje</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0">
                {message.message}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Status section */}
      <div className="mt-8 border-t border-gray-200 pt-8">
        <fieldset>
          <legend className="text-base/7 font-semibold text-gray-900">Estado</legend>
          <p className="mt-1 text-sm/6 text-gray-500">
            Actualiza el estado de este mensaje de contacto.
          </p>
          <div className="mt-6 space-y-4">
            {STATUS_OPTIONS.map((option) => (
              <div key={option.value} className="relative flex items-start">
                <div className="flex h-6 items-center">
                  <input
                    id={`status-${option.value}`}
                    type="radio"
                    name="status"
                    value={option.value}
                    checked={selectedStatus === option.value}
                    onChange={() => handleStatusChange(option.value)}
                    aria-describedby={`status-${option.value}-description`}
                    className="relative size-4 appearance-none rounded-full border border-gray-300 bg-white before:absolute before:inset-1 before:rounded-full before:bg-white not-checked:before:hidden checked:border-(--primary-500) checked:bg-(--primary-500) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary-500) forced-colors:appearance-auto forced-colors:before:hidden"
                  />
                </div>
                <div className="ml-3 text-sm/6">
                  <label htmlFor={`status-${option.value}`} className="font-medium text-gray-900 cursor-pointer">
                    {option.label}
                  </label>
                  <p id={`status-${option.value}-description`} className="text-gray-500">
                    {option.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {saveError !== null && (
          <div className="mt-6 rounded-md bg-red-50 px-4 py-3">
            <p className="text-sm/6 text-red-700">{saveError}</p>
          </div>
        )}

        {saveSuccess && (
          <div className="mt-6 rounded-md bg-green-50 px-4 py-3">
            <p className="text-sm/6 text-green-700">Estado actualizado correctamente.</p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-x-3">
          <button
            type="button"
            onClick={() => history.goBack()}
            className="text-sm/6 font-semibold text-gray-900"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || statusChanged === false}
            className="inline-flex items-center rounded-md bg-(--primary-500) px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-(--primary-400) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary-500) disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Copy email toast */}
      <div aria-live="assertive" className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6">
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {emailCopied && (
            <div className="pointer-events-auto w-full max-w-sm translate-y-0 transform rounded-lg bg-white opacity-100 shadow-lg outline-1 outline-black/5 transition duration-300 ease-out sm:translate-x-0 starting:translate-y-2 starting:opacity-0 starting:sm:translate-x-2 starting:sm:translate-y-0">
              <div className="p-4">
                <div className="flex items-start">
                  <div className="shrink-0">
                    <CheckCircleIcon aria-hidden="true" className="size-6 text-green-400" />
                  </div>
                  <div className="ml-3 w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-gray-900">Correo copiado</p>
                    <p className="mt-1 text-sm text-gray-500">{message.email}</p>
                  </div>
                  <div className="ml-4 flex shrink-0">
                    <button
                      type="button"
                      onClick={() => setEmailCopied(false)}
                      className="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-(--primary-500)"
                    >
                      <span className="sr-only">Cerrar</span>
                      <XMarkIcon aria-hidden="true" className="size-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
