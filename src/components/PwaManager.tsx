import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setupPwa } from "@/lib/pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed";

export function PwaManager() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    void setupPwa({
      onNeedRefresh: (reload) => {
        toast("Có bản cập nhật mới", {
          description: "Tải lại để dùng phiên bản mới nhất.",
          duration: Infinity,
          action: { label: "Tải lại", onClick: reload },
        });
      },
    });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setDeferred(null));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 shadow-lg sm:left-auto sm:right-4">
      <Download className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Thêm vào màn hình chính</p>
        <p className="text-xs text-muted-foreground">Mở nhanh như một ứng dụng thật.</p>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          const e = deferred;
          setDeferred(null);
          await e.prompt();
          await e.userChoice;
        }}
      >
        Cài đặt
      </Button>
      <button
        type="button"
        aria-label="Đóng"
        className="text-muted-foreground"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setDeferred(null);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
