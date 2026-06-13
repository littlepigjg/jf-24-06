import app from './app.js'
import { initWebSocket } from './websocket.js'

const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
})

initWebSocket(server)
console.log('WebSocket server initialized on /ws/collab')

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
