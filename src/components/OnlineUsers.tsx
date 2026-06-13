import { Users, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import type { CollabUser } from '@shared/types'

interface OnlineUsersProps {
  remoteUsers: CollabUser[]
  currentUser: CollabUser | null
  connected: boolean
  connecting: boolean
  onReconnect: () => void
}

export default function OnlineUsers({
  remoteUsers,
  currentUser,
  connected,
  connecting,
  onReconnect,
}: OnlineUsersProps) {
  const allUsers = currentUser ? [currentUser, ...remoteUsers] : remoteUsers
  const onlineCount = allUsers.length

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-medium text-white">
            协作编辑
          </span>
          <span className="tag-blue">{onlineCount} 人在线</span>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <div className="flex items-center gap-1 text-success-500 text-xs">
              <Wifi className="w-3.5 h-3.5" />
              已连接
            </div>
          ) : connecting ? (
            <div className="flex items-center gap-1 text-warning-500 text-xs">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              连接中
            </div>
          ) : (
            <button
              onClick={onReconnect}
              className="flex items-center gap-1 text-danger-500 text-xs hover:text-danger-400 transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" />
              已断开 (点击重连)
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {allUsers.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-dark-900/40"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
              style={{ backgroundColor: user.color || '#475569' }}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm text-dark-100 truncate">
                  {user.name}
                </span>
                {user.id === currentUser?.id && (
                  <span className="text-[10px] text-dark-500">(你)</span>
                )}
              </div>
              {user.activeField && user.id !== currentUser?.id && (
                <span className="text-[10px] text-dark-400">
                  正在编辑: {getFieldLabel(user.activeField)}
                </span>
              )}
            </div>
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: user.color || '#475569' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: '名称',
    targetUrl: '目标URL',
    shortCode: '短链标识',
    size: '尺寸',
    foreground: '前景色',
    background: '背景色',
    errorLevel: '容错级别',
    logoDataUrl: 'Logo',
  }
  return labels[field] || field
}
