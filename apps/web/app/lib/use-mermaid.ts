import { useEffect, type RefObject } from "react";

// Standard Mermaid diagram keywords (including modern v11/v12 diagram types and directed graph)
export const MERMAID_REGEX =
  /^\s*(?:flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|graph\s+(?:TD|TB|BT|RL|LR)|quadrantChart|xychart-beta|mindmap|timeline|zenuml|sankey-beta|architecture-beta|packet-beta|block-beta|kanban)\b/;

/**
 * Strips leading YAML frontmatter (`--- ... ---`) and Mermaid comment lines (`%% ...`)
 * to reliably test for diagram definitions.
 */
export function cleanMermaidSource(text: string): string {
  let cleaned = text.trim();
  // Strip YAML frontmatter if present
  if (cleaned.startsWith("---")) {
    cleaned = cleaned.replace(/^---[\s\S]*?---\s*/, "");
  }
  // Strip leading comment lines
  cleaned = cleaned.replace(/^(?:%%\s*[^\n]*\n+)+/, "").trim();
  return cleaned;
}

/** Detects if a text block or element class represents a Mermaid diagram */
export function isMermaidCode(text: string, classList?: string[]): boolean {
  if (classList && classList.length > 0) {
    if (classList.includes("language-mermaid") || classList.includes("mermaid")) {
      return true;
    }
    // If explicitly annotated with a non-mermaid programming language (e.g. language-python), reject
    const hasOtherLanguage = classList.some((c) => /^language-(?!mermaid$|text$|none$)[a-zA-Z0-9_-]+$/.test(c));
    if (hasOtherLanguage) return false;
  }
  const cleaned = cleanMermaidSource(text);
  return MERMAID_REGEX.test(cleaned);
}

/**
 * Dynamically detects Mermaid code blocks within a container element,
 * lazily imports Mermaid on demand (zero overhead for pages without diagrams),
 * and hydrates them into interactive SVGs with full Light/Dark mode support.
 */
export function useMermaid(containerRef: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = containerRef.current;
    if (!container) return;

    // 1. Scan for code blocks containing Mermaid diagrams
    const codeBlocks = Array.from(container.querySelectorAll<HTMLElement>("pre > code"));
    const targets: { pre: HTMLElement; code: string }[] = [];

    for (const codeEl of codeBlocks) {
      const pre = codeEl.parentElement;
      if (!pre) continue;
      const text = (codeEl.textContent || "").trim();
      const isMermaid = isMermaidCode(text, Array.from(codeEl.classList));

      if (isMermaid && text) {
        targets.push({ pre, code: text });
      }
    }

    if (targets.length === 0) return;

    let cancelled = false;
    let renderEpoch = 0;

    async function renderAll() {
      const currentEpoch = ++renderEpoch;
      try {
        const mermaid = (await import("mermaid")).default;
        if (cancelled || currentEpoch !== renderEpoch) return;

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "neutral",
          securityLevel: "strict", // Strict sandboxing to prevent any XSS from untrusted feeds
          fontFamily: "inherit",
        });

        for (let i = 0; i < targets.length; i++) {
          if (cancelled || currentEpoch !== renderEpoch) return;
          const { pre, code } = targets[i]!;

          const id = `mermaid-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
          try {
            const { svg } = await mermaid.render(id, code);
            if (cancelled || currentEpoch !== renderEpoch) return;

            let wrapper = pre.nextElementSibling as HTMLElement | null;
            if (!wrapper || !wrapper.classList.contains("mermaid-container")) {
              wrapper = document.createElement("div");
              wrapper.className = "mermaid-container";
              pre.insertAdjacentElement("afterend", wrapper);
            }
            wrapper.innerHTML = svg;
            pre.style.display = "none";
          } catch (renderError) {
            console.warn("Mermaid rendering fallback to plain code block:", renderError);
            const tempEl = document.getElementById(id) || document.getElementById(`d${id}`);
            if (tempEl) tempEl.remove();

            // Clean up any stale wrapper from a previous theme render
            const existingWrapper = pre.nextElementSibling as HTMLElement | null;
            if (existingWrapper && existingWrapper.classList.contains("mermaid-container")) {
              existingWrapper.remove();
            }
            pre.style.display = "";
          }
        }
      } catch (loadError) {
        console.warn("Failed to load Mermaid module:", loadError);
      }
    }

    renderAll();

    // 2. Observer for Theme Changes (Light / Dark mode toggle)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "data-theme") {
          renderAll();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      cancelled = true;
      renderEpoch++;
      observer.disconnect();
    };
  }, deps);
}
