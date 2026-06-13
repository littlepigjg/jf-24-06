import { useRef, useEffect, useCallback, useState } from 'react'
import type { CollabMessage, CollabUser, CollabOperation } from '@shared/types'

interface RemoteChange {
  field: string
  value: unknown
  userId: string
  operation: CollabOperation
}

export interface ConflictInfo {
  field: string
  yourValue: unknown
  theirValue: unknown
  operation: CollabOperation
}

interface CollaborationState {
  connected: boolean
  connecting: boolean
  userId: string
  user: CollabUser | null
  remoteUsers: CollabUser[]
  remoteChanges: RemoteChange[]
  conflicts: ConflictInfo[]
  syncedState: Record<string, unknown> | null
  revision: number
}

function generateUserId(): string {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const RECONNECT_BASE_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const HEARTBEAT_INTERVAL = 25000

export function useCollaboration(sessionId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const userIdRef = useRef(generateUserId())
  const sessionIdRef = useRef(sessionId)
  const pendingAckRef = useRef<Map<string, { field: string; value: unknown; timeout: ReturnType<typeof setTimeout> }>>(new Map())
  const mountedRef = useRef(true)

  const [state, setState] = useState<CollaborationState>({
    connected: false,
    connecting: false,
    userId: userIdRef.current,
    user: null,
    remoteUsers: [],
    remoteChanges: [],
    conflicts: [],
    syncedState: null,
    revision: 0,
  })

  sessionIdRef.current = sessionId

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  const sendMessage = useCallback((msg: CollabMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const connect = useCallback(() => {
    if (!sessionIdRef.current) return
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    setState((s) => ({ ...s, connecting: true }))

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/collab`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      reconnectAttemptsRef.current = 0
      setState((s) => ({ ...s, connected: true, connecting: false }))

      ws.send(JSON.stringify({
        type: 'join',
        sessionId: sessionIdRef.current,
        userId: userIdRef.current,
        user: { id: userIdRef.current, name: '', color: '' },
      }))

      heartbeatTimerRef.current = setInterval(() => {
        sendMessage({ type: 'pong', sessionId: sessionIdRef.current || '' })
      }, HEARTBEAT_INTERVAL)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      let msg: CollabMessage
      try {
        msg = JSON.parse(event.data) as CollabMessage
      } catch {
        return
      }

      switch (msg.type) {
        case 'sync_state': {
          const user = msg.user || null
          userIdRef.current = msg.userId || userIdRef.current
          setState((s) => ({
            ...s,
            user,
            userId: msg.userId || s.userId,
            syncedState: msg.state || null,
            revision: msg.revision || 0,
          }))
          break
        }

        case 'user_list': {
          setState((s) => ({
            ...s,
            remoteUsers: (msg.users || []).filter((u) => u.id !== s.userId),
          }))
          break
        }

        case 'join': {
          if (msg.userId !== userIdRef.current) {
            setState((s) => ({
              ...s,
              remoteUsers: [...s.remoteUsers.filter((u) => u.id !== msg.userId), msg.user!].filter((u) => u.id !== s.userId),
            }))
          }
          break
        }

        case 'leave': {
          setState((s) => ({
            ...s,
            remoteUsers: s.remoteUsers.filter((u) => u.id !== msg.userId),
          }))
          break
        }

        case 'cursor':
        case 'field_focus': {
          setState((s) => ({
            ...s,
            remoteUsers: s.remoteUsers.map((u) =>
              u.id === msg.userId
                ? {
                    ...u,
                    ...(msg.type === 'cursor' ? { cursorPosition: msg.value as number } : {}),
                    ...(msg.type === 'field_focus' ? { activeField: msg.field } : {}),
                  }
                : u
            ),
          }))
          break
        }

        case 'field_blur': {
          setState((s) => ({
            ...s,
            remoteUsers: s.remoteUsers.map((u) =>
              u.id === msg.userId
                ? { ...u, activeField: undefined, cursorPosition: undefined }
                : u
            ),
          }))
          break
        }

        case 'field_change': {
          if (msg.userId !== userIdRef.current && msg.operation) {
            setState((s) => ({
              ...s,
              remoteChanges: [
                ...s.remoteChanges,
                {
                  field: msg.field || '',
                  value: msg.value,
                  userId: msg.userId || '',
                  operation: msg.operation!,
                },
              ],
              revision: msg.operation?.revision || s.revision,
            }))
          }
          break
        }

        case 'field_change_ack': {
          if (msg.operation) {
            const opId = msg.operation.id
            const pending = pendingAckRef.current.get(opId)
            if (pending) {
              clearTimeout(pending.timeout)
              pendingAckRef.current.delete(opId)
            }
            setState((s) => ({
              ...s,
              revision: msg.revision || s.revision,
            }))
          }
          break
        }

        case 'conflict': {
          setState((s) => ({
            ...s,
            conflicts: [
              ...s.conflicts,
              {
                field: msg.conflictField || msg.field || '',
                yourValue: msg.value,
                theirValue: msg.oldValue,
                operation: msg.operation!,
              },
            ],
          }))
          break
        }
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      clearTimers()
      setState((s) => ({ ...s, connected: false, connecting: false }))

      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current),
        MAX_RECONNECT_DELAY
      )
      reconnectAttemptsRef.current++
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [clearTimers, sendMessage])

  const disconnect = useCallback(() => {
    sendMessage({
      type: 'leave',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
    })
    clearTimers()
    reconnectAttemptsRef.current = 9999
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [sendMessage, clearTimers])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [connect, disconnect])

  const sendFieldFocus = useCallback((field: string) => {
    sendMessage({
      type: 'field_focus',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      field,
    })
  }, [sendMessage])

  const sendFieldBlur = useCallback((field: string) => {
    sendMessage({
      type: 'field_blur',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      field,
    })
  }, [sendMessage])

  const sendFieldChange = useCallback((field: string, value: unknown, oldValue: unknown) => {
    const opId = `${userIdRef.current}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const timeout = setTimeout(() => {
      pendingAckRef.current.delete(opId)
    }, 10000)

    pendingAckRef.current.set(opId, { field, value, timeout })

    sendMessage({
      type: 'field_change',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      field,
      value,
      oldValue,
      revision: state.revision,
    })
  }, [sendMessage, state.revision])

  const sendCursor = useCallback((field: string, position: number) => {
    sendMessage({
      type: 'cursor',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      field,
      value: position,
    })
  }, [sendMessage])

  const resolveConflict = useCallback((field: string, resolution: 'yours' | 'theirs', yourValue: unknown) => {
    sendMessage({
      type: 'conflict',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      conflictField: field,
      conflictResolution: resolution,
      value: yourValue,
      oldValue: yourValue,
    })
    setState((s) => ({
      ...s,
      conflicts: s.conflicts.filter((c) => c.field !== field),
    }))
  }, [sendMessage])

  const consumeRemoteChange = useCallback(() => {
    let change: RemoteChange | undefined
    setState((s) => {
      if (s.remoteChanges.length === 0) return s
      change = s.remoteChanges[0]
      return { ...s, remoteChanges: s.remoteChanges.slice(1) }
    })
    return change
  }, [])

  const consumeAllRemoteChanges = useCallback((): RemoteChange[] => {
    let changes: RemoteChange[] = []
    setState((s) => {
      changes = s.remoteChanges
      return { ...s, remoteChanges: [] }
    })
    return changes
  }, [])

  const reconnect = useCallback(() => {
    disconnect()
    reconnectAttemptsRef.current = 0
    setTimeout(() => connect(), 100)
  }, [disconnect, connect])

  return {
    ...state,
    sendFieldFocus,
    sendFieldBlur,
    sendFieldChange,
    sendCursor,
    resolveConflict,
    consumeRemoteChange,
    consumeAllRemoteChanges,
    reconnect,
  }
}
