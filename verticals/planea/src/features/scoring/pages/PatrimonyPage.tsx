import { type ReactNode, useEffect, useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '../../auth/hooks/AuthProvider'
import {
  loadPersonId,
  loadPatrimonyStatus,
  savePatrimonyStatus,
  loadAllPatrimony,
  insertAsset,
  updateAsset,
  deleteAsset,
  insertLiability,
  updateLiability,
  deleteLiability,
  type PatrimonyItem,
} from '../api/patrimony.service'

// ── TYPES ─────────────────────────────────────────────────────────────────────

type HousingStatus = 'owned' | 'mortgage' | 'rented' | null

type ModalState =
  | { type: 'none' }
  | { type: 'housing' }
  | { type: 'item'; mode: 'asset' | 'liability'; editing: PatrimonyItem | null }

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const ASSET_DEFS = [
  { type: 'savings_account', icon: '🏦', label: 'Cuenta de ahorros', desc: 'El saldo total en tus cuentas bancarias hoy' },
  { type: 'term_deposit',    icon: '📈', label: 'CDT',                desc: 'Valor del CDT con intereses acumulados' },
  { type: 'severance_fund',  icon: '💼', label: 'Cesantías',          desc: 'Saldo en tu fondo de cesantías' },
  { type: 'pension_fund',    icon: '🏖️', label: 'Fondo de pensiones', desc: 'Saldo acumulado en cuenta individual' },
  { type: 'vehicle',         icon: '🚗', label: 'Vehículo',            desc: 'Valor comercial actual de tu carro o moto' },
  { type: 'business',        icon: '💡', label: 'Negocio propio',      desc: 'Valor estimado si lo vendieras hoy' },
  { type: 'investments',     icon: '📊', label: 'Inversiones',         desc: 'Acciones, fondos, criptomonedas — valor actual' },
  { type: 'other',           icon: '✨', label: 'Otro activo',         desc: 'Cualquier otro bien de valor' },
]

const LIABILITY_DEFS = [
  { type: 'credit_card',   icon: '💳', label: 'Tarjeta de crédito',     desc: 'Lo que debes hoy — no el cupo total' },
  { type: 'consumer_loan', icon: '🏛️', label: 'Crédito libre inversión', desc: 'Saldo pendiente del crédito de consumo' },
  { type: 'vehicle_loan',  icon: '🚗', label: 'Crédito de vehículo',     desc: 'Saldo pendiente del crédito de tu carro' },
  { type: 'mortgage',      icon: '🏠', label: 'Hipoteca',                desc: 'Saldo pendiente del crédito de vivienda' },
  { type: 'informal_debt', icon: '🤝', label: 'Deuda informal',          desc: 'Lo que le debes a familiares o amigos' },
  { type: 'other',         icon: '📋', label: 'Otro pasivo',             desc: 'Cualquier otra deuda u obligación' },
]

const DEFINITION_ROWS = [
  {
    concept: 'Activo',
    text: 'Todo lo que tienes y vale plata — cuenta de ahorros, carro, apartamento.',
  },
  {
    concept: 'Pasivo',
    text: 'Todo lo que debes — tarjeta de crédito, créditos bancarios, deudas informales.',
  },
  {
    concept: 'Patrimonio neto',
    text: 'Activos menos pasivos. Si tienes $50M en activos y debes $20M, tu patrimonio neto es $30M.',
  },
]

// ── HELPERS ───────────────────────────────────────────────────────────────────

function formatCOP(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    return `${sign}$${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  return `${sign}$${Math.round(abs).toLocaleString('es-CO')}`
}

function parseInput(s: string): number {
  return parseInt(s.replace(/[^\d]/g, ''), 10) || 0
}

function getAssetIcon(type: string): string {
  if (type === 'housing') return '🏠'
  return ASSET_DEFS.find(d => d.type === type)?.icon ?? '✨'
}

function getLiabilityIcon(type: string): string {
  return LIABILITY_DEFS.find(d => d.type === type)?.icon ?? '📋'
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

function ModalSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-(--dark)">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-(--gray-100) text-(--gray-400)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ItemRow({
  item,
  iconFn,
  onEdit,
  onDelete,
  isDebt = false,
}: {
  item: PatrimonyItem
  iconFn: (type: string) => string
  onEdit: () => void
  onDelete: () => void
  isDebt?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-(--gray-100) bg-(--gray-50) p-3.5">
      <span className="text-2xl leading-none">{iconFn(item.type)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-(--dark)">{item.name}</div>
        <div className={clsx('text-base font-bold', isDebt ? 'text-red-700' : 'text-(--secondary2-100)')}>
          {formatCOP(item.value)}
        </div>
      </div>
      <button
        onClick={onEdit}
        className="flex h-8 w-8 items-center justify-center rounded-full text-(--gray-300) hover:bg-(--gray-100)"
        aria-label="Editar"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" />
        </svg>
      </button>
      <button
        onClick={onDelete}
        className="flex h-8 w-8 items-center justify-center rounded-full text-red-300 hover:bg-red-50 hover:text-red-500"
        aria-label="Eliminar"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}

function ItemForm({
  mode,
  type,
  name,
  value,
  saving,
  onTypeChange,
  onNameChange,
  onValueChange,
  onSave,
  onCancel,
}: {
  mode: 'asset' | 'liability'
  type: string
  name: string
  value: string
  saving: boolean
  onTypeChange: (t: string) => void
  onNameChange: (n: string) => void
  onValueChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const defs = mode === 'asset' ? ASSET_DEFS : LIABILITY_DEFS
  const parsed = parseInput(value)
  const activeDef = defs.find(d => d.type === type)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-(--dark)">Tipo</label>
        <div className="flex flex-wrap gap-2">
          {defs.map(def => (
            <button
              key={def.type}
              onClick={() => onTypeChange(def.type)}
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                type === def.type
                  ? 'bg-(--primary-300) text-white'
                  : 'border border-(--gray-100) bg-(--gray-50) text-(--gray-400)',
              )}
            >
              {def.icon} {def.label}
            </button>
          ))}
        </div>
        {activeDef !== undefined && (
          <p className="mt-1.5 text-xs text-(--gray-300)">{activeDef.desc}</p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-(--dark)">Nombre</label>
        <input
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          className="w-full rounded-xl border border-(--gray-100) bg-(--gray-50) px-4 py-3 text-sm text-(--dark) focus:border-(--primary-100) focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-(--dark)">
          {mode === 'asset' ? 'Valor actual (pesos)' : 'Saldo que debes (pesos)'}
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          placeholder="Ej: 5000000"
          className="w-full rounded-xl border border-(--gray-100) bg-(--gray-50) px-4 py-3 text-sm text-(--dark) focus:border-(--primary-100) focus:outline-none"
        />
        {parsed > 0 && (
          <div className={clsx('mt-1 text-xs font-semibold', mode === 'asset' ? 'text-(--secondary2-100)' : 'text-red-600')}>
            {formatCOP(parsed)}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-(--gray-100) py-2.5 text-sm font-medium text-(--gray-400)"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={saving || parsed <= 0 || name.trim() === ''}
          className="flex-1 rounded-xl bg-(--primary-300) py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── PAGE ──────────────────────────────────────────────────────────────────────

export function PatrimonyPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [personId, setPersonId] = useState<number | null>(null)
  const [housingStatus, setHousingStatus] = useState<HousingStatus>(null)
  const [assets, setAssets] = useState<PatrimonyItem[]>([])
  const [liabilities, setLiabilities] = useState<PatrimonyItem[]>([])
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  const [housingStep, setHousingStep] = useState<'pick' | 'form'>('pick')
  const [housingPickValue, setHousingPickValue] = useState<HousingStatus>(null)
  const [housingPropValue, setHousingPropValue] = useState('')
  const [housingMortgage, setHousingMortgage] = useState('')

  const [itemType, setItemType] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemValue, setItemValue] = useState('')
  const [saving, setSaving] = useState(false)

  const totalAssets = assets.reduce((s, a) => s + a.value, 0)
  const totalLiabilities = liabilities.reduce((s, p) => s + p.value, 0)
  const netWorth = totalAssets - totalLiabilities
  const isNegative = netWorth < 0
  const hasItems = assets.length > 0 || liabilities.length > 0

  useEffect(() => {
    if (user === null) return

    async function load() {
      if (user === null) return
      setLoading(true)
      const [pid, status] = await Promise.all([
        loadPersonId(user.id),
        loadPatrimonyStatus(user.id),
      ])
      setPersonId(pid)
      setHousingStatus(status.housing_status)
      if (pid !== null) {
        const { assets, liabilities } = await loadAllPatrimony(pid)
        setAssets(assets)
        setLiabilities(liabilities)
      }
      setLoading(false)
    }

    void load()
  }, [user])

  function openHousingModal() {
    setHousingStep('pick')
    setHousingPickValue(null)
    setHousingPropValue('')
    setHousingMortgage('')
    setModal({ type: 'housing' })
  }

  function handleHousingPick(val: 'owned' | 'mortgage' | 'rented') {
    setHousingPickValue(val)
    if (val === 'rented') {
      void handleHousingSave(val)
    } else {
      setHousingStep('form')
    }
  }

  async function handleHousingSave(typeOverride?: 'rented') {
    if (user === null || personId === null || saving) return
    const type = typeOverride ?? housingPickValue
    if (type === null) return

    setSaving(true)
    try {
      const oldHousing = assets.filter(a => a.type === 'housing')
      const oldMortgage = liabilities.filter(p => p.type === 'mortgage' && p.name === 'Hipoteca')
      await Promise.all([
        ...oldHousing.map(a => deleteAsset(personId, a.id)),
        ...oldMortgage.map(p => deleteLiability(personId, p.id)),
      ])
      setAssets(prev => prev.filter(a => a.type !== 'housing'))
      setLiabilities(prev => prev.filter(p => !(p.type === 'mortgage' && p.name === 'Hipoteca')))

      if (type === 'owned') {
        const val = parseInput(housingPropValue)
        if (val > 0) {
          const item = await insertAsset(personId, 'Vivienda propia', 'housing', val)
          if (item !== null) setAssets(prev => [...prev, item])
        }
      } else if (type === 'mortgage') {
        const propVal = parseInput(housingPropValue)
        const mortVal = parseInput(housingMortgage)
        if (propVal > 0) {
          const act = await insertAsset(personId, 'Vivienda propia', 'housing', propVal)
          if (act !== null) setAssets(prev => [...prev, act])
        }
        if (mortVal > 0) {
          const pas = await insertLiability(personId, 'Hipoteca', 'mortgage', mortVal)
          if (pas !== null) setLiabilities(prev => [...prev, pas])
        }
      }

      await savePatrimonyStatus(user.id, type)
      setHousingStatus(type)
      setModal({ type: 'none' })
    } finally {
      setSaving(false)
    }
  }

  function openAddItem(mode: 'asset' | 'liability') {
    const first = (mode === 'asset' ? ASSET_DEFS : LIABILITY_DEFS)[0]
    setItemType(first?.type ?? '')
    setItemName(first?.label ?? '')
    setItemValue('')
    setModal({ type: 'item', mode, editing: null })
  }

  function openEditItem(mode: 'asset' | 'liability', item: PatrimonyItem) {
    setItemType(item.type)
    setItemName(item.name)
    setItemValue(String(item.value))
    setModal({ type: 'item', mode, editing: item })
  }

  function handleTypeChange(type: string, mode: 'asset' | 'liability') {
    const def = (mode === 'asset' ? ASSET_DEFS : LIABILITY_DEFS).find(d => d.type === type)
    setItemType(type)
    if (def !== undefined) setItemName(def.label)
  }

  async function handleItemSave() {
    if (personId === null || saving || modal.type !== 'item') return
    const { mode, editing } = modal
    const value = parseInput(itemValue)
    if (value <= 0 || itemName.trim() === '') return

    setSaving(true)
    try {
      if (editing === null) {
        if (mode === 'asset') {
          const item = await insertAsset(personId, itemName, itemType, value)
          setAssets(prev => [...prev, item])
        } else {
          const item = await insertLiability(personId, itemName, itemType, value)
          setLiabilities(prev => [...prev, item])
        }
      } else {
        if (mode === 'asset') {
          await updateAsset(personId, editing.id, itemName, value)
          setAssets(prev => prev.map(a => a.id === editing.id ? { ...a, name: itemName, value } : a))
        } else {
          await updateLiability(personId, editing.id, itemName, value)
          setLiabilities(prev => prev.map(p => p.id === editing.id ? { ...p, name: itemName, value } : p))
        }
      }
      setModal({ type: 'none' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAsset(id: number) {
    if (personId === null) return
    await deleteAsset(personId, id)
    setAssets(prev => prev.filter(a => a.id !== id))
  }

  async function handleDeleteLiability(id: number) {
    if (personId === null) return
    await deleteLiability(personId, id)
    setLiabilities(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="relative flex h-full flex-col bg-(--off-white)">
      <div className="flex-1 overflow-y-auto">

        {/* HEADER */}
        <div className="bg-(--primary-300) px-5 pb-5 pt-4 2xl:px-10 2xl:py-8">
          <div className="mx-auto 2xl:max-w-6xl">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-[#B7E4C7]">
            Tu patrimonio neto
          </span>
          <div
            className={clsx(
              'mt-2 text-[44px] font-extrabold leading-none tracking-[-0.03em]',
              isNegative ? 'text-red-400' : hasItems ? 'text-white' : 'text-white/25',
            )}
          >
            {hasItems ? formatCOP(netWorth) : '—'}
          </div>
          {hasItems && (
            <div className="mt-3 flex gap-3">
              <div className="flex-1 rounded-[10px] bg-white/[0.07] p-[8px_10px]">
                <div className="mb-0.5 text-xs font-medium text-white/55">Activos</div>
                <div className="text-base font-bold text-white">{formatCOP(totalAssets)}</div>
              </div>
              <div className="flex-1 rounded-[10px] bg-white/[0.07] p-[8px_10px]">
                <div className="mb-0.5 text-xs font-medium text-white/55">Pasivos</div>
                <div className={clsx('text-base font-bold', totalLiabilities > 0 ? 'text-red-400' : 'text-white/40')}>
                  {totalLiabilities > 0 ? formatCOP(totalLiabilities) : '$0'}
                </div>
              </div>
            </div>
          )}
          {isNegative && (
            <div className="mt-3 rounded-xl bg-red-900/30 px-3 py-2.5 text-xs leading-relaxed text-red-300">
              🦜 Tu patrimonio neto es negativo. Debes más de lo que tienes. La prioridad es reducir tus pasivos.
            </div>
          )}
          {!hasItems && !loading && (
            <p className="mt-2 text-sm text-white/40">
              Agrega tus activos y pasivos para ver tu posición real.
            </p>
          )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center p-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-(--primary-300) border-t-transparent" />
          </div>
        )}

        {!loading && (
          <div className="2xl:mx-auto 2xl:max-w-6xl 2xl:grid 2xl:grid-cols-2 2xl:gap-6 2xl:px-8 2xl:py-8">
            {/* DEFINICIONES — full width at 2xl */}
            <div className="border-b border-(--gray-100) px-4 py-4 2xl:rounded-2xl 2xl:border-none 2xl:bg-white 2xl:px-6 2xl:py-5 2xl:shadow-sm">
              <div className="mb-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-(--gray-300)">
                Definiciones
              </div>
              <div className="divide-y divide-(--gray-100) overflow-hidden rounded-2xl border border-(--gray-100)">
                {DEFINITION_ROWS.map(row => (
                  <div key={row.concept} className="bg-(--gray-50) px-4 py-3">
                    <div className="mb-0.5 text-sm font-semibold text-(--dark)">{row.concept}</div>
                    <div className="text-xs leading-relaxed text-(--gray-300)">{row.text}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* VIVIENDA — left col */}
            <div className="border-b border-(--gray-100) px-4 py-4 2xl:rounded-2xl 2xl:border-none 2xl:bg-white 2xl:px-6 2xl:py-5 2xl:shadow-sm">
              <div className="mb-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-(--gray-300)">
                Vivienda
              </div>
              {housingStatus === null && (
                <div className="rounded-2xl border-2 border-dashed border-(--primary-100)/40 p-4">
                  <p className="mb-1 font-semibold text-(--dark)">🏠 ¿Tu vivienda actual es...?</p>
                  <p className="mb-4 text-xs leading-relaxed text-(--gray-300)">
                    Para la mayoría de colombianos la vivienda es el activo más grande. Empieza aquí.
                  </p>
                  <button
                    onClick={openHousingModal}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-(--primary-300) py-2.5 text-sm font-bold text-white"
                  >
                    Responder →
                  </button>
                </div>
              )}
              {housingStatus === 'rented' && (
                <div className="rounded-2xl border border-(--gray-100) bg-(--gray-50) p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-(--dark)">🚶 En arriendo</span>
                    <button onClick={openHousingModal} className="text-xs font-medium text-(--primary-100)">
                      Cambiar
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-(--gray-300)">
                    El arriendo es un gasto mensual — no afecta tu patrimonio neto. Para construir patrimonio considera las opciones de ahorro en metas.
                  </p>
                </div>
              )}
              {(housingStatus === 'owned' || housingStatus === 'mortgage') && (
                <div className="flex items-center justify-between rounded-2xl border border-(--gray-100) bg-(--gray-50) px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-(--dark)">🏠 Vivienda propia</span>
                    <span className="rounded-full bg-(--primary-100)/20 px-2 py-0.5 text-xs font-medium text-(--secondary2-100)">
                      {housingStatus === 'owned' ? 'Pagada' : 'Con hipoteca'}
                    </span>
                  </div>
                  <button onClick={openHousingModal} className="text-xs font-medium text-(--primary-100)">
                    Cambiar
                  </button>
                </div>
              )}
            </div>

            {/* ACTIVOS — right col row 2 */}
            <div className="border-b border-(--gray-100) px-4 py-4 2xl:col-start-2 2xl:row-start-2 2xl:rounded-2xl 2xl:border-none 2xl:bg-white 2xl:px-6 2xl:py-5 2xl:shadow-sm">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-(--gray-300)">Activos</div>
                {totalAssets > 0 && (
                  <span className="text-sm font-bold text-(--secondary2-100)">{formatCOP(totalAssets)}</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                  {assets.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      iconFn={getAssetIcon}
                      onEdit={() => openEditItem('asset', item)}
                      onDelete={() => void handleDeleteAsset(item.id)}
                    />
                  ))}
                </div>
                <button
                  onClick={() => openAddItem('asset')}
                  className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-(--gray-100) py-3 text-sm font-medium text-(--gray-300) transition-colors hover:border-(--primary-100)/40 hover:text-(--primary-100)"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar activo
                </button>
              </div>
            </div>

            {/* PASIVOS — left col row 2 */}
            <div className="px-4 py-4 2xl:col-start-1 2xl:row-start-2 2xl:rounded-2xl 2xl:bg-white 2xl:px-6 2xl:py-5 2xl:shadow-sm">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-(--gray-300)">Pasivos</div>
                {totalLiabilities > 0 && (
                  <span className="text-sm font-bold text-red-700">{formatCOP(totalLiabilities)}</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                  {liabilities.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      iconFn={getLiabilityIcon}
                      onEdit={() => openEditItem('liability', item)}
                      onDelete={() => void handleDeleteLiability(item.id)}
                      isDebt
                    />
                  ))}
                </div>
                <button
                  onClick={() => openAddItem('liability')}
                  className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-(--gray-100) py-3 text-sm font-medium text-(--gray-300) transition-colors hover:border-red-100 hover:text-red-400"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar pasivo
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="h-6 2xl:hidden" />
      </div>

      {/* HOUSING MODAL */}
      {modal.type === 'housing' && (
        <ModalSheet title="Tu vivienda" onClose={() => setModal({ type: 'none' })}>
          {housingStep === 'pick' && (
            <div className="flex flex-col gap-3">
              {([
                { val: 'owned'    as const, icon: '🏠', label: 'Propia y ya la pagué completamente', desc: 'Tienes la escritura y no debes nada por ella' },
                { val: 'mortgage' as const, icon: '🏠', label: 'Propia con hipoteca',                desc: 'Tienes la propiedad pero aún estás pagando el crédito' },
                { val: 'rented'   as const, icon: '🚶', label: 'En arriendo',                        desc: 'Pagas canon mensual al arrendador' },
              ] as const).map(opt => (
                <button
                  key={opt.val}
                  onClick={() => handleHousingPick(opt.val)}
                  disabled={saving}
                  className="flex items-start gap-3 rounded-2xl border border-(--gray-100) bg-(--gray-50) p-4 text-left transition-colors hover:border-(--primary-100)/40 disabled:opacity-50"
                >
                  <span className="text-2xl leading-none">{opt.icon}</span>
                  <div>
                    <div className="font-semibold text-(--dark)">{opt.label}</div>
                    <div className="mt-0.5 text-xs text-(--gray-300)">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {housingStep === 'form' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-(--dark)">
                  Valor estimado de la propiedad (pesos)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={housingPropValue}
                  onChange={e => setHousingPropValue(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Ej: 150000000"
                  className="w-full rounded-xl border border-(--gray-100) bg-(--gray-50) px-4 py-3 text-sm text-(--dark) focus:border-(--primary-100) focus:outline-none"
                />
                {parseInput(housingPropValue) > 0 && (
                  <div className="mt-1 text-xs font-semibold text-(--secondary2-100)">
                    {formatCOP(parseInput(housingPropValue))}
                  </div>
                )}
              </div>
              {housingPickValue === 'mortgage' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-(--dark)">
                    Saldo pendiente de la hipoteca (pesos)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={housingMortgage}
                    onChange={e => setHousingMortgage(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="Ej: 80000000"
                    className="w-full rounded-xl border border-(--gray-100) bg-(--gray-50) px-4 py-3 text-sm text-(--dark) focus:border-(--primary-100) focus:outline-none"
                  />
                  {parseInput(housingMortgage) > 0 && (
                    <div className="mt-1 text-xs font-semibold text-red-600">
                      {formatCOP(parseInput(housingMortgage))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setHousingStep('pick')}
                  className="flex-1 rounded-xl border border-(--gray-100) py-2.5 text-sm font-medium text-(--gray-400)"
                >
                  Atrás
                </button>
                <button
                  onClick={() => void handleHousingSave()}
                  disabled={saving || parseInput(housingPropValue) <= 0}
                  className="flex-1 rounded-xl bg-(--primary-300) py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </ModalSheet>
      )}

      {/* ITEM MODAL */}
      {modal.type === 'item' && (
        <ModalSheet
          title={
            (modal.editing !== null ? 'Editar ' : 'Agregar ') +
            (modal.mode === 'asset' ? 'activo' : 'pasivo')
          }
          onClose={() => setModal({ type: 'none' })}
        >
          <ItemForm
            mode={modal.mode}
            type={itemType}
            name={itemName}
            value={itemValue}
            saving={saving}
            onTypeChange={t => handleTypeChange(t, modal.mode)}
            onNameChange={setItemName}
            onValueChange={v => setItemValue(v.replace(/[^\d]/g, ''))}
            onSave={() => void handleItemSave()}
            onCancel={() => setModal({ type: 'none' })}
          />
        </ModalSheet>
      )}
    </div>
  )
}
