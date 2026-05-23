"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface VideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// TODO: Replace PLACEHOLDER with real Loom video ID
const VIDEO_EMBED_URL = "https://www.loom.com/embed/PLACEHOLDER";

export function VideoModal({ open, onOpenChange }: VideoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl p-0 overflow-hidden"
        aria-describedby="video-modal-description"
      >
        <div className="p-6 pb-3">
          <DialogTitle className="text-xl">דמו של סידור4S — 60 שניות</DialogTitle>
          <DialogDescription id="video-modal-description" className="mt-1">
            סיור קצר ביכולות השיבוץ האוטומטי ותאימות חוקי העבודה.
          </DialogDescription>
        </div>

        <div className="aspect-video w-full bg-black">
          {open && (
            <iframe
              src={VIDEO_EMBED_URL}
              title="סידור4S דמו וידאו"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
