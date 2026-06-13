import type { CollabOperation } from '../../shared/types.js'
import { CollabSessionManager } from './CollabSessionManager.js'

interface FieldState {
  value: unknown
  revision: number
  lastEditUserId: string | null
}

interface PendingConflict {
  userId: string
  yourValue: unknown
  timestamp: number
}

interface SessionState {
  revision: number
  fields: Record<string, FieldState>
  pendingConflicts: Record<string, PendingConflict>
}

const sessionStates = new Map<string, SessionState>()

function getOrCreateState(sessionId: string): SessionState {
  let state = sessionStates.get(sessionId)
  if (!state) {
    state = {
      revision: 0,
      fields: {},
      pendingConflicts: {},
    }
    sessionStates.set(sessionId, state)
  }
  return state
}

function bumpRevision(sessionId: string): number {
  const state = getOrCreateState(sessionId)
  state.revision++
  return state.revision
}

function applyOperation(
  sessionId: string,
  userId: string,
  field: string,
  newValue: unknown,
  oldValue: unknown,
): {
  operation: CollabOperation
  conflict: boolean
  resolvedValue: unknown
  serverValue: unknown
  yourValue: unknown
} {
  CollabSessionManager.getOrCreateSession(sessionId)
  const state = getOrCreateState(sessionId)
  const fieldState = state.fields[field]
  const serverValue = fieldState?.value

  if (
    fieldState &&
    fieldState.revision > 0 &&
    serverValue !== undefined &&
    oldValue !== serverValue &&
    fieldState.lastEditUserId !== null &&
    fieldState.lastEditUserId !== userId
  ) {
    state.pendingConflicts[field] = {
      userId,
      yourValue: newValue,
      timestamp: Date.now(),
    }

    const rev = bumpRevision(sessionId)
    const operation: CollabOperation = {
      id: `${sessionId}-${rev}`,
      userId,
      field,
      oldValue,
      newValue: serverValue,
      timestamp: Date.now(),
      revision: rev,
    }

    return {
      operation,
      conflict: true,
      resolvedValue: serverValue,
      serverValue: serverValue!,
      yourValue: newValue,
    }
  }

  const rev = bumpRevision(sessionId)
  const operation: CollabOperation = {
    id: `${sessionId}-${rev}`,
    userId,
    field,
    oldValue,
    newValue,
    timestamp: Date.now(),
    revision: rev,
  }

  state.fields[field] = {
    value: newValue,
    revision: rev,
    lastEditUserId: userId,
  }

  return {
    operation,
    conflict: false,
    resolvedValue: newValue,
    serverValue: serverValue ?? oldValue,
    yourValue: newValue,
  }
}

function resolveConflict(
  sessionId: string,
  userId: string,
  field: string,
  resolution: 'yours' | 'theirs',
  yourValue: unknown,
  serverValue: unknown,
): { operation: CollabOperation; resolvedValue: unknown } {
  const state = sessionStates.get(sessionId)
  if (!state) {
    const resolvedValue = resolution === 'yours' ? yourValue : serverValue
    return {
      operation: {
        id: 'fallback',
        userId,
        field,
        oldValue: serverValue,
        newValue: resolvedValue,
        timestamp: Date.now(),
        revision: 0,
      },
      resolvedValue,
    }
  }

  const pending = state.pendingConflicts[field]
  delete state.pendingConflicts[field]

  const currentFieldValue = state.fields[field]?.value ?? serverValue
  const resolvedValue = resolution === 'yours'
    ? (pending?.yourValue ?? yourValue)
    : currentFieldValue

  const rev = bumpRevision(sessionId)
  const operation: CollabOperation = {
    id: `${sessionId}-${rev}`,
    userId,
    field,
    oldValue: currentFieldValue,
    newValue: resolvedValue,
    timestamp: Date.now(),
    revision: rev,
  }

  state.fields[field] = {
    value: resolvedValue,
    revision: rev,
    lastEditUserId: userId,
  }

  return { operation, resolvedValue }
}

function syncState(sessionId: string): { fields: Record<string, unknown>; revision: number } | null {
  const state = sessionStates.get(sessionId)
  if (!state) return null
  const fieldValues: Record<string, unknown> = {}
  for (const [key, fs] of Object.entries(state.fields)) {
    fieldValues[key] = fs.value
  }
  return {
    fields: fieldValues,
    revision: state.revision,
  }
}

function getFieldState(sessionId: string, field: string): FieldState | undefined {
  const state = sessionStates.get(sessionId)
  if (!state) return undefined
  return state.fields[field]
}

export const CollabOTEngine = {
  applyOperation,
  resolveConflict,
  syncState,
  getFieldState,
}
