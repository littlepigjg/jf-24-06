import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { CollabService } from './services/CollabService.js'
import type { CollabMessage, CollabUser } from '../shared/types.js'

interface ClientInfo {
  userId: string
  sessionId: string
  ws: WebSocket
}

const clients = new Map<WebSocket, ClientInfo>()

function broadcastToSession(sessionId: string, message: CollabMessage, excludeWs?: WebSocket): void {
  const payload = JSON.stringify(message)
  for (const [ws, info] of clients.entries()) {
    if (info.sessionId === sessionId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}

function sendToClient(ws: WebSocket, message: CollabMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
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
    case 'join': {
      const sessionId = msg.sessionId
      const userId = msg.userId || `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const userName = (msg.user?.name) || `用户${userId.slice(-4)}`

      const user: CollabUser = {
        id: userId,
        name: userName,
        color: '',
      }

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
      broadcastToSession(sessionId, {
        type: 'user_list',
        sessionId,
        users,
        timestamp: Date.now(),
      })

      broadcastToSession(sessionId, {
        type: 'join',
        sessionId,
        userId,
        user: savedUser,
        timestamp: Date.now(),
      }, ws)
      break
    }

    case 'leave': {
      if (!client) return
      const sessionId = client.sessionId
      const userId = client.userId
      const session = CollabService.removeUser(sessionId, userId)
      clients.delete(ws)

      if (session) {
        const users = CollabService.getUsers(sessionId)
        broadcastToSession(sessionId, {
          type: 'leave',
          sessionId,
          userId,
          users,
          timestamp: Date.now(),
        })
      }
      break
    }

    case 'cursor': {
      if (!client) return
      CollabService.updateUser(client.sessionId, client.userId, {
        cursorPosition: msg.value as number,
      })
      broadcastToSession(client.sessionId, {
        type: 'cursor',
        sessionId: client.sessionId,
        userId: client.userId,
        field: msg.field,
        value: msg.value,
        timestamp: Date.now(),
      }, ws)
      break
    }

    case 'field_focus': {
      if (!client) return
      CollabService.updateUser(client.sessionId, client.userId, {
        activeField: msg.field,
      })
      broadcastToSession(client.sessionId, {
        type: 'field_focus',
        sessionId: client.sessionId,
        userId: client.userId,
        field: msg.field,
        timestamp: Date.now(),
      }, ws)
      break
    }

    case 'field_blur': {
      if (!client) return
      CollabService.updateUser(client.sessionId, client.userId, {
        activeField: undefined,
        cursorPosition: undefined,
      })
      broadcastToSession(client.sessionId, {
        type: 'field_blur',
        sessionId: client.sessionId,
        userId: client.userId,
        field: msg.field,
        timestamp: Date.now(),
      }, ws)
      break
    }

    case 'field_change': {
      if (!client) return
      const result = CollabService.applyOperation(
        client.sessionId,
        client.userId,
        msg.field || '',
        msg.value,
        msg.oldValue,
        msg.revision || 0,
      )

      sendToClient(ws, {
        type: 'field_change_ack',
        sessionId: client.sessionId,
        userId: client.userId,
        operation: result.operation,
        revision: result.operation.revision,
        timestamp: Date.now(),
      })

      broadcastToSession(client.sessionId, {
        type: 'field_change',
        sessionId: client.sessionId,
        userId: client.userId,
        field: msg.field,
        value: result.operation.newValue,
        oldValue: msg.oldValue,
        operation: result.operation,
        timestamp: Date.now(),
      }, ws)

      if (result.conflict) {
        sendToClient(ws, {
          type: 'conflict',
          sessionId: client.sessionId,
          userId: client.userId,
          field: msg.field,
          value: msg.value,
          conflictField: msg.field,
          conflictResolution: 'theirs',
          timestamp: Date.now(),
        })
      }
      break
    }

    case 'field_change_ack': {
      if (!client) return
      CollabService.acknowledgeOperation(
        client.sessionId,
        msg.field || '',
        msg.operation?.id || '',
      )
      break
    }

    case 'conflict': {
      if (!client) return
      const resolved = CollabService.resolveConflict(
        client.sessionId,
        msg.conflictField || msg.field || '',
        msg.conflictResolution || 'server',
        msg.value,
        msg.oldValue,
      )
      broadcastToSession(client.sessionId, {
        type: 'field_change',
        sessionId: client.sessionId,
        userId: client.userId,
        field: msg.conflictField || msg.field,
        value: resolved,
        timestamp: Date.now(),
      })
      break
    }

    case 'pong': {
      if (!client) return
      sendToClient(ws, { type: 'pong', sessionId: client.sessionId, timestamp: Date.now() })
      break
    }
  }
}

function handleDisconnect(ws: WebSocket): void {
  const client = clients.get(ws)
  if (!client) return

  const sessionId = client.sessionId
  const userId = client.userId
  const session = CollabService.removeUser(sessionId, userId)
  clients.delete(ws)

  if (session) {
    const users = CollabService.getUsers(sessionId)
    broadcastToSession(sessionId, {
      type: 'leave',
      sessionId,
      userId,
      users,
      timestamp: Date.now(),
    })
  }
}

export function initWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/collab' })

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      handleMessage(ws, data.toString())
    })

    ws.on('close', () => {
      handleDisconnect(ws)
    })

    ws.on('error', () => {
      handleDisconnect(ws)
    })
  })

  const heartbeat = setInterval(() => {
    for (const [ws] of clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping()
      }
    }
  }, 30000)

  wss.on('close', () => {
    clearInterval(heartbeat)
  })

  return wss
}
