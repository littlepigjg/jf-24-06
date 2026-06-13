import type { CollabMessage } from '@shared/types'
import type { CollabConnectionOptions } from '@/types/collab'

const RECONNECT_BASE_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const HEARTBEAT_INTERVAL = 25000

export function generateUserId(): string {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export class CollabConnection {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private mounted = false
  private options: CollabConnectionOptions
  private onMessageCallback: ((msg: CollabMessage) => void) | null = null

  constructor(options: CollabConnectionOptions) {
    this.options = options
  }

  setOnMessage(callback: (msg: CollabMessage) => void) {
    this.onMessageCallback = callback
  }

  private clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  connect() {
    if (!this.options.sessionId) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.mounted = true
    this.options.onConnect?.()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/collab`

    const ws = new WebSocket(wsUrl)
    this.ws = ws

    ws.onopen = () => {
      if (!this.mounted) return
      this.reconnectAttempts = 0
      this.options.onConnect?.()

      ws.send(JSON.stringify({
        type: 'join',
        sessionId: this.options.sessionId,
        userId: this.options.userId,
        user: { id: this.options.userId, name: '', color: '' },
      }))

      this.heartbeatTimer = setInterval(() => {
        this.sendMessage({ type: 'pong', sessionId: this.options.sessionId || '' })
      }, HEARTBEAT_INTERVAL)
    }

    ws.onmessage = (event) => {
      if (!this.mounted) return
      let msg: CollabMessage
      try {
        msg = JSON.parse(event.data) as CollabMessage
      } catch {
        return
      }
      this.onMessageCallback?.(msg)
    }

    ws.onclose = () => {
      if (!this.mounted) return
      this.clearTimers()
      this.options.onDisconnect?.()

      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
        MAX_RECONNECT_DELAY
      )
      this.reconnectAttempts++
      this.reconnectTimer = setTimeout(() => {
        if (this.mounted) this.connect()
      }, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  disconnect() {
    if (this.ws) {
      try {
        this.sendMessage({
          type: 'leave',
          sessionId: this.options.sessionId || '',
          userId: this.options.userId,
        })
      } catch (e) {
        // ignore
      }
    }
    this.mounted = false
    this.clearTimers()
    this.reconnectAttempts = 9999
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  sendMessage(msg: CollabMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  reconnect() {
    this.disconnect()
    this.reconnectAttempts = 0
    this.mounted = true
    setTimeout(() => this.connect(), 100)
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  isConnecting() {
    return this.ws?.readyState === WebSocket.CONNECTING
  }
}
