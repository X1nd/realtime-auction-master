const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const TOKEN_KEY = 'auction_token'
const REFRESH_KEY = 'auction_refresh_token'

let authToken = localStorage.getItem(TOKEN_KEY) || ''
let refreshToken = localStorage.getItem(REFRESH_KEY) || ''

export function setTokens(access: string, refresh: string) {
  authToken = access
  refreshToken = refresh
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function getToken(): string {
  return authToken
}

export function clearTokens() {
  authToken = ''
  refreshToken = ''
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    const data = await res.json()
    if (data.success && data.data?.accessToken) {
      setTokens(data.data.accessToken, data.data.refreshToken)
      return true
    }
  } catch {}
  clearTokens()
  return false
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
  if (res.status === 401 && refreshToken) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${authToken}`
      const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers })
      const retryData = await retryRes.json()
      if (!retryRes.ok && !retryData.success) {
        throw new Error(retryData.message || '请求失败')
      }
      return retryData
    }
  }
  const data = await res.json()
  if (!res.ok && !data.success) {
    throw new Error(data.message || '请求失败')
  }
  return data
}

export async function getDevToken() {
  const data = await request('/auth/dev-token', { method: 'POST' })
  if (data.success && data.data?.accessToken) {
    setTokens(data.data.accessToken, data.data.refreshToken)
  }
  return data
}

export async function login(username: string, password: string) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (data.success && data.data?.accessToken) {
    setTokens(data.data.accessToken, data.data.refreshToken)
  }
  return data
}

export async function logout() {
  await request('/auth/logout', { method: 'POST' })
  clearTokens()
}

export async function register(username: string, password: string) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function listAuctions(page = 1, pageSize = 10) {
  return request(`/auctions?page=${page}&pageSize=${pageSize}`)
}

export async function getAuction(id: number) {
  return request(`/auctions/${id}`)
}

export async function getAuctionSequence(userId?: number) {
  const qs = userId ? `?userId=${userId}` : ''
  return request(`/auctions/sequence${qs}`)
}

export async function getOrder(id: number) {
  return request(`/orders/${id}`)
}

export async function payOrder(id: number) {
  return request(`/orders/${id}/pay`, { method: 'POST' })
}

export async function listMyOrders(page = 1, pageSize = 10) {
  return request(`/orders/me?page=${page}&pageSize=${pageSize}`)
}

export async function listMyBids(params: { goodsId?: number; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams()
  if (params.goodsId) query.set('goodsId', String(params.goodsId))
  query.set('page', String(params.page || 1))
  query.set('pageSize', String(params.pageSize || 20))
  return request(`/bids/me?${query.toString()}`)
}

export async function getMerchantRooms() {
  return request('/merchants/rooms')
}

export async function createAuction(data: {
  name: string
  description?: string
  startPrice: number
  incrementPrice: number
  maxPrice?: number
  durationSeconds: number
  autoDelaySeconds: number
}) {
  return request('/auctions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
