import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { CollabClient } from './CollabClient'
import type { CollabUser, CollabMessage, CollabOperation } from '@shared/types'
import type { RemoteChange, ConflictInfo, CollabState } from './types'

export type { RemoteChange, ConflictInfo } from './types'

export interface UseCollabReturn extends CollabState {
  conflicts: ConflictInfo[]
  sendFieldFocus: (field: string) => void
  sendFieldBlur: (field: string) => void
  sendFieldChange: (field: string, value: unknown, oldValue: unknown) => void
  sendCursor: (field: string, position: number) => void
  resolveConflict: (field: string, resolution: 'yours' | 'theirs', yourValue: unknown) => void
  onRemoteChange: (callback: (change: RemoteChange) => void) => () => void
  reconnect: () => void
}

function generateUserId(): string {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function useCollab(sessionId: string | undefined): UseCollabReturn {
  const [state, setState] = useState<CollabState>({
    connected: false,
    connecting: false,
    userId: '',
    user: null,
    remoteUsers: [],
    syncedFields: null,
    revision: 0,
    syncReady: false,
  })

  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])

  const userIdRef = useRef(generateUserId())
  const clientRef = useRef<CollabClient | null>(null)
  const remoteChangeCallbacksRef = useRef<Set<(change: RemoteChange) => void>>(new Set())
  const syncAppliedRef = useRef(false)
  const sessionIdRef = useRef(sessionId)

  sessionIdRef.current = sessionId

  const onRemoteChange = useCallback((callback: (change: RemoteChange) => void) => {
    remoteChangeCallbacksRef.current.add(callback)
    return () => {
      remoteChangeCallbacksRef.current.delete(callback)
    }
  }, [])

  const handleMessage = useCallback((rawMsg: unknown) => {
    const msg = rawMsg as CollabMessage

    switch (msg.type) {
      case 'sync_state': {
        if (syncAppliedRef.current) return
        syncAppliedRef.current = true
        const user = msg.user || null
        userIdRef.current = msg.userId || userIdRef.current
        setState((s) => ({
          ...s,
          user,
          userId: msg.userId || s.userId,
          syncedFields: msg.state || null,
          revision: msg.revision || 0,
          syncReady: true,
        }))
        break
      }

      case 'user_list': {
        setState((s) => ({
          ...s,
          remoteUsers: (msg.users || []).filter((u: CollabUser) => u.id !== s.userId),
        }))
        break
      }

      case 'join': {
        if (msg.userId !== userIdRef.current && msg.user) {
          setState((s) => ({
            ...s,
            remoteUsers: [...s.remoteUsers.filter((u) => u.id !== msg.userId), msg.user!],
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
          remoteUsers: s.remoteUsers.map((u: CollabUser) =>
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
          remoteUsers: s.remoteUsers.map((u: CollabUser) =>
            u.id === msg.userId
              ? { ...u, activeField: undefined, cursorPosition: undefined }
              : u
          ),
        }))
        break
      }

      case 'field_change': {
        if (!msg.operation) break

        const change: RemoteChange = {
          field: msg.field || '',
          value: msg.value,
          userId: msg.userId || '',
          operation: msg.operation,
        }

        if (msg.userId !== userIdRef.current) {
          remoteChangeCallbacksRef.current.forEach((cb) => cb(change))
        }

        setState((s) => ({
          ...s,
          revision: msg.operation?.revision || s.revision,
        }))
        break
      }

      case 'conflict': {
        const newConflict: ConflictInfo = {
          field: msg.conflictField || msg.field || '',
          yourValue: msg.value,
          theirValue: msg.oldValue,
          operation: msg.operation!,
        }
        setConflicts((prev) => {
          const filtered = prev.filter((c) => c.field !== newConflict.field)
          return [...filtered, newConflict]
        })
        break
      }
    }
  }, [])

  useEffect(() => {
    if (!sessionIdRef.current) return

    syncAppliedRef.current = false
    setConflicts([])
    setState((s) => ({ ...s, syncReady: false, syncedFields: null }))

    const client = new CollabClient({
      sessionId: sessionIdRef.current,
      userId: userIdRef.current,
      onConnect: () => {
        syncAppliedRef.current = false
        setState((s) => ({ ...s, connected: true, connecting: false, syncReady: false }))
      },
      onDisconnect: () => {
        syncAppliedRef.current = false
        setState((s) => ({ ...s, connected: false, connecting: false, syncReady: false }))
      },
    })

    client.onMessage(handleMessage)
    clientRef.current = client
    client.connect()
    setState((s) => ({ ...s, connecting: true, userId: userIdRef.current }))

    return () => {
      client.disconnect()
      clientRef.current = null
    }
  }, [sessionId, handleMessage])

  const sendFieldFocus = useCallback((field: string) => {
    clientRef.current?.send({ type: 'field_focus', field })
  }, [])

  const sendFieldBlur = useCallback((field: string) => {
    clientRef.current?.send({ type: 'field_blur', field })
  }, [])

  const sendFieldChange = useCallback((field: string, value: unknown, oldValue: unknown) => {
    clientRef.current?.send({
      type: 'field_change',
      field,
      value,
      oldValue,
      revision: state.revision,
    })
  }, [state.revision])

  const sendCursor = useCallback((field: string, position: number) => {
    clientRef.current?.send({ type: 'cursor', field, value: position })
  }, [])

  const resolveConflict = useCallback((field: string, resolution: 'yours' | 'theirs', yourValue: unknown) => {
    const conflict = conflicts.find((c) => c.field === field)
    if (!conflict) return

    clientRef.current?.send({
      type: 'conflict',
      conflictField: field,
      conflictResolution: resolution,
      value: yourValue,
      oldValue: conflict.theirValue,
    })

    setConflicts((prev) => prev.filter((c) => c.field !== field))
  }, [conflicts])

  const reconnect = useCallback(() => {
    syncAppliedRef.current = false
    setConflicts([])
    setState((s) => ({ ...s, syncReady: false, syncedFields: null, revision: 0 }))
    clientRef.current?.reconnect()
  }, [])

  return useMemo(() => ({
    ...state,
    conflicts,
    sendFieldFocus,
    sendFieldBlur,
    sendFieldChange,
    sendCursor,
    resolveConflict,
    onRemoteChange,
    reconnect,
  }), [
    state,
    conflicts,
    sendFieldFocus,
    sendFieldBlur,
    sendFieldChange,
    sendCursor,
    resolveConflict,
    onRemoteChange,
    reconnect,
  ])
}
