import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Save, Download, RefreshCw, ArrowLeft, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import type { QrCode, UpdateQrCodeRequest } from "@shared/types";
import { useCollaboration } from "@/hooks/useCollaboration";
import OnlineUsers from "@/components/OnlineUsers";
import ConflictDialog from "@/components/ConflictDialog";
import QrCodeForm, { type FormState } from "@/components/QrCodeForm";
import QrCodePreview from "@/components/QrCodePreview";
import type { RemoteChange } from "@/types/collab";

const FIELDS: (keyof FormState)[] = ["name", "targetUrl", "size", "foreground", "background", "errorLevel", "logoDataUrl"];

export default function QrCodeEdit() {
  const { id = "" } = useParams();
  const [qr, setQr] = useState<QrCode | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<Record<string, unknown>>({});
  const lastAppliedRemoteRef = useRef<Record<string, number>>({});
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const formRef = useRef<FormState | null>(null);
  const apiDataRef = useRef<FormState | null>(null);
  const apiLoadedRef = useRef(false);
  const formInitializedRef = useRef(false);

  formRef.current = form;

  const collab = useCollaboration(id);

  const applyRemoteChange = useCallback((change: RemoteChange) => {
    const field = change.field as keyof FormState;
    if (!FIELDS.includes(field)) return;

    const lastApplied = lastAppliedRemoteRef.current[field] || 0;
    if (change.operation.revision <= lastApplied) return;
    lastAppliedRemoteRef.current[field] = change.operation.revision;

    setForm((prev) => {
      if (!prev) return prev;
      if (prev[field] === change.value) return prev;
      const updated = { ...prev, [field]: change.value };
      formRef.current = updated;
      lastSentRef.current[field] = change.value;
      return updated;
    });
  }, []);

  useEffect(() => {
    const unregister = collab.onRemoteChange((change) => {
      applyRemoteChange(change);
    });
    return unregister;
  }, [collab, applyRemoteChange]);

  useEffect(() => {
    api
      .getQrCode(id)
      .then((data) => {
        setQr(data);
        apiDataRef.current = {
          name: data.name,
          targetUrl: data.targetUrl,
          size: data.size,
          foreground: data.foreground,
          background: data.background,
          errorLevel: data.errorLevel,
          logoDataUrl: data.logoDataUrl,
        };
      })
      .catch(() => {
        const mock: QrCode = {
          id,
          name: "示例二维码-编辑",
          type: "dynamic",
          targetUrl: "https://example.com/demo",
          shortCode: "demo123",
          size: 256,
          foreground: "#0F172A",
          background: "#FFFFFF",
          errorLevel: "M",
          enabled: true,
          scanCount: 1234,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setQr(mock);
        apiDataRef.current = {
          name: mock.name,
          targetUrl: mock.targetUrl,
          size: mock.size,
          foreground: mock.foreground,
          background: mock.background,
          errorLevel: mock.errorLevel,
        };
      })
      .finally(() => {
        apiLoadedRef.current = true;
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (formInitializedRef.current) return;
    if (!apiLoadedRef.current || !apiDataRef.current) return;

    if (collab.syncReady && collab.syncedState && Object.keys(collab.syncedState).length > 0) {
      formInitializedRef.current = true;
      const baseForm = apiDataRef.current;
      const syncState = collab.syncedState;

      const merged: FormState = { ...baseForm };
      for (const key of FIELDS) {
        if (syncState[key] !== undefined) {
          (merged as unknown as Record<string, unknown>)[key] = syncState[key];
        }
      }

      setForm(merged);
      formRef.current = merged;
      for (const key of FIELDS) {
        lastSentRef.current[key] = merged[key];
      }
    } else if (collab.syncReady) {
      formInitializedRef.current = true;
      const initialForm = apiDataRef.current;
      setForm(initialForm);
      formRef.current = initialForm;
      for (const key of FIELDS) {
        lastSentRef.current[key] = initialForm[key];
      }
    }
  }, [collab.syncReady, collab.syncedState]);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      if (!f) return f;
      const updated = { ...f, [key]: value };
      formRef.current = updated;
      return updated;
    });

    const oldVal = lastSentRef.current[key];
    if (oldVal === value) return;
    lastSentRef.current[key] = value;

    const existing = debounceTimersRef.current.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      collab.sendFieldChange(key, value, oldVal);
    }, 150);
    debounceTimersRef.current.set(key, timer);
  }, [collab]);

  const handleFieldFocus = useCallback((field: string) => {
    collab.sendFieldFocus(field);
  }, [collab]);

  const handleFieldBlur = useCallback((field: string) => {
    collab.sendFieldBlur(field);
  }, [collab]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo 图片不能超过 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateField("logoDataUrl", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) {
      alert("请输入二维码名称");
      return;
    }
    if (!form.targetUrl || form.targetUrl === "https://" || form.targetUrl === "http://") {
      alert("请输入有效的目标URL");
      return;
    }
    setSaving(true);
    try {
      const payload: UpdateQrCodeRequest = {
        name: form.name,
        targetUrl: form.targetUrl,
        size: form.size,
        foreground: form.foreground,
        background: form.background,
        errorLevel: form.errorLevel,
        logoDataUrl: form.logoDataUrl,
      };
      const updated = await api.updateQrCode(id, payload);
      setQr(updated);
      alert("保存成功");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (qr) {
      const resetForm: FormState = {
        name: qr.name,
        targetUrl: qr.targetUrl,
        size: qr.size,
        foreground: qr.foreground,
        background: qr.background,
        errorLevel: qr.errorLevel,
        logoDataUrl: qr.logoDataUrl,
      };
      setForm(resetForm);
      formRef.current = resetForm;
      lastSentRef.current = {};
      lastAppliedRemoteRef.current = {};
    }
  };

  const handleResolveConflict = useCallback((field: string, resolution: 'yours' | 'theirs', yourValue: unknown) => {
    const conflict = collab.conflicts.find((c) => c.field === field);
    const theirValue = conflict?.theirValue;

    collab.resolveConflict(field, resolution, yourValue);

    const resolvedValue = resolution === 'yours' ? yourValue : theirValue;
    if (resolvedValue !== undefined && formRef.current) {
      const updated = { ...formRef.current, [field as keyof FormState]: resolvedValue as never };
      formRef.current = updated;
      setForm(updated);
      lastSentRef.current[field] = resolvedValue;
    }
  }, [collab]);

  const handleDownloadPreview = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form?.name || "qrcode"}.png`;
    a.click();
  };

  const handleServerDownload = async (format: "png" | "svg") => {
    if (!qr) return;
    try {
      const blob = await api.downloadQrCode(qr.id, format, form?.size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${qr.name}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("下载失败");
    }
  };

  const formReady = loading === false && form !== null && formInitializedRef.current;

  if (!formReady) {
    return (
      <div className="card p-12 text-center text-dark-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConflictDialog
        conflicts={collab.conflicts}
        onResolve={handleResolveConflict}
      />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link to="/qrcodes" className="btn-ghost p-2" title="返回列表">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">编辑二维码</h1>
            <p className="text-dark-400 mt-1 text-sm">
              短码：<span className="text-brand-400 font-mono">/{qr?.shortCode}</span>
              {qr?.type === "static" && <span className="tag-gray ml-2">静态码</span>}
              {qr?.type === "dynamic" && <span className="tag-blue ml-2">动态码</span>}
              {collab.remoteUsers.length > 0 && (
                <span className="tag-green ml-2">{collab.remoteUsers.length + 1} 人协作中</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/qrcodes/${id}/stats`} className="btn-secondary">
            <BarChart3 className="w-4 h-4" />
            查看统计
          </Link>
          <button type="button" onClick={handleReset} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            还原
          </button>
          <button type="submit" form="qr-form" className="btn-primary" disabled={saving}>
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "保存中..." : "保存修改"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <QrCodeForm
          form={form}
          qrType={qr?.type}
          remoteUsers={collab.remoteUsers}
          onUpdateField={updateField}
          onFieldFocus={handleFieldFocus}
          onFieldBlur={handleFieldBlur}
          onLogoUpload={handleLogoUpload}
          fileInputRef={fileInputRef}
        />

        <div className="lg:col-span-2 space-y-5">
          <OnlineUsers
            remoteUsers={collab.remoteUsers}
            currentUser={collab.user}
            connected={collab.connected}
            connecting={collab.connecting}
            onReconnect={collab.reconnect}
          />

          <QrCodePreview
            form={form}
            qr={qr}
            qrRef={qrRef}
            onDownloadPreview={handleDownloadPreview}
            onServerDownload={handleServerDownload}
          />
        </div>
      </div>

      <form id="qr-form" onSubmit={handleSubmit} className="hidden" />
    </div>
  );
}
