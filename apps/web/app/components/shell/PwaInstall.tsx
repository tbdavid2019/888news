import { useEffect, useState } from "react";
import { IconDownload, IconClose } from "../icons.tsx";
import { useI18n } from "../../lib/i18n/index.ts";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "888news:pwa-dismissed:v1";
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isPwaPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  // Test hook: URL query param ?pwa or ?install forces showing prompt
  if (window.location.search.includes("pwa") || window.location.search.includes("install")) {
    return false;
  }
  try {
    const val = localStorage.getItem(DISMISS_KEY);
    if (!val) return false;
    const timestamp = Number(val);
    if (Number.isNaN(timestamp)) return false;
    return Date.now() - timestamp < COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function recordPwaPromptDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function triggerPwaInstallModal(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("888news:open-pwa-modal"));
  }
}

/**
 * Global PWA Auto-Prompt:
 * 1. Captures `beforeinstallprompt` early (via window.__deferredPwaPrompt or event).
 * 2. On non-standalone devices, if not dismissed in 24h, automatically pops up after ~1.2s.
 * 3. Listens for manual trigger event `888news:open-pwa-modal`.
 */
export function PwaAutoPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [alreadyStandalone, setAlreadyStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone = isStandalone();
    setAlreadyStandalone(standalone);
    if (standalone) return; // Never show if already running in standalone app mode

    // Detect iOS
    const isIosDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isIosDevice);

    // Pick up early prompt from <head> script if already captured
    const win = window as unknown as {
      __deferredPwaPrompt?: BeforeInstallPromptEvent | null;
      __onPwaPromptReady?: (e: BeforeInstallPromptEvent) => void;
    };
    if (win.__deferredPwaPrompt) {
      setDeferredPrompt(win.__deferredPwaPrompt);
    }
    win.__onPwaPromptReady = (e: BeforeInstallPromptEvent) => {
      setDeferredPrompt(e);
    };

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      win.__deferredPwaPrompt = promptEvent;
    };

    const handleAppInstalled = () => {
      recordPwaPromptDismissed();
      setIsOpen(false);
      setDeferredPrompt(null);
      setAlreadyStandalone(true);
    };

    const handleManualOpen = () => {
      setIsOpen(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("888news:open-pwa-modal", handleManualOpen);

    // Auto-popup trigger: if not dismissed, pop up after 1.2s
    let autoTimer: NodeJS.Timeout | null = null;
    if (!isPwaPromptDismissed()) {
      autoTimer = setTimeout(() => {
        setIsOpen(true);
      }, 1200);
    }

    return () => {
      if (autoTimer) clearTimeout(autoTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("888news:open-pwa-modal", handleManualOpen);
    };
  }, []);

  if (alreadyStandalone || !isOpen) return null;

  const handleDismiss = () => {
    recordPwaPromptDismissed();
    setIsOpen(false);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          recordPwaPromptDismissed();
          setDeferredPrompt(null);
          setIsOpen(false);
        }
      } catch (err) {
        console.error("PWA install error:", err);
      }
    } else {
      // For iOS or browsers without native prompt, dismiss after user acknowledging
      handleDismiss();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-4 duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt="888news"
              className="size-12 rounded-xl border border-line/80 shadow-sm shrink-0 object-cover"
            />
            <div>
              <h3 id="pwa-install-title" className="font-bold text-ink text-[17px] leading-tight">
                安裝 888news App
              </h3>
              <p className="text-[12.5px] text-ink-3 mt-0.5">
                加到主畫面 · 獨立全螢幕流暢閱讀
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded-control p-1 text-ink-4 hover:bg-bg-sunk hover:text-ink transition-colors"
            aria-label="關閉"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Features Highlights */}
        <div className="grid grid-cols-3 gap-2 py-1 text-center">
          <div className="rounded-xl bg-bg-sunk/70 p-2.5 border border-line/40">
            <div className="text-[14px]">⚡️</div>
            <div className="text-[11.5px] font-semibold text-ink mt-1">秒速開啟</div>
            <div className="text-[10.5px] text-ink-4">離線快取</div>
          </div>
          <div className="rounded-xl bg-bg-sunk/70 p-2.5 border border-line/40">
            <div className="text-[14px]">📱</div>
            <div className="text-[11.5px] font-semibold text-ink mt-1">全螢幕體驗</div>
            <div className="text-[10.5px] text-ink-4">無網址列</div>
          </div>
          <div className="rounded-xl bg-bg-sunk/70 p-2.5 border border-line/40">
            <div className="text-[14px]">🔔</div>
            <div className="text-[11.5px] font-semibold text-ink mt-1">AI 動態</div>
            <div className="text-[10.5px] text-ink-4">即時科技快訊</div>
          </div>
        </div>

        {/* Platform Guidance */}
        {isIOS ? (
          <div className="rounded-xl bg-bg-sunk p-3.5 space-y-2.5 text-[12.5px] text-ink border border-line/60">
            <div className="font-semibold text-accent flex items-center gap-1.5">
              <span>📱 iPhone / iPad 加到主畫面：</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-ink-2 pl-1 leading-relaxed">
              <li>
                點擊 Safari 底部工具列的 <span className="font-semibold text-accent">「分享」</span> 按鈕（⎋ 向上箭頭）
              </li>
              <li>
                向下滑動選單，點選 <span className="font-semibold text-accent">「加入主畫面」</span>（➕ 圖示）
              </li>
              <li>
                點擊右上角的 <span className="font-semibold text-accent">「新增」</span>，即可在桌面隨開即看！
              </li>
            </ol>
          </div>
        ) : deferredPrompt ? (
          <p className="text-[13px] text-ink-3 leading-relaxed">
            點擊下方「立即安裝」即可直接將 888news 加至手機主畫面或電腦桌面，無需下載安裝包。
          </p>
        ) : (
          <div className="rounded-xl bg-bg-sunk p-3.5 text-[12.5px] text-ink-3 leading-relaxed border border-line/60">
            可點擊瀏覽器網址列右側的 <span className="font-semibold text-ink">「⊕ 安裝」</span> 圖示，或從瀏覽器選單中選擇「安裝 888news」加入桌面。
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-4 py-2.5 rounded-xl text-[13.5px] font-medium text-ink-3 hover:text-ink hover:bg-bg-sunk transition-colors"
          >
            {isIOS ? "稍後再說" : "暫時不要"}
          </button>
          {isIOS ? (
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 rounded-xl text-[14px] font-semibold text-white bg-accent hover:opacity-90 active:scale-[0.98] transition-all shadow-md text-center"
            >
              我知道了
            </button>
          ) : deferredPrompt ? (
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex-1 px-4 py-2.5 rounded-xl text-[14px] font-semibold text-white bg-accent hover:opacity-90 active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
            >
              <IconDownload size={16} />
              <span>立即安裝 888news</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 rounded-xl text-[14px] font-semibold text-white bg-accent hover:opacity-90 active:scale-[0.98] transition-all shadow-md text-center"
            >
              我知道了
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sidebar button to manually open PWA install modal
 */
export function SidebarPwaInstall() {
  const { t } = useI18n();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
  }, []);

  if (standalone) return null;

  return (
    <button
      type="button"
      onClick={triggerPwaInstallModal}
      className="flex w-full items-center justify-center gap-1.5 rounded-full py-1 text-[12px] text-ink-4 transition-colors hover:text-accent active:text-accent"
      title="安裝 888news 為桌面或手機應用"
    >
      <IconDownload size={13} />
      <span>{t("nav.install_app")}</span>
    </button>
  );
}
