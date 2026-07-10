import { useState } from 'react'
import clsx from 'clsx'
import type { LongTermGoal, LongTermGoalFormData, LongTermGoalType } from '../api/longTermGoals.types'
import { addLongTermGoal, deleteLongTermGoal, updateLongTermGoal, monthsToGoal } from '../api/longTermGoals.service'

const GOAL_TYPES: { type: LongTermGoalType; icon: string; label: string }[] = [
  { type: 'trip',      icon: '✈️', label: 'Viaje' },
  { type: 'house',     icon: '🏠', label: 'Casa' },
  { type: 'car',       icon: '🚗', label: 'Carro' },
  { type: 'education', icon: '🎓', label: 'Educación' },
  { type: 'other',     icon: '⭐', label: 'Otro' },
]

const TYPE_MAP: Record<LongTermGoalType, { icon: string; label: string }> = Object.fromEntries(
  GOAL_TYPES.map(g => [g.type, { icon: g.icon, label: g.label }]),
) as Record<LongTermGoalType, { icon: string; label: string }>

function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

function timeLabel(months: number | null): string {
  if (months === null) return 'Sin ahorro mensual'
  if (months === 0) return '¡Ya tienes suficiente!'
  if (months < 12) return `${months} mes${months !== 1 ? 'es' : ''}`
  const y = Math.floor(months / 12)
  const m = months % 12
  return m === 0 ? `${y} año${y !== 1 ? 's' : ''}` : `${y} año${y !== 1 ? 's' : ''} y ${m} mes${m !== 1 ? 'es' : ''}`
}

interface Props {
  goals: LongTermGoal[]
  userId: string
  onGoalsChange: (goals: LongTermGoal[]) => void
}

const EMPTY_FORM: LongTermGoalFormData = {
  name: '',
  type: 'trip',
  target_amount: 0,
  current_savings: 0,
  monthly_saving: 0,
}

export function LongTermGoals({ goals, userId, onGoalsChange }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<LongTermGoalFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [editGoalId, setEditGoalId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<LongTermGoalFormData>(EMPTY_FORM)
  const [updating, setUpdating] = useState(false)

  function handleFormChange(field: keyof LongTermGoalFormData, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleEditFormChange(field: keyof LongTermGoalFormData, value: string | number) {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  function handleEditStart(goal: LongTermGoal) {
    setEditGoalId(goal.id)
    setEditForm({
      name: goal.name,
      type: goal.type,
      target_amount: goal.target_amount,
      current_savings: goal.current_savings,
      monthly_saving: goal.monthly_saving,
    })
  }

  async function handleEditSave() {
    if (editGoalId === null || editForm.name.trim() === '' || editForm.target_amount <= 0 || updating) return
    setUpdating(true)
    try {
      const updated = await updateLongTermGoal(editGoalId, { ...editForm, name: editForm.name.trim() })
      if (updated !== null) {
        onGoalsChange(goals.map(g => (g.id === editGoalId ? updated : g)))
        setEditGoalId(null)
      }
    } finally {
      setUpdating(false)
    }
  }

  async function handleAdd() {
    if (form.name.trim() === '' || form.target_amount <= 0 || saving) return
    setSaving(true)
    try {
      const added = await addLongTermGoal(userId, {
        ...form,
        name: form.name.trim(),
      })
      if (added !== null) {
        onGoalsChange([...goals, added])
        setForm(EMPTY_FORM)
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setDeleteId(id)
    await deleteLongTermGoal(id)
    onGoalsChange(goals.filter(g => g.id !== id))
    setDeleteId(null)
  }

  return (
    <div>
      {/* Goal cards */}
      {goals.length > 0 && (
        <div className="mb-3 flex flex-col gap-3">
          {goals.map(goal => {
            const months = monthsToGoal(goal)
            const pct = Math.min(100, Math.round((goal.current_savings / goal.target_amount) * 100))
            const meta = TYPE_MAP[goal.type]
            const isEditing = editGoalId === goal.id
            return (
              <div key={goal.id} className="rounded-2xl border border-(--gray-100) bg-(--gray-50) p-3.5">
                {isEditing ? (
                  <div>
                    <div className="mb-3 text-sm font-bold text-(--dark)">Editar meta</div>

                    {/* Type selector */}
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                      {GOAL_TYPES.map(gt => (
                        <button
                          key={gt.type}
                          onClick={() => handleEditFormChange('type', gt.type)}
                          className={clsx(
                            'flex shrink-0 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
                            editForm.type === gt.type
                              ? 'border-(--primary-300) bg-(--primary-300) text-white'
                              : 'border-(--gray-100) bg-white text-(--gray-400)',
                          )}
                        >
                          <span className="text-base">{gt.icon}</span>
                          {gt.label}
                        </button>
                      ))}
                    </div>

                    {/* Name */}
                    <div className="mb-2.5">
                      <label className="mb-1 block text-xs font-medium text-(--gray-400)">¿Para qué es?</label>
                      <input
                        type="text"
                        placeholder="Ej: Viaje a Cartagena"
                        value={editForm.name}
                        onChange={e => handleEditFormChange('name', e.target.value)}
                        className="w-full rounded-xl border border-(--gray-100) bg-white px-3 py-2 text-sm text-(--dark) outline-none focus:border-(--primary-300)"
                      />
                    </div>

                    {/* Amounts */}
                    <div className="mb-2.5 grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-(--gray-400)">Meta total ($)</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="5000000"
                          value={editForm.target_amount === 0 ? '' : editForm.target_amount}
                          onChange={e => handleEditFormChange('target_amount', Number(e.target.value))}
                          className="w-full rounded-xl border border-(--gray-100) bg-white px-3 py-2 text-sm text-(--dark) outline-none focus:border-(--primary-300)"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-(--gray-400)">Ya ahorrado ($)</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="0"
                          value={editForm.current_savings === 0 ? '' : editForm.current_savings}
                          onChange={e => handleEditFormChange('current_savings', Number(e.target.value))}
                          className="w-full rounded-xl border border-(--gray-100) bg-white px-3 py-2 text-sm text-(--dark) outline-none focus:border-(--primary-300)"
                        />
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-medium text-(--gray-400)">Ahorro mensual estimado ($)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="200000"
                        value={editForm.monthly_saving === 0 ? '' : editForm.monthly_saving}
                        onChange={e => handleEditFormChange('monthly_saving', Number(e.target.value))}
                        className="w-full rounded-xl border border-(--gray-100) bg-white px-3 py-2 text-sm text-(--dark) outline-none focus:border-(--primary-300)"
                      />
                    </div>

                    {/* Preview */}
                    {editForm.target_amount > 0 && editForm.monthly_saving > 0 && (
                      <div className="mb-3 rounded-xl bg-(--secondary2-100)/10 px-3 py-2 text-xs font-medium text-(--secondary2-100)">
                        ⏳ Alcanzarías esta meta en {timeLabel(monthsToGoal({ ...editForm, id: goal.id, person_id: 0, created_at: '' }))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditGoalId(null)}
                        className="flex-1 rounded-xl border border-(--gray-100) py-2.5 text-sm font-semibold text-(--gray-400)"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => void handleEditSave()}
                        disabled={updating || editForm.name.trim() === '' || editForm.target_amount <= 0}
                        className="flex-1 rounded-xl bg-(--secondary2-100) py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {updating ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleEditStart(goal)}
                    className="w-full cursor-pointer text-left"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{meta.icon}</span>
                        <div>
                          <div className="text-base font-bold text-(--dark)">{goal.name}</div>
                          <div className="text-xs text-(--gray-300)">{meta.label}</div>
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); void handleDelete(goal.id) }}
                        disabled={deleteId === goal.id}
                        className="text-sm text-black hover:text-red-500 disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-(--gray-100)">
                      <div
                        className="h-full rounded-full bg-(--primary-300)"
                        style={{ width: `${pct}%`, transition: 'width 0.6s ease' }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-(--gray-400)">
                      <span>{formatCOP(goal.current_savings)} ahorrado</span>
                      <span className="font-semibold">{formatCOP(goal.target_amount)}</span>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-(--primary-300)/8 px-3 py-1.5">
                      <span className="text-sm">⏳</span>
                      <span className="text-xs font-medium text-(--primary-300)">
                        {timeLabel(months)} — {formatCOP(goal.monthly_saving)}/mes
                      </span>
                    </div>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="rounded-2xl border border-(--gray-100) bg-(--gray-50) p-4">
          <div className="mb-3 text-sm font-bold text-(--dark)">Nueva meta</div>

          {/* Type selector */}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {GOAL_TYPES.map(gt => (
              <button
                key={gt.type}
                onClick={() => handleFormChange('type', gt.type)}
                className={clsx(
                  'flex shrink-0 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
                  form.type === gt.type
                    ? 'border-(--primary-300) bg-(--primary-300) text-white'
                    : 'border-(--gray-100) bg-white text-(--gray-400)',
                )}
              >
                <span className="text-base">{gt.icon}</span>
                {gt.label}
              </button>
            ))}
          </div>

          {/* Name */}
          <div className="mb-2.5">
            <label className="mb-1 block text-xs font-medium text-(--gray-400)">¿Para qué es?</label>
            <input
              type="text"
              placeholder="Ej: Viaje a Cartagena"
              value={form.name}
              onChange={e => handleFormChange('name', e.target.value)}
              className="w-full rounded-xl border border-(--gray-100) bg-white px-3 py-2 text-sm text-(--dark) outline-none focus:border-(--primary-300)"
            />
          </div>

          {/* Amounts */}
          <div className="mb-2.5 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--gray-400)">Meta total ($)</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="5000000"
                value={form.target_amount === 0 ? '' : form.target_amount}
                onChange={e => handleFormChange('target_amount', Number(e.target.value))}
                className="w-full rounded-xl border border-(--gray-100) bg-white px-3 py-2 text-sm text-(--dark) outline-none focus:border-(--primary-300)"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--gray-400)">Ya ahorrado ($)</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={form.current_savings === 0 ? '' : form.current_savings}
                onChange={e => handleFormChange('current_savings', Number(e.target.value))}
                className="w-full rounded-xl border border-(--gray-100) bg-white px-3 py-2 text-sm text-(--dark) outline-none focus:border-(--primary-300)"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-(--gray-400)">Ahorro mensual estimado ($)</label>
            <input
              type="number"
              inputMode="numeric"
              placeholder="200000"
              value={form.monthly_saving === 0 ? '' : form.monthly_saving}
              onChange={e => handleFormChange('monthly_saving', Number(e.target.value))}
              className="w-full rounded-xl border border-(--gray-100) bg-white px-3 py-2 text-sm text-(--dark) outline-none focus:border-(--primary-300)"
            />
          </div>

          {/* Preview */}
          {form.target_amount > 0 && form.monthly_saving > 0 && (
            <div className="mb-3 rounded-xl bg-(--secondary2-100)/10 px-3 py-2 text-xs font-medium text-(--secondary2-100)">
              ⏳ Alcanzarías esta meta en {timeLabel(monthsToGoal({ ...form, id: 0, person_id: 0, created_at: '' }))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              className="flex-1 rounded-xl border border-(--gray-100) py-2.5 text-sm font-semibold text-(--gray-400)"
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleAdd()}
              disabled={saving || form.name.trim() === '' || form.target_amount <= 0}
              className="flex-1 rounded-xl bg-(--secondary2-100) py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Agregar meta'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-(--gray-200) py-3 text-sm font-semibold text-(--gray-300) hover:border-(--primary-300) hover:text-(--primary-300) transition-colors"
        >
          + Agregar meta
        </button>
      )}
    </div>
  )
}
