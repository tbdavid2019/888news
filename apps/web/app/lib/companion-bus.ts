// Event bus and state store for the accompanying Floating AI Copilot.
import { useSyncExternalStore } from "react";

export interface CompanionContext {
  title: string;
  summary?: string;
  url?: string;
}

export interface CompanionState {
  isOpen: boolean;
  context: CompanionContext | null;
  pendingQuestion?: string;
}

let state: CompanionState = {
  isOpen: false,
  context: null,
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}

export function openCompanion(options?: { question?: string; title?: string; summary?: string; url?: string }): void {
  state = {
    isOpen: true,
    context: options?.title ? { title: options.title, summary: options.summary, url: options.url } : state.context,
    pendingQuestion: options?.question,
  };
  notify();
}

export function closeCompanion(): void {
  state = { ...state, isOpen: false };
  notify();
}

export function toggleCompanion(): void {
  state = { ...state, isOpen: !state.isOpen };
  notify();
}

export function setCompanionContext(context: CompanionContext | null): void {
  state = { ...state, context };
  notify();
}

export function clearPendingQuestion(): void {
  state = { ...state, pendingQuestion: undefined };
  notify();
}

export function getCompanionState(): CompanionState {
  return state;
}

export function subscribeCompanion(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useCompanionState(): CompanionState {
  return useSyncExternalStore(
    subscribeCompanion,
    getCompanionState,
    () => ({ isOpen: false, context: null })
  );
}
