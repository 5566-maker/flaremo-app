import { useEffect, useRef } from "react";

/**
 * Live oscilloscope strip for the open microphone. This is information, not
 * decoration (voice-capture-rollout §2.1), so it keeps drawing under
 * prefers-reduced-motion; only the page's entrance/pulse animations are
 * motion-gated.
 */
export function CaptureWaveform({
  active,
  getWaveform,
  label,
}: {
  active: boolean;
  getWaveform: () => Uint8Array | null;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let raf = 0;
    // The stroke follows the theme's primary token, including dark mode and
    // preset switches (class on <html>).
    let stroke = getComputedStyle(canvas).getPropertyValue("--primary").trim();
    const themeObserver = new MutationObserver(() => {
      stroke = getComputedStyle(canvas).getPropertyValue("--primary").trim();
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
    });
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      const data = getWaveform();
      context.beginPath();
      if (data && data.length > 1) {
        for (let index = 0; index < data.length; index += 1) {
          const x = (index / (data.length - 1)) * width;
          const y = height / 2 + ((data[index] - 128) / 128) * (height / 2 - 3);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
      } else {
        // No microphone samples: keep the near-flat line visible instead of
        // an empty canvas, so "am I being heard?" always has an answer.
        context.moveTo(0, height / 2);
        context.lineTo(width, height / 2);
      }
      context.strokeStyle = stroke || "currentColor";
      context.lineWidth = 2;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [active, getWaveform]);
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className="h-12 w-full rounded-lg bg-muted/60"
    />
  );
}
