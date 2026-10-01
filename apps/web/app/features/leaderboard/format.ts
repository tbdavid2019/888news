import type { LbPrice } from "@aihot/contracts/leaderboard";
import { beijingDate, beijingTime } from "@aihot/contracts/time";

export type LbCurrency = "USD" | "TWD";

export function formatPrice(v: number | null | undefined, currency: LbCurrency = "USD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (currency === "USD") {
    if (v >= 1) return `$${v.toFixed(2)}`;
    if (v >= 0.01) return `$${v.toFixed(2)}`;
    return `$${Number(v.toPrecision(3))}`;
  }
  if (v >= 100) return `NT$${Math.round(v).toLocaleString("en-US")}`;
  if (v >= 10) return `NT$${v.toFixed(1)}`;
  if (v >= 0.1) return `NT$${v.toFixed(2)}`;
  return `NT$${Number(v.toPrecision(3))}`;
}

export function getPriceValue(p: LbPrice | null | undefined, field: "cached" | "input" | "output", currency: LbCurrency = "USD"): number | null {
  if (!p) return null;
  if (currency === "USD") {
    if (field === "cached") return p.cachedUsd ?? (p.currency === "USD" ? p.cached : (p.cachedCny ? p.cachedCny / 7.2 : null));
    if (field === "input") return p.inputUsd ?? (p.currency === "USD" ? p.input : (p.inputCny ? p.inputCny / 7.2 : null));
    return p.outputUsd ?? (p.currency === "USD" ? p.output : (p.outputCny ? p.outputCny / 7.2 : null));
  } else {
    if (field === "cached") return p.cachedTwd ?? (p.cachedUsd != null ? p.cachedUsd * 31.5 : (p.currency === "USD" && p.cached != null ? p.cached * 31.5 : (p.cachedCny ? (p.cachedCny / 7.2) * 31.5 : null)));
    if (field === "input") return p.inputTwd ?? (p.inputUsd != null ? p.inputUsd * 31.5 : (p.currency === "USD" && p.input != null ? p.input * 31.5 : (p.inputCny ? (p.inputCny / 7.2) * 31.5 : null)));
    return p.outputTwd ?? (p.outputUsd != null ? p.outputUsd * 31.5 : (p.currency === "USD" && p.output != null ? p.output * 31.5 : (p.outputCny ? (p.outputCny / 7.2) * 31.5 : null)));
  }
}

/** Legacy helper, forwards to USD formatting to avoid RMB leakage. */
export function yuan(v: number | null | undefined): string {
  return formatPrice(v, "USD");
}

export function listPrice(v: number | null, _currency: LbPrice["currency"] = "USD"): string {
  if (v == null) return "—";
  return `$${Number(v.toPrecision(6))}`;
}

/** "09/26 20:00" in Beijing time, as the leaderboard has always shown update times. */
export function shortStamp(iso: string | null | undefined): string {
  if (!iso) return "待核實";
  return `${beijingDate(iso).slice(5).replace("-", "/")} ${beijingTime(iso)}`;
}

export function pct(weight: number, digits = 1): string {
  const v = weight * 100;
  return `${Number(v.toFixed(digits))}%`;
}

/** Always one decimal, as the shared-evidence tables print weights ("5.0%"). */
export function pctFixed(weight: number): string {
  return `${(weight * 100).toFixed(1)}%`;
}

export function tokensWan(n: number | null): string {
  if (!n) return "—";
  const w = n / 10000;
  return `${Number(w >= 100 ? w.toFixed(1) : w.toFixed(1))}萬`.replace(".0萬", "萬");
}

export function boardHref(key: string): string {
  return key === "overall" ? "/leaderboard" : `/leaderboard/category/${key}`;
}

export function modelHref(slug: string, from?: string | null): string {
  return from && from !== "overall" ? `/leaderboard/${slug}?from=${from}` : `/leaderboard/${slug}`;
}
