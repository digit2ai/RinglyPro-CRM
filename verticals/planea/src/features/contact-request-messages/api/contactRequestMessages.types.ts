export type ContactRequestMessageStatus = 'pending' | 'read' | 'archived'

export interface ContactRequestMessage {
  id: string
  name: string
  email: string
  message: string
  status: ContactRequestMessageStatus
  created_at: string
}

export interface ContactRequestMessageListMeta {
  total: number
  page: number
  limit: number
  pages: number
}

export interface ContactRequestMessageListResponse {
  data: ContactRequestMessage[]
  meta: ContactRequestMessageListMeta
}

export interface ListContactRequestMessagesParams {
  page?: number
  limit?: number
  status?: ContactRequestMessageStatus
  q?: string
}
