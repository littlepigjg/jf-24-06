import { AlertTriangle, Check, X } from 'lucide-react'
import type { ConflictInfo } from '@/hooks/useCollaboration'

interface ConflictDialogProps {
  conflicts: ConflictInfo[]
  onResolve: (field: string, resolution: 'yours' | 'theirs', yourValue: unknown) => void
}

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

export default function ConflictDialog({ conflicts, onResolve }: ConflictDialogProps) {
  if (conflicts.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-warning-500" />
          <h3 className="text-lg font-semibold text-white">编辑冲突</h3>
        </div>
        <p className="text-sm text-dark-300 mb-4">
          其他用户同时修改了以下字段，请选择保留哪个版本：
        </p>

        <div className="space-y-4">
          {conflicts.map((conflict) => (
            <div key={conflict.field} className="bg-dark-900/60 rounded-lg p-4 space-y-3">
              <div className="text-sm font-medium text-brand-400">
                {FIELD_LABELS[conflict.field] || conflict.field}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onResolve(conflict.field, 'yours', conflict.yourValue)}
                  className="p-3 rounded-lg border-2 border-dark-600 hover:border-brand-500 text-left transition-colors group"
                >
                  <div className="flex items-center gap-1 text-xs text-dark-400 mb-1">
                    <span className="w-2 h-2 rounded-full bg-brand-500" />
                    你的版本
                  </div>
                  <div className="text-sm text-dark-100 truncate group-hover:text-white">
                    {formatValue(conflict.yourValue)}
                  </div>
                  <Check className="w-4 h-4 text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </button>

                <button
                  onClick={() => onResolve(conflict.field, 'theirs', conflict.yourValue)}
                  className="p-3 rounded-lg border-2 border-dark-600 hover:border-warning-500 text-left transition-colors group"
                >
                  <div className="flex items-center gap-1 text-xs text-dark-400 mb-1">
                    <span className="w-2 h-2 rounded-full bg-warning-500" />
                    对方版本
                  </div>
                  <div className="text-sm text-dark-100 truncate group-hover:text-white">
                    {formatValue(conflict.theirValue)}
                  </div>
                  <Check className="w-4 h-4 text-warning-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              conflicts.forEach((c) => onResolve(c.field, 'theirs', c.yourValue))
            }}
            className="btn-secondary text-sm"
          >
            <X className="w-4 h-4" />
            全部采用对方版本
          </button>
        </div>
      </div>
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '(空)'
  if (typeof value === 'string') return value.length > 30 ? value.slice(0, 30) + '...' : value
  return String(value)
}
