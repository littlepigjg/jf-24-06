import type { CollabUser, CollabOperation } from '../../shared/types.js'

interface FieldState {
  value: unknown
  revision: number
}

interface PendingConflict {
  field: string
  userId: string
  yourValue: unknown
  serverValue: unknown
  timestamp: number
}

interface Session {
  id: string
  users: Map<string, CollabUser>
  revision: number
  fields: Record<string, FieldState>
  pendingConflicts: Map<string, PendingConflict>
  lastActivity: number
}

const sessions = new Map<string, Session>()
const userColorMap = new Map<string, string>()
let colorIndex = 0

const COLLAB_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#6366f1',
]

function getNextColor(): string {
  const color = COLLAB_COLORS[colorIndex % COLLAB_COLORS.length]
  colorIndex++
  return color
}

function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId)
}

function getOrCreateSession(sessionId: string): Session {
  let session = sessions.get(sessionId)
  if (!session) {
    session = {
      id: sessionId,
      users: new Map(),
      revision: 0,
      fields: {},
      pendingConflicts: new Map(),
      lastActivity: Date.now(),
    }
    sessions.set(sessionId, session)
  }
  return session
}

function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) session.lastActivity = Date.now()
}

function addUser(sessionId: string, user: CollabUser): CollabUser {
  const session = getOrCreateSession(sessionId)
  if (!userColorMap.has(user.id)) {
    userColorMap.set(user.id, getNextColor())
  }
  user.color = userColorMap.get(user.id)!
  session.users.set(user.id, user)
  touchSession(sessionId)
  return user
}

function removeUser(sessionId: string, userId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false
  session.users.delete(userId)
  touchSession(sessionId)
  if (session.users.size === 0) {
    sessions.delete(sessionId)
    return false
  }
  return true
}

function updateUser(sessionId: string, userId: string, updates: Partial<CollabUser>): CollabUser | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined
  const user = session.users.get(userId)
  if (!user) return undefined
  Object.assign(user, updates)
  touchSession(sessionId)
  return user
}

function getUsers(sessionId: string): CollabUser[] {
  const session = sessions.get(sessionId)
  if (!session) return []
  return Array.from(session.users.values())
}

function getFieldValue(sessionId: string, field: string): unknown {
  const session = sessions.get(sessionId)
  if (!session) return undefined
  return session.fields[field]?.value
}

function getFieldRevision(sessionId: string, field: string): number {
  const session = sessions.get(sessionId)
  if (!session) return 0
  return session.fields[field]?.revision ?? 0
}

function bumpRevision(sessionId: string): number {
  const session = getOrCreateSession(sessionId)
  session.revision++
  return session.revision
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
  const session = getOrCreateSession(sessionId)
  touchSession(sessionId)

  const currentField = session.fields[field]
  const serverValue = currentField?.value

  const hasConflict = currentField !== undefined && serverValue !== undefined && oldValue !== serverValue

  if (hasConflict) {
    const conflictKey = `${userId}:${field}`
    session.pendingConflicts.set(conflictKey, {
      field,
      userId,
      yourValue: newValue,
      serverValue: serverValue!,
      timestamp: Date.now(),
    })

    const rev = bumpRevision(sessionId)
    const operation: CollabOperation = {
      id: `${sessionId}-${rev}`,
      userId,
      field,
      oldValue,
      newValue: serverValue!,
      timestamp: Date.now(),
      revision: rev,
    }

    return {
      operation,
      conflict: true,
      resolvedValue: serverValue!,
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

  session.fields[field] = {
    value: newValue,
    revision: rev,
  }

  const conflictKey = `${userId}:${field}`
  session.pendingConflicts.delete(conflictKey)

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
  const session = sessions.get(sessionId)
  if (!session) {
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

  const conflictKey = `${userId}:${field}`
  const pending = session.pendingConflicts.get(conflictKey)
  session.pendingConflicts.delete(conflictKey)

  const currentValue = session.fields[field]?.value ?? serverValue
  const resolvedValue = resolution === 'yours'
    ? (pending?.yourValue ?? yourValue)
    : currentValue

  const rev = bumpRevision(sessionId)
  const operation: CollabOperation = {
    id: `${sessionId}-${rev}`,
    userId,
    field,
    oldValue: currentValue,
    newValue: resolvedValue,
    timestamp: Date.now(),
    revision: rev,
  }

  session.fields[field] = {
    value: resolvedValue,
    revision: rev,
  }

  touchSession(sessionId)

  return { operation, resolvedValue }
}

function syncState(sessionId: string): { fields: Record<string, unknown>; revision: number } | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  const fieldValues: Record<string, unknown> = {}
  for (const [key, fs] of Object.entries(session.fields)) {
    fieldValues[key] = fs.value
  }
  return {
    fields: fieldValues,
    revision: session.revision,
  }
}

function cleanupStaleSessions(maxAgeMs: number = 30 * 60 * 1000): void {
  const now = Date.now()
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > maxAgeMs && session.users.size === 0) {
      sessions.delete(id)
    }
  }
}

setInterval(() => cleanupStaleSessions(), 5 * 60 * 1000)

export const SessionStore = {
  getSession,
  getOrCreateSession,
  addUser,
  removeUser,
  updateUser,
  getUsers,
  getFieldValue,
  getFieldRevision,
  applyOperation,
  resolveConflict,
  syncState,
}
