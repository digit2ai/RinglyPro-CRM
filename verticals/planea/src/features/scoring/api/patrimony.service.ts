import { supabase } from '../../../configurations/supabase'

export interface PatrimonyItem {
  id: number
  person_id: number
  name: string
  type: string
  value: number
  created_at: string
}

export interface PatrimonyStatus {
  housing_status: 'owned' | 'mortgage' | 'rented' | null
}

export async function loadPersonId(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('persons')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null || data === null) return null
  return Number((data as { id: unknown }).id)
}

export async function loadPatrimonyStatus(userId: string): Promise<PatrimonyStatus> {
  const { data, error } = await supabase
    .from('persons')
    .select('patrimony_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null || data === null) return { housing_status: null }
  const pd = (data as { patrimony_data: Partial<PatrimonyStatus> }).patrimony_data ?? {}
  return { housing_status: pd.housing_status ?? null }
}

export async function savePatrimonyStatus(
  userId: string,
  status: PatrimonyStatus['housing_status'],
): Promise<void> {
  await supabase
    .from('persons')
    .update({ patrimony_data: { housing_status: status } })
    .eq('user_id', userId)
}

// ── INTERNAL HELPERS ──────────────────────────────────────────────────────────

function parseItems(raw: unknown): PatrimonyItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map(r => {
    const item = r as Record<string, unknown>
    return {
      id: Number(item.id),
      person_id: Number(item.person_id),
      name: String(item.name),
      type: String(item.type),
      value: Number(item.value),
      created_at: String(item.created_at),
    }
  })
}

async function readPatrimony(
  personId: number,
): Promise<{ assets_data: PatrimonyItem[]; liabilities_data: PatrimonyItem[] }> {
  const { data } = await supabase
    .from('persons_patrimony')
    .select('assets_data, liabilities_data')
    .eq('person_id', personId)
    .maybeSingle()

  if (data === null) return { assets_data: [], liabilities_data: [] }
  const d = data as { assets_data: unknown; liabilities_data: unknown }
  return { assets_data: parseItems(d.assets_data), liabilities_data: parseItems(d.liabilities_data) }
}

async function writeAssets(personId: number, items: PatrimonyItem[]): Promise<void> {
  await supabase
    .from('persons_patrimony')
    .upsert({ person_id: personId, assets_data: items }, { onConflict: 'person_id' })
}

async function writeLiabilities(personId: number, items: PatrimonyItem[]): Promise<void> {
  await supabase
    .from('persons_patrimony')
    .upsert({ person_id: personId, liabilities_data: items }, { onConflict: 'person_id' })
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

export async function loadAllPatrimony(
  personId: number,
): Promise<{ assets: PatrimonyItem[]; liabilities: PatrimonyItem[] }> {
  const { assets_data, liabilities_data } = await readPatrimony(personId)
  return { assets: assets_data, liabilities: liabilities_data }
}

export async function insertAsset(
  personId: number,
  name: string,
  type: string,
  value: number,
): Promise<PatrimonyItem> {
  const { assets_data } = await readPatrimony(personId)
  const item: PatrimonyItem = {
    id: Date.now(),
    person_id: personId,
    name,
    type,
    value,
    created_at: new Date().toISOString(),
  }
  await writeAssets(personId, [...assets_data, item])
  return item
}

export async function updateAsset(
  personId: number,
  id: number,
  name: string,
  value: number,
): Promise<void> {
  const { assets_data } = await readPatrimony(personId)
  await writeAssets(personId, assets_data.map(a => (a.id === id ? { ...a, name, value } : a)))
}

export async function deleteAsset(personId: number, id: number): Promise<void> {
  const { assets_data } = await readPatrimony(personId)
  await writeAssets(personId, assets_data.filter(a => a.id !== id))
}

export async function insertLiability(
  personId: number,
  name: string,
  type: string,
  value: number,
): Promise<PatrimonyItem> {
  const { liabilities_data } = await readPatrimony(personId)
  const item: PatrimonyItem = {
    id: Date.now(),
    person_id: personId,
    name,
    type,
    value,
    created_at: new Date().toISOString(),
  }
  await writeLiabilities(personId, [...liabilities_data, item])
  return item
}

export async function updateLiability(
  personId: number,
  id: number,
  name: string,
  value: number,
): Promise<void> {
  const { liabilities_data } = await readPatrimony(personId)
  await writeLiabilities(personId, liabilities_data.map(p => (p.id === id ? { ...p, name, value } : p)))
}

export async function deleteLiability(personId: number, id: number): Promise<void> {
  const { liabilities_data } = await readPatrimony(personId)
  await writeLiabilities(personId, liabilities_data.filter(p => p.id !== id))
}
