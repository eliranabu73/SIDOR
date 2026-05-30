"use client";

import * as React from "react";
import {
  Download,
  FileImage,
  FileText,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  exportAuthHeaders,
  getScheduleExportUrl,
  getSchedulePosterLink,
  type ScheduleExportFormat,
  type ScheduleExportStyle,
} from "@/lib/api";
import {
  canNativeShareFiles,
  shareScheduleImage,
} from "@/lib/whatsapp-share";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string | null;
  weekStart: string; // YYYY-MM-DD
};

const STYLES: Array<{
  id: ScheduleExportStyle;
  label: string;
  description: string;
  preview: React.ReactNode;
}> = [
  {
    id: "minimal",
    label: "מינימלי",
    description: "לבן, נקי, מוכן להדפסה",
    preview: (
      <MiniPreview
        bg="#ffffff"
        header="#f1f5f9"
        text="#0f172a"
        accent="#0f172a"
        cardBorder="#e5e7eb"
      />
    ),
  },
  {
    id: "branded",
    label: "ממותג",
    description: "כותרת ססגונית, סגנון סידור4S",
    preview: (
      <MiniPreview
        bg="#f8fafc"
        header="linear-gradient(90deg,#4f46e5,#06b6d4)"
        text="#0f172a"
        accent="#4f46e5"
        cardBorder="#c7d2fe"
        headerText="#fff"
      />
    ),
  },
  {
    id: "dark",
    label: "כהה",
    description: "רקע כהה, מבטא ציאן",
    preview: (
      <MiniPreview
        bg="#020617"
        header="#0f172a"
        text="#f1f5f9"
        accent="#22d3ee"
        cardBorder="#1e293b"
        headerText="#f8fafc"
      />
    ),
  },
];

function MiniPreview({
  bg,
  header,
  text,
  accent,
  cardBorder,
  headerText,
}: {
  bg: string;
  header: string;
  text: string;
  accent: string;
  cardBorder: string;
  headerText?: string;
}) {
  return (
    <div
      className="w-full aspect-[16/9] rounded-md overflow-hidden border"
      style={{ background: bg, borderColor: cardBorder, color: text }}
    >
      <div
        className="h-1/4 w-full flex items-center px-2"
        style={{ background: header, color: headerText ?? text }}
      >
        <div className="text-[8px] font-bold">סידור4S</div>
      </div>
      <div className="flex flex-row gap-1 p-1 h-3/4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm flex flex-col gap-[2px] p-[2px]"
            style={{ border: `1px solid ${cardBorder}` }}
          >
            <div
              className="h-1 rounded-[1px]"
              style={{ background: accent, opacity: 0.85 }}
            />
            <div
              className="h-1 rounded-[1px]"
              style={{ background: cardBorder }}
            />
            <div
              className="h-1 rounded-[1px]"
              style={{ background: cardBorder, opacity: 0.6 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  scheduleId,
  weekStart,
}: Props) {
  const [format, setFormat] = React.useState<ScheduleExportFormat>("png");
  const [style, setStyle] = React.useState<ScheduleExportStyle>("branded");
  const [busy, setBusy] = React.useState(false);
  const [managerPhone, setManagerPhone] = React.useState("");
  const nativeShareReady = React.useMemo(
    () => (typeof window === "undefined" ? false : canNativeShareFiles()),
    [],
  );

  const handleNativeShare = React.useCallback(async () => {
    if (!scheduleId) return;
    setBusy(true);
    try {
      const res = await shareScheduleImage({ scheduleId, style, weekStart });
      if (res.method === "native_share" && res.ok) {
        toast.success("התמונה נשלחה לבחירת קבוצה/איש קשר");
      } else if (res.error === "cancelled") {
        toast.message("השיתוף בוטל");
      } else if (res.method === "download_fallback") {
        toast.success("התמונה ירדה — צרפו אותה ידנית בצ׳אט שנפתח");
      } else if (!res.ok) {
        toast.error("השיתוף נכשל");
      }
    } finally {
      setBusy(false);
    }
  }, [scheduleId, style, weekStart]);

  const handleShareViaUrl = React.useCallback(
    async (toPhone?: string) => {
      if (!scheduleId) return;
      setBusy(true);
      try {
        const { url } = await getSchedulePosterLink(scheduleId, style);
        const res = await shareScheduleImage({
          scheduleId,
          style,
          weekStart,
          posterUrl: url,
          ...(toPhone ? { toPhone } : {}),
        });
        if (res.ok) {
          toast.success(
            toPhone
              ? "הקישור נשלח למנהל — WhatsApp יציג תצוגה מקדימה של התמונה"
              : "הקישור הועתק ל-WhatsApp — תצוגת התמונה תופיע אוטומטית",
          );
        } else {
          toast.error("פתיחת WhatsApp נכשלה");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "יצירת הקישור נכשלה");
      } finally {
        setBusy(false);
      }
    },
    [scheduleId, style, weekStart],
  );

  const handleDownload = React.useCallback(
    async (alsoOpenWhatsApp: boolean) => {
      if (!scheduleId) return;
      setBusy(true);
      try {
        const url = getScheduleExportUrl(scheduleId, format, style);
        // Fetch as blob so the download attribute works cross-origin.
        // (A plain <a href="…" download> is ignored for cross-origin URLs —
        // the browser navigates instead of saving. Blob URLs are always
        // same-origin so the download attribute is honoured.)
        // Bearer header (not cookies) — the export route is JWT-authed so the
        // real org's schedule is rendered, not the demo fixture.
        const res = await fetch(url, { headers: await exportAuthHeaders() });
        if (!res.ok) throw new Error(`שגיאת שרת ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `schedule-${weekStart}-${style}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
        if (alsoOpenWhatsApp) {
          const msg = `סידור עבודה לשבוע ${weekStart} — מצורף בקובץ ${format.toUpperCase()}`;
          window.open(
            `https://wa.me/?text=${encodeURIComponent(msg)}`,
            "_blank",
            "noopener",
          );
        }
        toast.success(
          alsoOpenWhatsApp
            ? "הקובץ הורד — צרף אותו להודעת ה-WhatsApp שנפתחה"
            : "הקובץ הורד",
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "ההורדה נכשלה");
      } finally {
        setBusy(false);
      }
    },
    [scheduleId, format, style, weekStart],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-indigo-500" />
            ייצוא ושיתוף סידור
          </DialogTitle>
          <DialogDescription>
            הורידו תמונה או PDF של הסידור ושתפו ב-WhatsApp, מייל או הדפסה.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format toggle */}
          <div>
            <div className="text-xs font-semibold mb-2">פורמט קובץ</div>
            <div
              role="radiogroup"
              aria-label="פורמט קובץ"
              className="grid grid-cols-2 gap-2"
            >
              <FormatPill
                active={format === "png"}
                onClick={() => setFormat("png")}
                icon={<FileImage className="h-4 w-4" />}
                label="PNG · תמונה"
                hint="מתאים ל-WhatsApp"
              />
              <FormatPill
                active={format === "pdf"}
                onClick={() => setFormat("pdf")}
                icon={<FileText className="h-4 w-4" />}
                label="PDF · מסמך"
                hint="מתאים להדפסה / מייל"
              />
            </div>
          </div>

          {/* Style picker */}
          <div>
            <div className="text-xs font-semibold mb-2">סגנון עיצוב</div>
            <div className="grid grid-cols-3 gap-3">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={style === s.id}
                  onClick={() => setStyle(s.id)}
                  className={`text-start rounded-lg border-2 p-2 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    style === s.id
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20"
                      : "border-border hover:border-indigo-300"
                  }`}
                >
                  {s.preview}
                  <div className="mt-2 text-sm font-semibold">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Smart share actions — appear above the legacy download row */}
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs font-semibold">שיתוף חכם ב-WhatsApp</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="glow"
                onClick={handleNativeShare}
                disabled={busy || !scheduleId}
                className="justify-start"
                title={
                  nativeShareReady
                    ? "פותח את חלון השיתוף של המכשיר — בחרו קבוצה/איש קשר"
                    : "במכשיר זה: התמונה תרד והקישור ייפתח ב-WhatsApp"
                }
              >
                <ImageIcon className="h-4 w-4" />
                {nativeShareReady
                  ? "שתף תמונה ב-WhatsApp"
                  : "הורד תמונה + פתח WhatsApp"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleShareViaUrl()}
                disabled={busy || !scheduleId}
                className="justify-start"
                title="WhatsApp יצור תצוגה מקדימה של התמונה אוטומטית"
              >
                <Link2 className="h-4 w-4" />
                שתף לינק תמונה (preview אוטומטי)
              </Button>
            </div>

            {/* Send to manager — direct DM with poster link */}
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-semibold">שלח לאישור מנהל</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="050-1234567"
                  value={managerPhone}
                  onChange={(e) => setManagerPhone(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="טלפון מנהל לאישור"
                />
                <Button
                  variant="secondary"
                  onClick={() => handleShareViaUrl(managerPhone.trim())}
                  disabled={busy || !scheduleId || !managerPhone.trim()}
                >
                  <Send className="h-4 w-4" />
                  שלח לאישור
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                המנהל יקבל הודעת WhatsApp עם תצוגה מקדימה של הסידור — לחיצה
                אחת לאישור.
              </p>
            </div>
          </div>

          {/* Legacy download row */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => handleDownload(false)}
              disabled={busy || !scheduleId}
              className="flex-1"
            >
              <Download className="h-4 w-4" />
              הורד {format.toUpperCase()}
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleDownload(true)}
              disabled={busy || !scheduleId}
              className="flex-1"
            >
              <MessageCircle className="h-4 w-4" />
              הורד + פתח WhatsApp ריק
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            עצה: על מובייל — &quot;שתף תמונה&quot; מצרף את התמונה ישירות. בדסקטופ
            — &quot;שתף לינק&quot; הוא הדרך המהירה ביותר (WhatsApp Web יציג
            תצוגה מקדימה).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormatPill({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-start transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        active
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20"
          : "border-border hover:border-indigo-300"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold text-sm">
        {icon}
        {label}
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}
