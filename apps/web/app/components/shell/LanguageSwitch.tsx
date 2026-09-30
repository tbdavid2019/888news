import { useI18n, type Locale } from "../../lib/i18n";

const OPTIONS: Array<{ key: Locale; label: string; short: string }> = [
  { key: "zh-TW", label: "繁體中文", short: "繁" },
  { key: "en", label: "English", short: "EN" },
  { key: "zh-CN", label: "简体中文", short: "简" },
];

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const index = Math.max(0, OPTIONS.findIndex((o) => o.key === locale));

  return (
    <div
      role="radiogroup"
      aria-label="語言切換 / Language"
      className={`relative grid h-[34px] grid-cols-3 rounded-full border border-line bg-bg-sunk p-[3px] ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/3)] rounded-full border border-line bg-surface shadow-[var(--shadow-card)] transition-transform duration-200 ease-[var(--ease-out-quart)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={locale === o.key}
          title={o.label}
          onClick={() => {
            if (locale !== o.key) setLocale(o.key);
          }}
          className={`relative z-10 flex items-center justify-center rounded-full text-[12px] font-medium transition-colors duration-150 ${
            locale === o.key ? "font-semibold text-ink" : "text-ink-4 hover:text-ink-2"
          }`}
        >
          {o.short}
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
