import { lazy } from "react";

/**
 * The fullscreen focus canvas is ~35KB and pre-warmed via requestIdleCallback.
 * By the time the user reaches for the full screen icon, the chunk is already local,
 * so entering full screen is instantaneous with 0ms delay.
 */
const focusCanvasLoader = () =>
  import("@/components/composer/composer-focus-canvas");

export function loadComposerFocusCanvas() {
  return focusCanvasLoader();
}

export const ComposerFocusCanvas = lazy(async () => {
  const module = await focusCanvasLoader();
  return { default: module.ComposerFocusCanvas };
});

if (typeof window !== "undefined") {
  const idle = (
    window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
    }
  ).requestIdleCallback;
  if (idle) idle(() => void loadComposerFocusCanvas());
  else setTimeout(() => void loadComposerFocusCanvas(), 1000);
}
