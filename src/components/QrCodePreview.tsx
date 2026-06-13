import { Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import type { QrCode } from "@shared/types";

interface QrCodePreviewProps {
  form: {
    name: string;
    targetUrl: string;
    size: number;
    foreground: string;
    background: string;
    errorLevel: string;
    logoDataUrl?: string;
  };
  qr: QrCode | null;
  qrRef: React.RefObject<HTMLDivElement | null>;
  onDownloadPreview: () => void;
  onServerDownload: (format: "png" | "svg") => void;
}

export default function QrCodePreview({
  form,
  qr,
  qrRef,
  onDownloadPreview,
  onServerDownload,
}: QrCodePreviewProps) {
  const previewValue = form.targetUrl && form.targetUrl.length > 8 ? form.targetUrl : "https://example.com";
  const qrSize = Math.min(form.size, 360);
  const effectiveErrorLevel = form.logoDataUrl
    ? form.errorLevel === "L" || form.errorLevel === "M" ? "H" : form.errorLevel
    : form.errorLevel;

  return (
    <div className="card p-6 sticky top-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white">实时预览</h3>
        <div className="flex gap-1">
          <button type="button" onClick={onDownloadPreview} className="btn-secondary text-sm px-3 py-1.5">
            <Download className="w-4 h-4" />
            PNG
          </button>
          <button type="button" onClick={() => onServerDownload("svg")} className="btn-secondary text-sm px-3 py-1.5">
            <Download className="w-4 h-4" />
            SVG
          </button>
        </div>
      </div>

      <div
        ref={qrRef}
        className="relative w-full aspect-square rounded-xl p-6 flex items-center justify-center dot-pattern border border-dark-700"
        style={{ background: form.background }}
      >
        <QRCodeCanvas
          value={previewValue}
          size={qrSize}
          bgColor={form.background}
          fgColor={form.foreground}
          level={effectiveErrorLevel as "L" | "M" | "Q" | "H"}
          imageSettings={
            form.logoDataUrl
              ? {
                  src: form.logoDataUrl,
                  height: Math.round(qrSize * 0.2),
                  width: Math.round(qrSize * 0.2),
                  excavate: true,
                }
              : undefined
          }
        />
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between py-2 border-b border-dark-700">
          <span className="text-dark-400">扫码次数</span>
          <span className="text-brand-400 font-semibold">{qr?.scanCount.toLocaleString() || 0}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-dark-700">
          <span className="text-dark-400">尺寸</span>
          <span className="text-white">{form.size}px</span>
        </div>
        <div className="flex justify-between py-2 border-b border-dark-700">
          <span className="text-dark-400">容错</span>
          <span className="text-white">Level {form.errorLevel}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-dark-400">状态</span>
          <span>{qr?.enabled ? <span className="tag-green">已启用</span> : <span className="tag-red">已停用</span>}</span>
        </div>
      </div>
    </div>
  );
}
