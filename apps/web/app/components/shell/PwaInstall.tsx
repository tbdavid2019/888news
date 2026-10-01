import { useEffect, useState } from "react";
import { IconDownload, IconClose } from "../icons";
import { useI18n } from "../../lib/i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if running in standalone mode (already installed)
    const isRunningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isRunningStandalone);

    // Check if iOS device
    const isIosDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isIosDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIosGuide(true);
    } else {
      // General instructions for desktop/Android if beforeinstallprompt already fired or unsupported
      setShowIosGuide(true);
    }
  };

  return {
    canInstall: !isStandalone,
    isStandalone,
    isIOS,
    showIosGuide,
    setShowIosGuide,
    triggerInstall,
  };
}

export function PwaInstallModal({
  open,
  onClose,
  isIOS,
}: {
  open: boolean;
  onClose: () => void;
  isIOS: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-control bg-accent/15 text-accent">
              <IconDownload size={18} />
            </span>
            <h3 className="font-semibold text-ink text-[16px]">安裝 888news App</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-ink-4 hover:bg-bg-sunk hover:text-ink transition-colors"
            aria-label="關閉"
          >
            <IconClose size={18} />
          </button>
        </div>

        <p className="text-[13px] text-ink-3 leading-relaxed">
          888news 支援完整 PWA（Progressive Web App）離線快取與全螢幕體驗，無需透過 App Store 下載即可安裝。
        </p>

        {isIOS ? (
          <div className="rounded-control bg-bg-sunk p-3.5 space-y-2.5 text-[12.5px] text-ink">
            <div className="font-medium text-accent">📱 iPhone / iPad 安裝步驟：</div>
            <ol className="list-decimal list-inside space-y-1.5 text-ink-3">
              <li>
                在 Safari 瀏覽器底欄點擊 <span className="font-semibold text-ink">「分享」</span> 按鈕（向上箭頭 ⎋）
              </li>
              <li>
                在選單中往下滾動，點擊 <span className="font-semibold text-ink">「加入主畫面」</span>（Add to Home Screen ⊞）
              </li>
              <li>點擊右上角「新增」，即可在手機桌面使用！</li>
            </ol>
          </div>
        ) : (
          <div className="rounded-control bg-bg-sunk p-3.5 space-y-2 text-[12.5px] text-ink">
            <div className="font-medium text-accent">💻 電腦與 Android 安裝步驟：</div>
            <p className="text-ink-3">
              點擊瀏覽器網址列右側的 <span className="font-semibold text-ink">「安裝」</span> 圖示，或點擊瀏覽器右上角選單中的「安裝 888news」即可。
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-control bg-accent py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 active:opacity-100"
        >
          我知道了
        </button>
      </div>
    </div>
  );
}

export function SidebarPwaInstall() {
  const { canInstall, isIOS, showIosGuide, setShowIosGuide, triggerInstall } = usePwaInstall();
  const { t } = useI18n();

  if (!canInstall) return null;

  return (
    <>
      <button
        onClick={triggerInstall}
        className="flex w-full items-center justify-center gap-1.5 rounded-full py-1 text-[12px] text-ink-4 transition-colors hover:text-accent active:text-accent"
        title="安裝 888news 為桌面或手機應用"
      >
        <IconDownload size={13} />
        <span>{t("nav.install_app")}</span>
      </button>

      <PwaInstallModal
        open={showIosGuide}
        onClose={() => setShowIosGuide(false)}
        isIOS={isIOS}
      />
    </>
  );
}
