import type { CollabUser } from '@shared/types'

const FIELD_LABELS: Record<string, string> = {
  name: '名称',
  targetUrl: '目标URL',
  shortCode: '短链标识',
  size: '尺寸',
  foreground: '前景色',
  background: '背景色',
  errorLevel: '容错级别',
  logoDataUrl: 'Logo',
}

export default function CollabCursors({ remoteUsers }: { remoteUsers: CollabUser[] }) {
  const activeUsers = remoteUsers.filter((u) => u.activeField)

  if (activeUsers.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {activeUsers.map((user) => (
        <FieldIndicator key={user.id} user={user} />
      ))}
    </div>
  )
}

function FieldIndicator({ user }: { user: CollabUser }) {
  if (!user.activeField) return null
  return (
    <style>{`
      [data-collab-field="${user.activeField}"] {
        position: relative;
      }
      [data-collab-field="${user.activeField}"]::after {
        content: '';
        position: absolute;
        inset: -2px;
        border: 2px solid ${user.color};
        border-radius: 8px;
        pointer-events: none;
        opacity: 0.6;
        animation: collab-pulse 2s ease-in-out infinite;
      }
    `}</style>
  )
}

export function FieldBadge({ user }: { user: CollabUser }) {
  if (!user.activeField) return null
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white ml-1"
      style={{ backgroundColor: user.color }}
    >
      {user.name} {FIELD_LABELS[user.activeField] ? `正在编辑${FIELD_LABELS[user.activeField]}` : ''}
    </span>
  )
}

export function CollabFieldIndicator({ users, field }: { users: CollabUser[]; field: string }) {
  const fieldUsers = users.filter((u) => u.activeField === field)
  if (fieldUsers.length === 0) return null

  return (
    <div className="flex items-center gap-1 mt-1">
      {fieldUsers.map((u) => (
        <span
          key={u.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
          style={{ backgroundColor: u.color }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"
          />
          {u.name}
        </span>
      ))}
    </div>
  )
}
