import { CollabSessionManager } from './CollabSessionManager.js'
import { CollabOTEngine } from './CollabOTEngine.js'

export const CollabService = {
  getSession: CollabSessionManager.getSession,
  getOrCreateSession: CollabSessionManager.getOrCreateSession,
  addUser: CollabSessionManager.addUser,
  removeUser: CollabSessionManager.removeUser,
  updateUser: CollabSessionManager.updateUser,
  getUsers: CollabSessionManager.getUsers,
  applyOperation: CollabOTEngine.applyOperation,
  resolveConflict: CollabOTEngine.resolveConflict,
  syncState: CollabOTEngine.syncState,
  getFieldState: CollabOTEngine.getFieldState,
}
