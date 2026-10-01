import { useEffect } from "react";
import * as OpenCC from "opencc-js";

const HAS_ZH = /[\u4e00-\u9fa5]/;

export function AdminAutoConverter({ locale }: { locale: string }) {
  useEffect(() => {
    if (locale !== "zh-TW") return;
    const cv = OpenCC.Converter({ from: "cn", to: "twp" });

    let isConverting = false;

    const convertTree = (root: Node) => {
      if (!(root instanceof Node)) return;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !HAS_ZH.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "CODE" || tag === "PRE") return NodeFilter.FILTER_REJECT;
          if (parent.closest(".no-opencc")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const nodes: Node[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const n of nodes) {
        if (n.nodeValue && HAS_ZH.test(n.nodeValue)) {
          const converted = cv(n.nodeValue);
          if (converted !== n.nodeValue) {
            n.nodeValue = converted;
          }
        }
      }

      // Convert attributes
      if (root instanceof Element) {
        const elements = [root, ...Array.from(root.querySelectorAll("[placeholder], [title], [aria-label]"))];
        for (const el of elements) {
          const ph = el.getAttribute("placeholder");
          if (ph && HAS_ZH.test(ph)) {
            const cph = cv(ph);
            if (cph !== ph) el.setAttribute("placeholder", cph);
          }
          const tit = el.getAttribute("title");
          if (tit && HAS_ZH.test(tit)) {
            const ctit = cv(tit);
            if (ctit !== tit) el.setAttribute("title", ctit);
          }
          const al = el.getAttribute("aria-label");
          if (al && HAS_ZH.test(al)) {
            const cal = cv(al);
            if (cal !== al) el.setAttribute("aria-label", cal);
          }
        }
      }
    };

    isConverting = true;
    convertTree(document.body);
    isConverting = false;

    const observer = new MutationObserver((mutations) => {
      if (isConverting) return;
      isConverting = true;
      try {
        for (const m of mutations) {
          if (m.type === "childList") {
            for (let i = 0; i < m.addedNodes.length; i++) {
              const node = m.addedNodes[i];
              if (node) convertTree(node);
            }
          } else if (m.type === "characterData") {
            const target = m.target;
            if (target && target.nodeValue && HAS_ZH.test(target.nodeValue)) {
              const converted = cv(target.nodeValue);
              if (converted !== target.nodeValue) {
                target.nodeValue = converted;
              }
            }
          }
        }
      } finally {
        isConverting = false;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}
