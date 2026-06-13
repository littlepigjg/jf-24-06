import type { CollabUser } from '../../shared/types.js'
import { COLLAB_COLORS } from '../../shared/types.js'

export interface Session {
  id: string
  users: Map<string, CollabUser>
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

function cleanupStaleSessions(maxAgeMs: number = 30 * 60 * 1000): void {
  const now = Date.now()
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > maxAgeMs && session.users.size === 0) {
      sessions.delete(id)
    }
  }
}

setInterval(() => cleanupStaleSessions(), 5 * 60 * 1000)

export const CollabSessionManager = {
  getSession,
  getOrCreateSession,
  addUser,
  removeUser,
  updateUser,
  getUsers,
}
