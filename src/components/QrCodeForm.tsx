import { Upload, X, Palette, Link2, Hash, Maximize2 } from "lucide-react";
import type { ErrorLevel } from "@shared/types";
import type { CollabUser } from "@shared/types";
import { CollabFieldIndicator } from "@/components/CollabCursors";

interface FormState {
  name: string;
  targetUrl: string;
  size: number;
  foreground: string;
  background: string;
  errorLevel: ErrorLevel;
  logoDataUrl?: string;
}

export type { FormState };

const sizeOptions = [128, 192, 256, 384, 512];
const errorLevelOptions: { value: ErrorLevel; label: string }[] = [
  { value: "L", label: "低 L (~7%)" },
  { value: "M", label: "中 M (~15%)" },
  { value: "Q", label: "较高 Q (~25%)" },
  { value: "H", label: "高 H (~30%)" },
];

interface QrCodeFormProps {
  form: FormState;
  qrType?: string;
  remoteUsers: CollabUser[];
  onUpdateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onFieldFocus: (field: string) => void;
  onFieldBlur: (field: string) => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function QrCodeForm({
  form,
  qrType,
  remoteUsers,
  onUpdateField,
  onFieldFocus,
  onFieldBlur,
  onLogoUpload,
  fileInputRef,
}: QrCodeFormProps) {
  return (
    <form id="qr-form" className="lg:col-span-3 space-y-5">
      <div className="card p-5 space-y-5">
        <div className="grid grid-cols-1 gap-4">
          <div data-collab-field="name">
            <label className="label">
              <Hash className="w-3.5 h-3.5 inline mr-1" />
              二维码名称 *
            </label>
            <input
              type="text"
              className="input"
              placeholder="例如：活动海报-2024春季"
              value={form.name}
              onChange={(e) => onUpdateField("name", e.target.value)}
              onFocus={() => onFieldFocus("name")}
              onBlur={() => onFieldBlur("name")}
            />
            <CollabFieldIndicator users={remoteUsers} field="name" />
          </div>

          <div data-collab-field="targetUrl">
            <label className="label">
              <Link2 className="w-3.5 h-3.5 inline mr-1" />
              目标URL *
            </label>
            <input
              type="url"
              className="input"
              placeholder="https://example.com/your-page"
              value={form.targetUrl}
              onChange={(e) => onUpdateField("targetUrl", e.target.value)}
              onFocus={() => onFieldFocus("targetUrl")}
              onBlur={() => onFieldBlur("targetUrl")}
            />
            {qrType === "static" && (
              <p className="text-xs text-warning-500 mt-1">
                ⚠ 静态码已生成，修改目标URL后旧码将失效
              </p>
            )}
            <CollabFieldIndicator users={remoteUsers} field="targetUrl" />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-5">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Palette className="w-4 h-4 text-brand-400" />
          样式配置
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div data-collab-field="size">
            <label className="label">
              <Maximize2 className="w-3.5 h-3.5 inline mr-1" />
              尺寸
            </label>
            <div className="flex flex-wrap gap-2">
              {sizeOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdateField("size", s)}
                  onFocus={() => onFieldFocus("size")}
                  onBlur={() => onFieldBlur("size")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    form.size === s
                      ? "bg-brand-gradient text-white shadow-glow-sm"
                      : "bg-dark-700 text-dark-300 hover:bg-dark-600"
                  }`}
                >
                  {s}px
                </button>
              ))}
            </div>
            <CollabFieldIndicator users={remoteUsers} field="size" />
          </div>

          <div data-collab-field="errorLevel">
            <label className="label">容错级别</label>
            <select
              className="input"
              value={form.errorLevel}
              onChange={(e) => onUpdateField("errorLevel", e.target.value as ErrorLevel)}
              onFocus={() => onFieldFocus("errorLevel")}
              onBlur={() => onFieldBlur("errorLevel")}
            >
              {errorLevelOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <CollabFieldIndicator users={remoteUsers} field="errorLevel" />
          </div>

          <div data-collab-field="foreground">
            <label className="label">前景色</label>
            <div className="flex gap-2">
              <input
                type="color"
                className="w-12 h-10 rounded-lg bg-dark-700 border border-dark-600 cursor-pointer p-1"
                value={form.foreground}
                onChange={(e) => onUpdateField("foreground", e.target.value)}
                onFocus={() => onFieldFocus("foreground")}
                onBlur={() => onFieldBlur("foreground")}
              />
              <input
                type="text"
                className="input flex-1 font-mono text-sm"
                value={form.foreground}
                onChange={(e) => onUpdateField("foreground", e.target.value)}
                onFocus={() => onFieldFocus("foreground")}
                onBlur={() => onFieldBlur("foreground")}
              />
            </div>
            <CollabFieldIndicator users={remoteUsers} field="foreground" />
          </div>

          <div data-collab-field="background">
            <label className="label">背景色</label>
            <div className="flex gap-2">
              <input
                type="color"
                className="w-12 h-10 rounded-lg bg-dark-700 border border-dark-600 cursor-pointer p-1"
                value={form.background}
                onChange={(e) => onUpdateField("background", e.target.value)}
                onFocus={() => onFieldFocus("background")}
                onBlur={() => onFieldBlur("background")}
              />
              <input
                type="text"
                className="input flex-1 font-mono text-sm"
                value={form.background}
                onChange={(e) => onUpdateField("background", e.target.value)}
                onFocus={() => onFieldFocus("background")}
                onBlur={() => onFieldBlur("background")}
              />
            </div>
            <CollabFieldIndicator users={remoteUsers} field="background" />
          </div>

          <div className="md:col-span-2" data-collab-field="logoDataUrl">
            <label className="label">中心 Logo （可选，建议2MB以内）</label>
            <div className="flex items-start gap-3 flex-wrap">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                <Upload className="w-4 h-4" />
                上传 Logo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onLogoUpload}
                className="hidden"
              />
              {form.logoDataUrl && (
                <div className="relative group">
                  <img
                    src={form.logoDataUrl}
                    alt="logo preview"
                    className="w-16 h-16 rounded-lg object-contain bg-white border border-dark-600 p-1"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateField("logoDataUrl", undefined)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-dark-500 pt-2">
                建议使用正方形 PNG，容错级别建议选 Q 或 H
              </p>
            </div>
            <CollabFieldIndicator users={remoteUsers} field="logoDataUrl" />
          </div>
        </div>
      </div>
    </form>
  );
}
