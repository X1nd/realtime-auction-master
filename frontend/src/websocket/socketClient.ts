class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string = ''
  private token: string = ''
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map()
  private isManualClose = false
  private lastPongTime = 0
  private visibilityHandler: (() => void) | null = null

  connect(url: string, token: string): void {
    this.url = url
    this.token = token
    this.isManualClose = false
    this.lastPongTime = Date.now()

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('✅ WebSocket 已连接或正在连接中')
      return
    }

    const fullUrl = `${url}?token=${encodeURIComponent(token)}`
    this.ws = new WebSocket(fullUrl)

    this.setupEventListeners()
    this.setupVisibilityHandler()
  }

  private setupVisibilityHandler(): void {
    this.removeVisibilityHandler()
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        // Android app回到前台，检查连接是否存活
        const staleTime = Date.now() - this.lastPongTime
        if (staleTime > 60000 || !this.isConnected()) {
          console.log('[Visibility] 连接已断开，重新连接...')
          this.reconnectAttempts = 0
          this.reconnectDelay = 1000
          this.scheduleReconnect()
        } else {
          console.log('[Visibility] 连接正常')
        }
      } else if (document.visibilityState === 'hidden') {
        // 进入后台，记录时间用于回来时检查
        this.lastPongTime = Date.now()
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private removeVisibilityHandler(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
  }

  private setupEventListeners(): void {
    if (!this.ws) return

    this.ws.onopen = () => {
      console.log('✅ WebSocket 连接成功')
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.emit('connected', null)
    }

    this.ws.onmessage = (event) => {
      this.lastPongTime = Date.now()
      try {
        const message = JSON.parse(event.data)
        if (message.event) {
          this.emit(message.event, message.data)
        }
      } catch (e) {
        console.warn('解析WebSocket消息失败', e, event.data)
      }
    }

    this.ws.onclose = (event) => {
      console.log('⚠️ WebSocket 断开连接, code:', event.code)
      this.stopHeartbeat()
      this.emit('disconnected', null)
      
      if (!this.isManualClose) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket 错误:', error)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send('ping', null)
      }
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ 达到最大重连次数，停止重连')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000)
    console.log(`🔄 准备重连，第${this.reconnectAttempts}次尝试，延迟${delay}ms`)

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
    }
    
    this.reconnectTimer = window.setTimeout(() => {
      if (this.url && this.token) {
        this.connect(this.url, this.token)
      }
    }, delay)
  }

  send(event: string, data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket未连接，无法发送消息:', event)
      return
    }

    const message = JSON.stringify({ event, data })
    this.ws.send(message)
  }

  on(event: string, callback: (data: any) => void): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, [])
    }
    this.messageHandlers.get(event)!.push(callback)
  }

  off(event: string, callback?: (data: any) => void): void {
    if (!callback) {
      this.messageHandlers.delete(event)
      return
    }
    
    const handlers = this.messageHandlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(callback)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.messageHandlers.get(event)
    if (handlers) {
      handlers.forEach(callback => callback(data))
    }
  }

  disconnect(): void {
    this.isManualClose = true
    this.stopHeartbeat()
    this.removeVisibilityHandler()

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }
}

export const wsClient = new WebSocketClient()
export default wsClient
