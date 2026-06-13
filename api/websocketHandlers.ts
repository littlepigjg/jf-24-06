import { WebSocket } from 'ws'
import { CollabService } from './services/CollabService.js'
import type { CollabMessage, CollabUser } from '../shared/types.js'

export interface ClientInfo {
  userId: string
  sessionId: string
  ws: WebSocket
}

export const clients = new Map<WebSocket, ClientInfo>()

export function broadcastToSession(sessionId: string, message: CollabMessage, excludeWs?: WebSocket): void {
  const payload = JSON.stringify(message)
  for (const [ws, info] of clients.entries()) {
    if (info.sessionId === sessionId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}

export function broadcastToSessionAll(sessionId: string, message: CollabMessage): void {
  const payload = JSON.stringify(message)
  for (const [ws, info] of clients.entries()) {
    if (info.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}

export function sendToClient(ws: WebSocket, message: CollabMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

export function handleJoin(ws: WebSocket, msg: CollabMessage): void {
  const sessionId = msg.sessionId
  const userId = msg.userId || `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const userName = msg.user?.name || `用户${userId.slice(-4)}`

  const user: CollabUser = { id: userId, name: userName, color: '' }
  const session = CollabService.addUser(sessionId, user)
  const savedUser = session.users.get(userId)!

  clients.set(ws, { userId, sessionId, ws })

  const syncState = CollabService.syncState(sessionId)
  sendToClient(ws, {
    type: 'sync_state',
    sessionId,
    userId,
    user: savedUser,
    state: syncState?.fields || {},
    revision: syncState?.revision || 0,
    timestamp: Date.now(),
  })

  const users = CollabService.getUsers(sessionId)
  broadcastToSession(sessionId, { type: 'user_list', sessionId, users, timestamp: Date.now() })
  broadcastToSession(sessionId, { type: 'join', sessionId, userId, user: savedUser, timestamp: Date.now() }, ws)
}

export function handleLeave(ws: WebSocket, client: ClientInfo): void {
  const { sessionId, userId } = client
  const session = CollabService.removeUser(sessionId, userId)
  clients.delete(ws)

  if (session) {
    const users = CollabService.getUsers(sessionId)
    broadcastToSession(sessionId, { type: 'leave', sessionId, userId, users, timestamp: Date.now() })
  }
}

export function handleCursor(ws: WebSocket, client: ClientInfo, msg: CollabMessage): void {
  CollabService.updateUser(client.sessionId, client.userId, { cursorPosition: msg.value as number })
  broadcastToSession(client.sessionId, {
    type: 'cursor', sessionId: client.sessionId, userId: client.userId,
    field: msg.field, value: msg.value, timestamp: Date.now(),
  }, ws)
}

export function handleFieldFocus(ws: WebSocket, client: ClientInfo, msg: CollabMessage): void {
  CollabService.updateUser(client.sessionId, client.userId, { activeField: msg.field })
  broadcastToSession(client.sessionId, {
    type: 'field_focus', sessionId: client.sessionId, userId: client.userId,
    field: msg.field, timestamp: Date.now(),
  }, ws)
}

export function handleFieldBlur(ws: WebSocket, client: ClientInfo, msg: CollabMessage): void {
  CollabService.updateUser(client.sessionId, client.userId, { activeField: undefined, cursorPosition: undefined })
  broadcastToSession(client.sessionId, {
    type: 'field_blur', sessionId: client.sessionId, userId: client.userId,
    field: msg.field, timestamp: Date.now(),
  }, ws)
}

export function handleFieldChange(ws: WebSocket, client: ClientInfo, msg: CollabMessage): void {
  const field = msg.field || ''
  const result = CollabService.applyOperation(
    client.sessionId, client.userId, field, msg.value, msg.oldValue,
  )

  if (result.conflict) {
    sendToClient(ws, {
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

    broadcastToSession(client.sessionId, {
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
    sendToClient(ws, {
      type: 'field_change_ack',
      sessionId: client.sessionId,
      userId: client.userId,
      field,
      value: result.resolvedValue,
      operation: result.operation,
      revision: result.operation.revision,
      timestamp: Date.now(),
    })

    broadcastToSession(client.sessionId, {
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
  }
}

export function handleConflictResolution(ws: WebSocket, client: ClientInfo, msg: CollabMessage): void {
  const field = msg.conflictField || msg.field || ''
  const resolution = msg.conflictResolution === 'yours' ? 'yours' : 'theirs' as 'yours' | 'theirs'
  const yourValue = msg.value
  const serverValue = msg.oldValue

  const result = CollabService.resolveConflict(
    client.sessionId, client.userId, field, resolution, yourValue, serverValue,
  )

  broadcastToSessionAll(client.sessionId, {
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

export function handleMessage(ws: WebSocket, raw: string): void {
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
      if (client) handleCursor(ws, client, msg)
      break
    case 'field_focus':
      if (client) handleFieldFocus(ws, client, msg)
      break
    case 'field_blur':
      if (client) handleFieldBlur(ws, client, msg)
      break
    case 'field_change':
      if (client) handleFieldChange(ws, client, msg)
      break
    case 'conflict':
      if (client) handleConflictResolution(ws, client, msg)
      break
    case 'pong':
      if (client) sendToClient(ws, { type: 'pong', sessionId: client.sessionId, timestamp: Date.now() })
      break
  }
}

export function handleDisconnect(ws: WebSocket): void {
  const client = clients.get(ws)
  if (!client) return
  handleLeave(ws, client)
}
