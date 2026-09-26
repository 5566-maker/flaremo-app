import { lazy } from "react";

/**
 * The TipTap editor is ~140KB gzipped and never needed before the user starts
 * writing, so it ships as its own async chunk instead of the startup bundle.
 * `requestIdleCallback` prefetches it right after load: by the time the user
 * reaches for the composer the chunk is already local, so lazy loading costs
 * nothing in practice.
 */
export function loadRichComposerEditor() {
  return import("@/components/rich-composer-editor");
}

export const RichComposerEditor = lazy(async () => {
  const module = await loadRichComposerEditor();
  return { default: module.RichComposerEditor };
});

if (typeof window !== "undefined") {
  const idle = (
    window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
    }
  ).requestIdleCallback;
  if (idle) idle(() => void loadRichComposerEditor());
  else setTimeout(() => void loadRichComposerEditor(), 2000);
}
