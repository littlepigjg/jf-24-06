import type { CollabUser, CollabOperation } from '@shared/types'

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

export interface CollabState {
  connected: boolean
  connecting: boolean
  userId: string
  user: CollabUser | null
  remoteUsers: CollabUser[]
  syncedFields: Record<string, unknown> | null
  revision: number
  syncReady: boolean
}

export type CollabMessageHandler = (msg: unknown) => void
