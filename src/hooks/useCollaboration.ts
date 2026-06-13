import { useRef, useEffect, useCallback, useState } from 'react'
import type { CollabMessage, CollabUser } from '@shared/types'
import { CollabConnection, generateUserId } from '@/lib/collabConnection'
import type { RemoteChange, ConflictInfo, CollaborationState } from '@/types/collab'

export type { ConflictInfo } from '@/types/collab'

export interface UseCollaborationReturn extends CollaborationState {
  sendFieldFocus: (field: string) => void
  sendFieldBlur: (field: string) => void
  sendFieldChange: (field: string, value: unknown, oldValue: unknown) => void
  sendCursor: (field: string, position: number) => void
  resolveConflict: (field: string, resolution: 'yours' | 'theirs', yourValue: unknown) => void
  consumeRemoteChange: () => RemoteChange | undefined
  consumeAllRemoteChanges: () => RemoteChange[]
  reconnect: () => void
  onRemoteChange: (callback: (change: RemoteChange) => void) => () => void
  syncReady: boolean
}

export function useCollaboration(sessionId: string | undefined): UseCollaborationReturn {
  const [state, setState] = useState<CollaborationState>({
    connected: false,
    connecting: false,
    userId: '',
    user: null,
    remoteUsers: [],
    remoteChanges: [],
    conflicts: [],
    syncedState: null,
    revision: 0,
  })

  const [syncReady, setSyncReady] = useState(false)

  const userIdRef = useRef(generateUserId())
  const sessionIdRef = useRef(sessionId)
  const connectionRef = useRef<CollabConnection | null>(null)
  const remoteChangeCallbacksRef = useRef<Set<(change: RemoteChange) => void>>(new Set())
  const syncAppliedRef = useRef(false)

  sessionIdRef.current = sessionId

  const onRemoteChange = useCallback((callback: (change: RemoteChange) => void) => {
    remoteChangeCallbacksRef.current.add(callback)
    return () => {
      remoteChangeCallbacksRef.current.delete(callback)
    }
  }, [])

  const connect = useCallback(() => {
    if (!sessionIdRef.current) return

    const connection = new CollabConnection({
      sessionId: sessionIdRef.current,
      userId: userIdRef.current,
      onConnect: () => {
        setState((s) => ({ ...s, connected: true, connecting: false }))
      },
      onDisconnect: () => {
        setState((s) => ({ ...s, connected: false, connecting: false }))
      },
    })

    connection.setOnMessage((msg: CollabMessage) => {
      handleMessage(msg)
    })

    connectionRef.current = connection
    connection.connect()
    setState((s) => ({ ...s, connecting: true, userId: userIdRef.current }))
  }, [])

  const disconnect = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.disconnect()
      connectionRef.current = null
    }
  }, [])

  const handleMessage = useCallback((msg: CollabMessage) => {
    switch (msg.type) {
      case 'sync_state': {
        const user = msg.user || null
        userIdRef.current = msg.userId || userIdRef.current
        if (!syncAppliedRef.current) {
          syncAppliedRef.current = true
          setState((s) => ({
            ...s,
            user,
            userId: msg.userId || s.userId,
            syncedState: msg.state || null,
            revision: msg.revision || 0,
          }))
          setSyncReady(true)
        }
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
        const change: RemoteChange = {
          field: msg.field || '',
          value: msg.value,
          userId: msg.userId || '',
          operation: msg.operation!,
        }
        if (msg.userId !== userIdRef.current) {
          remoteChangeCallbacksRef.current.forEach((cb) => cb(change))
        }
        setState((s) => ({
          ...s,
          remoteChanges: [...s.remoteChanges, change],
          revision: msg.operation?.revision || s.revision,
        }))
        break
      }

      case 'field_change_ack': {
        if (msg.operation) {
          const change: RemoteChange = {
            field: msg.field || '',
            value: msg.value,
            userId: userIdRef.current,
            operation: msg.operation!,
          }
          remoteChangeCallbacksRef.current.forEach((cb) => cb(change))
          setState((s) => ({
            ...s,
            revision: msg.revision || s.revision,
          }))
        }
        break
      }

      case 'conflict': {
        const newConflict: ConflictInfo = {
          field: msg.conflictField || msg.field || '',
          yourValue: msg.value,
          theirValue: msg.oldValue,
          operation: msg.operation!,
        }
        setState((s) => ({
          ...s,
          conflicts: [
            ...s.conflicts.filter((c) => c.field !== newConflict.field),
            newConflict,
          ],
        }))
        break
      }
    }
  }, [])

  useEffect(() => {
    syncAppliedRef.current = false
    setSyncReady(false)
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  const sendFieldFocus = useCallback((field: string) => {
    connectionRef.current?.sendMessage({
      type: 'field_focus',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      field,
    })
  }, [])

  const sendFieldBlur = useCallback((field: string) => {
    connectionRef.current?.sendMessage({
      type: 'field_blur',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      field,
    })
  }, [])

  const sendFieldChange = useCallback((field: string, value: unknown, oldValue: unknown) => {
    connectionRef.current?.sendMessage({
      type: 'field_change',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      field,
      value,
      oldValue,
      revision: state.revision,
    })
  }, [state.revision])

  const sendCursor = useCallback((field: string, position: number) => {
    connectionRef.current?.sendMessage({
      type: 'cursor',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      field,
      value: position,
    })
  }, [])

  const resolveConflict = useCallback((field: string, resolution: 'yours' | 'theirs', yourValue: unknown) => {
    const conflict = state.conflicts.find((c) => c.field === field)

    connectionRef.current?.sendMessage({
      type: 'conflict',
      sessionId: sessionIdRef.current || '',
      userId: userIdRef.current,
      conflictField: field,
      conflictResolution: resolution,
      value: yourValue,
      oldValue: conflict?.theirValue,
    })

    setState((s) => ({
      ...s,
      conflicts: s.conflicts.filter((c) => c.field !== field),
    }))
  }, [state.conflicts])

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
    syncAppliedRef.current = false
    setSyncReady(false)
    connectionRef.current?.reconnect()
  }, [])

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
    onRemoteChange,
    syncReady,
  }
}
