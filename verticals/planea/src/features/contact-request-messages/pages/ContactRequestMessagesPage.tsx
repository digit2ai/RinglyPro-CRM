import { useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import { listContactRequestMessages } from '../api/contactRequestMessages.service'
import type {
  ContactRequestMessage,
  ContactRequestMessageListMeta,
  ContactRequestMessageStatus,
} from '../api/contactRequestMessages.types'

const PAGE_SIZE = 10

const STATUS_LABELS: Record<ContactRequestMessageStatus, string> = {
  pending: 'Pendiente',
  read: 'Leído',
  archived: 'Archivado',
}

const STATUS_COLORS: Record<ContactRequestMessageStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  read: 'bg-green-50 text-green-700 ring-green-600/20',
  archived: 'bg-gray-50 text-gray-600 ring-gray-500/10',
}

function StatusBadge({ status }: { status: ContactRequestMessageStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
        STATUS_COLORS[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function ContactRequestMessagesPage() {
  const history = useHistory()

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContactRequestMessageStatus | ''>('')
  const [page, setPage] = useState(1)

  const [messages, setMessages] = useState<ContactRequestMessage[]>([])
  const [meta, setMeta] = useState<ContactRequestMessageListMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setLoading(true)
    setError(null)

    const params = {
      page,
      limit: PAGE_SIZE,
      ...(statusFilter !== '' ? { status: statusFilter } : {}),
      ...(debouncedSearch.length > 0 ? { q: debouncedSearch } : {}),
    }

    listContactRequestMessages(params).then((result) => {
      if (result.ok === false) {
        setError(result.message)
      } else {
        setMessages(result.data.data)
        setMeta(result.data.meta)
      }
      setLoading(false)
    })
  }, [page, statusFilter, debouncedSearch])

  function handleStatusFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(e.target.value as ContactRequestMessageStatus | '')
    setPage(1)
  }

  function handleItemClick(item: ContactRequestMessage) {
    history.push(`/admin/contact-request-messages/${item.id}`, { message: item })
  }

  function handlePrev() {
    setPage((p) => Math.max(1, p - 1))
  }

  function handleNext() {
    if (meta === null) return
    setPage((p) => Math.min(meta.pages, p + 1))
  }

  const from = meta !== null ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = meta !== null ? Math.min(page * PAGE_SIZE, meta.total) : 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl/7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Mensajes de contacto
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar por nombre, correo o mensaje…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="block w-full rounded-md bg-white py-1.5 pr-3 pl-9 text-sm/6 text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-(--primary-500)"
          />
        </div>
        <select
          value={statusFilter}
          onChange={handleStatusFilterChange}
          className="rounded-md bg-white py-1.5 pr-8 pl-3 text-sm/6 text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-(--primary-500)"
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="read">Leído</option>
          <option value="archived">Archivado</option>
        </select>
      </div>

      {error !== null && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3">
          <p className="text-sm/6 text-red-700">{error}</p>
        </div>
      )}

      {/* List */}
      <div className="mt-6 overflow-hidden rounded-lg shadow-xs ring-1 ring-black/5">
        {loading ? (
          <p className="bg-white py-12 text-center text-sm/6 text-gray-500">Cargando…</p>
        ) : messages.length === 0 ? (
          <p className="bg-white py-12 text-center text-sm/6 text-gray-500">Sin resultados</p>
        ) : (
          <ul role="list" className="divide-y divide-gray-100 bg-white">
            {messages.map((item) => (
              <li
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="relative flex cursor-pointer justify-between gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6"
              >
                <div className="min-w-0 flex-auto">
                  <p className="text-sm/6 font-semibold text-gray-900">{item.name}</p>
                  <p className="mt-1 truncate text-xs/5 text-gray-500">{item.email}</p>
                </div>
                <div className="hidden shrink-0 flex-col items-end sm:flex">
                  <StatusBadge status={item.status} />
                  <p className="mt-1 text-xs/5 text-gray-500">
                    <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
                  </p>
                </div>
                <div className="flex items-center sm:hidden">
                  <StatusBadge status={item.status} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {meta !== null && meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={handlePrev}
                disabled={page === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={handleNext}
                disabled={page === meta.pages}
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700">
                Mostrando <span className="font-medium">{from}</span> a{' '}
                <span className="font-medium">{to}</span> de{' '}
                <span className="font-medium">{meta.total}</span> resultados
              </p>
              <nav aria-label="Paginación" className="isolate inline-flex -space-x-px rounded-md shadow-xs">
                <button
                  onClick={handlePrev}
                  disabled={page === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 inset-ring inset-ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-40"
                >
                  <span className="sr-only">Anterior</span>
                  <ChevronLeftIcon aria-hidden="true" className="size-5" />
                </button>
                <button
                  onClick={handleNext}
                  disabled={page === meta.pages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 inset-ring inset-ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-40"
                >
                  <span className="sr-only">Siguiente</span>
                  <ChevronRightIcon aria-hidden="true" className="size-5" />
                </button>
              </nav>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
