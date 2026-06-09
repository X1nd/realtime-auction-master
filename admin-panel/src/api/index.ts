const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const TOKEN_KEY = 'auction_admin_token'
const USER_KEY = 'auction_admin_user'

let authToken = localStorage.getItem(TOKEN_KEY) || ''

export function setToken(token: string) {
  authToken = token
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string {
  return authToken
}

export function clearToken() {
  authToken = ''
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function setCurrentUser(userId: number, username: string, nickname?: string) {
  localStorage.setItem(USER_KEY, JSON.stringify({ userId, username, nickname: nickname || username }))
}

export function getCurrentUser(): { userId: number; username: string; nickname: string } | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok && !data.success) {
    throw new Error(data.message || '请求失败')
  }
  return data
}

export async function getDevToken() {
  const cur = getCurrentUser()
  const base = cur ? `/auth/dev-token?username=${encodeURIComponent(cur.username)}` : '/auth/dev-token'
  const url = base.includes('?') ? base + '&role=admin' : base + '?role=admin'
  const data = await request(url, { method: 'POST' })
  if (data.success && data.data) {
    setToken(data.data.accessToken || data.data.token)
    if (data.data.userId) setCurrentUser(data.data.userId, data.data.username, data.data.nickname)
  }
  return data
}

export async function getDevTokenForUser(username: string) {
  const data = await request(`/auth/dev-token?username=${encodeURIComponent(username)}&role=admin`, { method: 'POST' })
  if (data.success && data.data) {
    setToken(data.data.accessToken || data.data.token)
    if (data.data.userId) setCurrentUser(data.data.userId, data.data.username, data.data.nickname)
  }
  return data
}

export async function listUsers() {
  return request('/users')
}

export async function login(username: string, password: string) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (data.success && data.data?.accessToken) {
    setToken(data.data.token)
    if (data.data.user) setCurrentUser(data.data.user.id, data.data.user.username, data.data.user.nickname)
  }
  return data
}

export async function createAuction(data: {
  name: string
  description?: string
  imageUrl?: string
  startPrice: number
  incrementPrice: number
  maxPrice?: number
  durationSeconds: number
  autoDelaySeconds: number
  sortOrder?: number
  round?: number
}) {
  return request('/auctions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function uploadImage(file: File): Promise<{ success: boolean; data?: { url: string }; message?: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const headers: Record<string, string> = {}
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', headers, body: formData })
  return res.json()
}

export interface BatchAuctionItem {
  name: string
  description?: string
  imageUrl?: string
  startPrice: number
  incrementPrice?: number
  maxPrice?: number
  durationSeconds?: number
  autoDelaySeconds?: number
  sortOrder?: number
  round?: number
}

export async function batchCreateAuctions(items: BatchAuctionItem[]) {
  return request('/auctions/batch', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export async function listAuctions(page = 1, pageSize = 10, userId?: number) {
  let url = `/auctions?page=${page}&pageSize=${pageSize}`
  if (userId) url += `&userId=${userId}`
  return request(url)
}

export async function startAuction(id: number) {
  return request(`/auctions/${id}/start`, { method: 'POST' })
}

export async function cancelAuction(id: number) {
  return request(`/auctions/${id}/cancel`, { method: 'POST' })
}

export async function listOrders(page = 1, pageSize = 10) {
  return request(`/orders?page=${page}&pageSize=${pageSize}`)
}

export async function getMerchantRooms() {
  return request('/merchants/rooms')
}

export async function getAuctionSequence(userId?: number) {
  let url = '/auctions/sequence'
  if (userId) url += `?userId=${userId}`
  return request(url)
}

export async function reorderAuctions(items: { id: number; sortOrder: number }[]) {
  return request('/auctions/reorder', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  })
}

export async function updateAuction(id: number, data: {
  name?: string
  description?: string
  imageUrl?: string
  startPrice?: number
  incrementPrice?: number
  maxPrice?: number
  durationSeconds?: number
  autoDelaySeconds?: number
  sortOrder?: number
  round?: number
}) {
  return request(`/auctions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function clearAuctions() {
  return request('/auctions/clear', { method: 'DELETE' })
}

export async function getDashboardStats(userId?: number) {
  const qs = userId ? `?userId=${userId}` : ''
  return request(`/dashboard/stats${qs}`)
}

export async function markOrderPaid(id: number) {
  return request(`/orders/${id}/pay`, { method: 'POST' })
}
