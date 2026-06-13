import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { handleMessage, handleDisconnect, clients } from './websocketHandlers.js'

export function initWebSocket(server: Server): WebSocketServer {
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
