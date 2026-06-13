import type { CollabOperation, CollabUser } from '@shared/types'

export interface RemoteChange {
  field: string
  value: unknown
  userId: string
  operation: CollabOperation
}

export interface ConflictInfo {
  field: string
  yourValue: unknown
  theirValue: unknown
  operation: CollabOperation
}

export interface CollaborationState {
  connected: boolean
  connecting: boolean
  userId: string
  user: CollabUser | null
  remoteUsers: CollabUser[]
  remoteChanges: RemoteChange[]
  conflicts: ConflictInfo[]
  syncedState: Record<string, unknown> | null
  revision: number
}

export interface CollabConnectionOptions {
  sessionId: string | undefined
  userId: string
  onMessage?: (msg: any) => void
  onConnect?: () => void
  onDisconnect?: () => void
}
