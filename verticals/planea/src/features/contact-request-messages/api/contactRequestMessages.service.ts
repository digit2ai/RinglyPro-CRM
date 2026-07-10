import { supabase, supabaseConfig } from '../../../configurations/supabase'
import type {
  ContactRequestMessageListResponse,
  ContactRequestMessageStatus,
  ListContactRequestMessagesParams,
} from './contactRequestMessages.types'

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string }

async function buildAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? supabaseConfig.publishableKey
  return {
    Authorization: `Bearer ${token}`,
    apikey: supabaseConfig.publishableKey,
  }
}

export async function listContactRequestMessages(
  params: ListContactRequestMessagesParams = {},
): Promise<ServiceResult<ContactRequestMessageListResponse>> {
  const url = new URL(`${supabaseConfig.url}/functions/v1/list-contact-request-message`)

  if (params.page !== undefined) url.searchParams.set('page', String(params.page))
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit))
  if (params.status !== undefined) url.searchParams.set('status', params.status)
  if (params.q !== undefined && params.q.length > 0) url.searchParams.set('q', params.q)

  try {
    const response = await fetch(url.toString(), { headers: await buildAuthHeaders() })

    if (response.ok === false) {
      const body = (await response.json()) as { error: string }
      return { ok: false, message: body.error }
    }

    const body = (await response.json()) as ContactRequestMessageListResponse
    return { ok: true, data: body }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error desconocido' }
  }
}

export async function updateContactRequestMessageStatus(
  id: string,
  status: ContactRequestMessageStatus,
): Promise<ServiceResult<void>> {
  const url = new URL(`${supabaseConfig.url}/functions/v1/update-contact-request-message`)
  url.searchParams.set('id', id)

  try {
    const response = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        ...(await buildAuthHeaders()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })

    if (response.ok === false) {
      const body = (await response.json()) as { error: string }
      return { ok: false, message: body.error }
    }

    return { ok: true, data: undefined }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
