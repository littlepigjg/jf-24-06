import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { SessionStore } from './SessionStore.js'
import type { CollabMessage, CollabUser } from '../../shared/types.js'

interface ClientInfo {
  userId: string
  sessionId: string
  ws: WebSocket
}

const clients = new Map<WebSocket, ClientInfo>()

function broadcast(sessionId: string, message: CollabMessage, excludeWs?: WebSocket): void {
  const payload = JSON.stringify(message)
  for (const [ws, info] of clients.entries()) {
    if (info.sessionId === sessionId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}

function broadcastAll(sessionId: string, message: CollabMessage): void {
  const payload = JSON.stringify(message)
  for (const [ws, info] of clients.entries()) {
    if (info.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}

function send(ws: WebSocket, message: CollabMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function handleJoin(ws: WebSocket, msg: CollabMessage): void {
  const sessionId = msg.sessionId
  const userId = msg.userId || `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const userName = msg.user?.name || `用户${userId.slice(-4)}`

  const user: CollabUser = { id: userId, name: userName, color: '' }
  const savedUser = SessionStore.addUser(sessionId, user)

  clients.set(ws, { userId, sessionId, ws })

  const sync = SessionStore.syncState(sessionId)
  send(ws, {
    type: 'sync_state',
    sessionId,
    userId,
    user: savedUser,
    state: sync?.fields || {},
    revision: sync?.revision || 0,
    timestamp: Date.now(),
  })

  const users = SessionStore.getUsers(sessionId)
  broadcast(sessionId, { type: 'user_list', sessionId, users, timestamp: Date.now() })
  broadcast(sessionId, { type: 'join', sessionId, userId, user: savedUser, timestamp: Date.now() }, ws)
}

function handleLeave(ws: WebSocket, client: ClientInfo): void {
  const { sessionId, userId } = client
  const hasMore = SessionStore.removeUser(sessionId, userId)
  clients.delete(ws)
  if (hasMore) {
    const users = SessionStore.getUsers(sessionId)
    broadcast(sessionId, { type: 'leave', sessionId, userId, users, timestamp: Date.now() })
  }
}

function handleFieldChange(ws: WebSocket, client: ClientInfo, msg: CollabMessage): void {
  const field = msg.field || ''
  const result = SessionStore.applyOperation(
    client.sessionId, client.userId, field, msg.value, msg.oldValue,
  )

  if (result.conflict) {
    send(ws, {
      type: 'conflict',
      sessionId: client.sessionId,
      userId: client.userId,
      field,
      value: result.yourValue,
      oldValue: result.serverValue,
      conflictField: field,
      operation: result.operation,
      revision: result.operation.revision,
      timestamp: Date.now(),
    })

    broadcast(client.sessionId, {
      type: 'field_change',
      sessionId: client.sessionId,
      userId: client.userId,
      field,
      value: result.resolvedValue,
      oldValue: result.operation.oldValue,
      operation: result.operation,
      revision: result.operation.revision,
      timestamp: Date.now(),
    }, ws)
  } else {
    broadcastAll(client.sessionId, {
      type: 'field_change',
      sessionId: client.sessionId,
      userId: client.userId,
      field,
      value: result.resolvedValue,
      oldValue: result.operation.oldValue,
      operation: result.operation,
      revision: result.operation.revision,
      timestamp: Date.now(),
    })
  }
}

function handleConflictResolve(ws: WebSocket, client: ClientInfo, msg: CollabMessage): void {
  const field = msg.conflictField || msg.field || ''
  const resolution = msg.conflictResolution === 'yours' ? 'yours' : 'theirs' as 'yours' | 'theirs'

  const result = SessionStore.resolveConflict(
    client.sessionId, client.userId, field, resolution, msg.value, msg.oldValue,
  )

  broadcastAll(client.sessionId, {
    type: 'field_change',
    sessionId: client.sessionId,
    userId: client.userId,
    field,
    value: result.resolvedValue,
    oldValue: result.operation.oldValue,
    operation: result.operation,
    revision: result.operation.revision,
    timestamp: Date.now(),
  })
}

function handleMessage(ws: WebSocket, raw: string): void {
  let msg: CollabMessage
  try {
    msg = JSON.parse(raw) as CollabMessage
  } catch {
    return
  }

  const client = clients.get(ws)
  if (!client && msg.type !== 'join') return

  switch (msg.type) {
    case 'join':
      handleJoin(ws, msg)
      break
    case 'leave':
      if (client) handleLeave(ws, client)
      break
    case 'cursor':
      if (client) {
        SessionStore.updateUser(client.sessionId, client.userId, { cursorPosition: msg.value as number })
        broadcast(client.sessionId, {
          type: 'cursor', sessionId: client.sessionId, userId: client.userId,
          field: msg.field, value: msg.value, timestamp: Date.now(),
        }, ws)
      }
      break
    case 'field_focus':
      if (client) {
        SessionStore.updateUser(client.sessionId, client.userId, { activeField: msg.field })
        broadcast(client.sessionId, {
          type: 'field_focus', sessionId: client.sessionId, userId: client.userId,
          field: msg.field, timestamp: Date.now(),
        }, ws)
      }
      break
    case 'field_blur':
      if (client) {
        SessionStore.updateUser(client.sessionId, client.userId, { activeField: undefined, cursorPosition: undefined })
        broadcast(client.sessionId, {
          type: 'field_blur', sessionId: client.sessionId, userId: client.userId,
          field: msg.field, timestamp: Date.now(),
        }, ws)
      }
      break
    case 'field_change':
      if (client) handleFieldChange(ws, client, msg)
      break
    case 'conflict':
      if (client) handleConflictResolve(ws, client, msg)
      break
    case 'pong':
      if (client) send(ws, { type: 'pong', sessionId: client.sessionId, timestamp: Date.now() })
      break
  }
}

function handleDisconnect(ws: WebSocket): void {
  const client = clients.get(ws)
  if (client) handleLeave(ws, client)
}

export function initCollabWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/collab' })

  wss.on('connection', (ws) => {
    ws.on('message', (data) => handleMessage(ws, data.toString()))
    ws.on('close', () => handleDisconnect(ws))
    ws.on('error', () => handleDisconnect(ws))
  })

  const heartbeat = setInterval(() => {
    for (const [ws] of clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) ws.ping()
    }
  }, 30000)

  wss.on('close', () => clearInterval(heartbeat))

  return wss
}
