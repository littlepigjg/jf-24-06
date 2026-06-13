import type { CollabMessage, CollabUser } from '@shared/types'
import type { CollabMessageHandler } from './types'

const RECONNECT_BASE_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const HEARTBEAT_INTERVAL = 25000

export interface CollabClientOptions {
  sessionId: string
  userId: string
  userName?: string
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

export class CollabClient {
  private ws: WebSocket | null = null
  private sessionId: string
  private userId: string
  private userName: string
  private onConnect?: () => void
  private onDisconnect?: () => void
  private onError?: (error: Error) => void
  private messageHandlers = new Set<CollabMessageHandler>()
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private manualDisconnect = false
  private _connected = false
  private _connecting = false

  constructor(options: CollabClientOptions) {
    this.sessionId = options.sessionId
    this.userId = options.userId
    this.userName = options.userName || `用户${options.userId.slice(-4)}`
    this.onConnect = options.onConnect
    this.onDisconnect = options.onDisconnect
    this.onError = options.onError
  }

  get connected(): boolean {
    return this._connected
  }

  get connecting(): boolean {
    return this._connecting
  }

  getUserId(): string {
    return this.userId
  }

  setSessionId(sessionId: string): void {
    if (this.sessionId === sessionId) return
    this.sessionId = sessionId
    if (this._connected) {
      this.disconnect()
      this.connect()
    }
  }

  onMessage(handler: CollabMessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.manualDisconnect = false
    this._connecting = true

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/collab`

    const ws = new WebSocket(wsUrl)
    this.ws = ws

    ws.onopen = () => {
      this._connected = true
      this._connecting = false
      this.reconnectAttempts = 0

      this.sendRaw({
        type: 'join',
        sessionId: this.sessionId,
        userId: this.userId,
        user: { id: this.userId, name: this.userName, color: '' },
      })

      this.startHeartbeat()
      this.onConnect?.()
    }

    ws.onmessage = (event) => {
      let msg: CollabMessage
      try {
        msg = JSON.parse(event.data) as CollabMessage
      } catch {
        return
      }
      this.messageHandlers.forEach((h) => h(msg))
    }

    ws.onclose = () => {
      this._connected = false
      this._connecting = false
      this.stopHeartbeat()
      this.onDisconnect?.()

      if (!this.manualDisconnect) {
        this.scheduleReconnect()
      }
    }

    ws.onerror = () => {
      this.onError?.(new Error('WebSocket error'))
    }
  }

  disconnect(): void {
    if (this._connected) {
      this.sendRaw({
        type: 'leave',
        sessionId: this.sessionId,
        userId: this.userId,
      })
    }
    this.manualDisconnect = true
    this.clearReconnectTimer()
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._connected = false
    this._connecting = false
  }

  reconnect(): void {
    this.reconnectAttempts = 0
    this.manualDisconnect = false
    this.disconnect()
    setTimeout(() => this.connect(), 100)
  }

  send(message: Omit<CollabMessage, 'sessionId' | 'userId'> & { sessionId?: string; userId?: string }): void {
    this.sendRaw({
      ...message,
      sessionId: message.sessionId ?? this.sessionId,
      userId: message.userId ?? this.userId,
    })
  }

  private sendRaw(message: CollabMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw({
        type: 'pong',
        sessionId: this.sessionId,
        userId: this.userId,
      })
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    )
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      if (!this.manualDisconnect) {
        this.connect()
      }
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
