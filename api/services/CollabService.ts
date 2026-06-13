import type { CollabUser, CollabOperation } from '../../shared/types.js'
import { COLLAB_COLORS } from '../../shared/types.js'

interface SessionState {
  revision: number
  fields: Record<string, unknown>
  operations: CollabOperation[]
  pendingOps: Map<string, CollabOperation[]>
}

interface Session {
  id: string
  users: Map<string, CollabUser>
  state: SessionState
  lastActivity: number
}

const sessions = new Map<string, Session>()
const userColorMap = new Map<string, string>()
let colorIndex = 0

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
      state: {
        revision: 0,
        fields: {},
        operations: [],
        pendingOps: new Map(),
      },
      lastActivity: Date.now(),
    }
    sessions.set(sessionId, session)
  }
  return session
}

function addUser(sessionId: string, user: CollabUser): Session {
  const session = getOrCreateSession(sessionId)
  if (!userColorMap.has(user.id)) {
    userColorMap.set(user.id, getNextColor())
  }
  user.color = userColorMap.get(user.id)!
  session.users.set(user.id, user)
  session.lastActivity = Date.now()
  return session
}

function removeUser(sessionId: string, userId: string): Session | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined
  session.users.delete(userId)
  session.lastActivity = Date.now()
  if (session.users.size === 0) {
    sessions.delete(sessionId)
    return undefined
  }
  return session
}

function updateUser(sessionId: string, userId: string, updates: Partial<CollabUser>): CollabUser | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined
  const user = session.users.get(userId)
  if (!user) return undefined
  Object.assign(user, updates)
  session.lastActivity = Date.now()
  return user
}

function getUsers(sessionId: string): CollabUser[] {
  const session = sessions.get(sessionId)
  if (!session) return []
  return Array.from(session.users.values())
}

function applyOperation(
  sessionId: string,
  userId: string,
  field: string,
  newValue: unknown,
  oldValue: unknown,
  clientRevision: number,
): { operation: CollabOperation; conflict: boolean; resolvedValue: unknown } {
  const session = getOrCreateSession(sessionId)
  const state = session.state

  let conflict = false
  let resolvedValue = newValue

  const pendingForField = state.pendingOps.get(field)
  if (pendingForField && pendingForField.length > 0) {
    const lastOp = pendingForField[pendingForField.length - 1]
    if (lastOp.userId !== userId && lastOp.newValue !== oldValue) {
      conflict = true
      resolvedValue = lastOp.newValue
    }
  }

  state.revision++
  const operation: CollabOperation = {
    id: `${sessionId}-${state.revision}`,
    userId,
    field,
    oldValue,
    newValue: resolvedValue,
    timestamp: Date.now(),
    revision: state.revision,
  }

  state.operations.push(operation)
  if (state.operations.length > 200) {
    state.operations = state.operations.slice(-100)
  }

  if (!state.pendingOps.has(field)) {
    state.pendingOps.set(field, [])
  }
  state.pendingOps.get(field)!.push(operation)

  if (!conflict) {
    state.fields[field] = resolvedValue
  }

  session.lastActivity = Date.now()

  return { operation, conflict, resolvedValue }
}

function acknowledgeOperation(sessionId: string, field: string, operationId: string): void {
  const session = sessions.get(sessionId)
  if (!session) return
  const pending = session.state.pendingOps.get(field)
  if (!pending) return
  const idx = pending.findIndex((op) => op.id === operationId)
  if (idx !== -1) {
    pending.splice(idx, 1)
  }
}

function resolveConflict(
  sessionId: string,
  field: string,
  resolution: 'server' | 'yours' | 'theirs',
  yourValue: unknown,
  theirValue: unknown,
): unknown {
  const session = sessions.get(sessionId)
  if (!session) return yourValue

  switch (resolution) {
    case 'server':
      return theirValue
    case 'yours':
      session.state.fields[field] = yourValue
      return yourValue
    case 'theirs':
      session.state.fields[field] = theirValue
      return theirValue
    default:
      return theirValue
  }
}

function syncState(sessionId: string): { fields: Record<string, unknown>; revision: number } | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  return {
    fields: { ...session.state.fields },
    revision: session.state.revision,
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

export const CollabService = {
  getSession,
  getOrCreateSession,
  addUser,
  removeUser,
  updateUser,
  getUsers,
  applyOperation,
  acknowledgeOperation,
  resolveConflict,
  syncState,
}
