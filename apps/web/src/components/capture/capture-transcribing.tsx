import { Skeleton } from "@/components/ui/skeleton";

/**
 * Waiting state for batch-mode transcription ("转写中" skeleton, rollout
 * §2.3). The batch ASR pipeline lands in P2; the style ships here so the
 * wiring only toggles visibility.
 */
export function CaptureTranscribing({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-2 px-1 py-2">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="space-y-2">
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
