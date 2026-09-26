import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import {
  type Attachment,
  type createMemo,
  getCaptureStatus,
  getCurrentFlareMoUser,
} from "@/api";
import { authClient } from "@/auth-client";
import { useI18n } from "@/i18n";
import {
  type BatchProgress,
  transcribeCapturedAudio,
} from "@/lib/audio-capture/batch";
import {
  CaptureController,
  captureIsActive,
} from "@/lib/audio-capture/controller";
import { createCaptureAudioSink } from "@/lib/audio-capture/encoder";
import {
  CaptureDraftStore,
  captureDraftId,
  type LocalCapture,
  loadCapture,
  newLocalCapture,
} from "@/lib/audio-capture/local-session";
import {
  type Microphone,
  openMicrophone,
} from "@/lib/audio-capture/microphone";
import { CaptureTranscriptAccumulator } from "@/lib/audio-capture/transcript";
import type { CaptureState } from "@/lib/audio-capture/types";
import { mergeCaptureSnapshot } from "@/lib/capture-reconcile";
import { vibrate } from "@/lib/haptics";
import { queryKeys } from "@/lib/query-keys";

const CAPTURE_KEEP_AUDIO_KEY = "capture.keepAudio";

function readKeepAudio(): boolean {
  try {
    return localStorage.getItem(CAPTURE_KEEP_AUDIO_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * The capture page's recording session: controller/store assembly, the eight
 * lifecycle effects (recovery load, log sync, draft autosave, timer, wake
 * lock, tail scroll, log hand-over, page-level Enter) and the start/discard
 * actions. The ref state machine deliberately stays here — the shell wires it
 * and reads it, and the submit chain (use-capture-submit) receives the refs
 * through this bundle so their identities and update order are unchanged.
 */
export function useCaptureSession() {
  const { t } = useI18n();
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? "";
  const draftId = useMemo(() => captureDraftId(userId), [userId]);
  const store = useMemo(() => new CaptureDraftStore(draftId), [draftId]);
  const status = useQuery({
    queryKey: queryKeys.captureStatus.forUser(userId),
    queryFn: getCaptureStatus,
    staleTime: 30_000,
    retry: false,
  });
  // Role-aware unavailable copy (rollout §5): the App shell already caches
  // the viewer under this key, so this rides along without a new request.
  const meQuery = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: getCurrentFlareMoUser,
    staleTime: 60_000,
    retry: false,
  });
  const canManageVoiceService = meQuery.data?.can_manage_voice_service === true;
  const [controller] = useState(
    () =>
      new CaptureController({
        // The page keeps the live microphone handle for the waveform while
        // the controller owns its lifecycle (start/stop/dispose).
        microphone: async (onFrame, signal, interrupt) => {
          const mic = await openMicrophone(onFrame, signal, interrupt);
          micRef.current = mic;
          return mic;
        },
        status: getCaptureStatus,
        socket: () =>
          new WebSocket(
            `${location.origin.replace(/^http/, "ws")}/api/app/capture/ws`,
          ),
        // Batch ASR (rollout §3.3): used only when /status reports a batch
        // provider; the controller decides the mode per session.
        batch: {
          createSink: () => createCaptureAudioSink(),
          transcribe: (audio, input) =>
            transcribeCapturedAudio(audio, {
              language: input.language,
              startedAtMs: input.startedAtMs,
              onProgress: input.onProgress,
              signal: input.signal,
            }),
        },
      }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [local, setLocal] = useState(newLocalCapture);
  const [recovery, setRecovery] = useState<LocalCapture | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [review, setReview] = useState(false);
  // True for one beat when the live log hands over to the review form, so the
  // log can fade out instead of vanishing in a ternary hard cut (§2.3).
  const [logLeaving, setLogLeaving] = useState(false);
  // P2 wires batch-mode ASR here (rollout §2.3/§3.3); the skeleton style
  // ships now.
  const transcribing = snapshot.state === "transcribing";
  const transcribeProgress: BatchProgress | null = snapshot.transcribing;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [cleanupError, setCleanupError] = useState(false);
  // "Save original audio" (rollout §4.1): on by default, remembered across
  // sessions in localStorage so enterprise members can opt out for good.
  const [keepAudio, setKeepAudio] = useState(readKeepAudio);
  const keepAudioRef = useRef(keepAudio);
  keepAudioRef.current = keepAudio;
  const [now, setNow] = useState(Date.now());
  const savingRef = useRef(false);
  const savedRef = useRef(false);
  const savedMemoRef = useRef<Awaited<ReturnType<typeof createMemo>> | null>(
    null,
  );
  const submittedMemoRef = useRef<Parameters<typeof createMemo>[0] | null>(
    null,
  );
  // Audio attachment claimed before the memo existed (rollout §4.1): the
  // upload result survives a lost create response so a retry binds the same
  // file instead of uploading it twice; boundRef skips an already-applied bind.
  const uploadedAudioRef = useRef<Attachment | null>(null);
  const audioBoundRef = useRef(false);
  const localRef = useRef(local);
  localRef.current = local;
  const transcript = useRef(new CaptureTranscriptAccumulator());
  const micRef = useRef<Microphone | null>(null);
  const getWaveform = useCallback(
    () => micRef.current?.getWaveform?.() ?? null,
    [],
  );
  const tail = useRef<HTMLDivElement>(null);
  const active = captureIsActive(snapshot.state);
  // Batch transcription keeps the session unsaved until it resolves; leaving
  // mid-flight cancels the attempt instead of losing it silently.
  const unsaved =
    active || snapshot.state === "transcribing" || review || Boolean(recovery);
  const blocker = useBlocker({
    disabled: !unsaved,
    enableBeforeUnload: true,
    shouldBlockFn: () => !savedRef.current,
    withResolver: true,
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadCapture(draftId).then((value) => {
      if (!cancelled) {
        if (value) store.markRecovered();
        setRecovery(value);
        setLoaded(true);
      }
    });
    const hidden = () => {
      if (document.hidden) controller.interrupt();
    };
    const pageHide = () => {
      controller.interrupt();
      controller.dispose();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pageHide);
    return () => {
      cancelled = true;
      controller.dispose();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pageHide);
      if (!savedRef.current && !savedMemoRef.current && localRef.current.text)
        void store.save(localRef.current).catch(() => undefined);
    };
  }, [controller, draftId, store]);

  useEffect(() => {
    if (!snapshot.startedAt) return;
    const text = transcript.current.sync(
      snapshot.sentences,
      snapshot.startedAt,
      snapshot.sentenceVersion,
    );
    setLocal((value) =>
      mergeCaptureSnapshot(
        value,
        text,
        snapshot.startedAt,
        snapshot.stoppedAt,
        snapshot.gap,
      ),
    );
    if (snapshot.state === "review") setReview(true);
  }, [
    snapshot.gap,
    snapshot.sentences,
    snapshot.sentenceVersion,
    snapshot.startedAt,
    snapshot.state,
    snapshot.stoppedAt,
  ]);

  useEffect(() => {
    if (!loaded || savedRef.current || (!local.text && !review)) return;
    const timer = window.setTimeout(
      () => {
        void store
          .save(local)
          .then((ok) => setDraftError(!ok))
          .catch(() => setDraftError(true));
      },
      review ? 250 : 500,
    );
    return () => window.clearTimeout(timer);
  }, [local, loaded, review, store]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (!snapshot.microphoneActive || !navigator.wakeLock) return;
    let cancelled = false;
    let lock: WakeLockSentinel | undefined;
    void navigator.wakeLock
      .request("screen")
      .then((value) => {
        if (cancelled) void value.release();
        else lock = value;
      })
      .catch(() =>
        // Bottom toasts overlap the recording controls and intercept taps on
        // them (pointer hover over the toast also suspends sonner's auto
        // dismiss), so keep this warning above the controls instead.
        toast.warning(t("capture.wakeLockFailed"), {
          duration: 6000,
          position: "top-center",
        }),
      );
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [snapshot.microphoneActive, t]);
  useEffect(() => {
    if (snapshot.partial || snapshot.sentenceVersion)
      tail.current?.scrollIntoView({ block: "nearest" });
  }, [snapshot.partial, snapshot.sentenceVersion]);

  // Recording → review: fade the live log out (animate-fade reversed, 140ms
  // ≤ the 320ms entrance budget) while the review form rises in.
  const previousStateRef = useRef<CaptureState>("idle");
  useEffect(() => {
    const wasActive = captureIsActive(previousStateRef.current);
    previousStateRef.current = snapshot.state;
    if (snapshot.state !== "review" || !wasActive) return;
    setLogLeaving(true);
    const timer = window.setTimeout(() => setLogLeaving(false), 160);
    return () => window.clearTimeout(timer);
  }, [snapshot.state]);

  const start = useCallback(() => {
    vibrate(5);
    savedRef.current = false;
    setReview(false);
    setSaveError(false);
    setCleanupError(false);
    savedMemoRef.current = null;
    submittedMemoRef.current = null;
    uploadedAudioRef.current = null;
    audioBoundRef.current = false;
    transcript.current.reset();
    setLocal(newLocalCapture());
    void controller.start();
  }, [controller.start]);
  // Page-level Enter drives start/stop/resume while the page owns focus.
  // Space is deliberately unbound (scroll conflict); fields and buttons keep
  // their native Enter behavior, and open dialogs win.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const state = controller.getSnapshot().state;
      if (state === "recording") {
        event.preventDefault();
        vibrate(5);
        void controller.stop();
      } else if (state === "paused") {
        event.preventDefault();
        controller.resume();
      } else if (
        (state === "idle" || state === "error") &&
        loaded &&
        status.data?.available
      ) {
        event.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller, loaded, start, status.data?.available]);
  const discard = async () => {
    const cleared = await store.clear();
    if (!cleared) {
      setDraftError(true);
      return;
    }
    savedRef.current = true;
    savedMemoRef.current = null;
    submittedMemoRef.current = null;
    uploadedAudioRef.current = null;
    audioBoundRef.current = false;
    transcript.current.reset();
    controller.reset();
    setReview(false);
    setRecovery(null);
    setLocal(newLocalCapture());
    setSaveError(false);
    setDraftError(false);
    setCleanupError(false);
  };
  const stopAndLeave = async () => {
    if (blocker.status !== "blocked" || leaving) return;
    const proceed = blocker.proceed;
    if (controller.getSnapshot().state === "transcribing")
      controller.cancelTranscription();
    const wasActive = captureIsActive(controller.getSnapshot().state);
    setLeaving(true);
    try {
      if (wasActive) {
        await controller.stop();
        if (captureIsActive(controller.getSnapshot().state)) {
          await new Promise<void>((resolve) => {
            const unsubscribe = controller.subscribe(() => {
              if (!captureIsActive(controller.getSnapshot().state)) {
                unsubscribe();
                resolve();
              }
            });
          });
        }
      }
      const finalSnapshot = controller.getSnapshot();
      const text = finalSnapshot.startedAt
        ? transcript.current.sync(
            finalSnapshot.sentences,
            finalSnapshot.startedAt,
          )
        : localRef.current.text;
      const value = wasActive
        ? mergeCaptureSnapshot(
            localRef.current,
            text,
            finalSnapshot.startedAt,
            finalSnapshot.stoppedAt,
            finalSnapshot.gap,
          )
        : localRef.current;
      localRef.current = value;
      if (value.text) {
        const persisted = await store.save(value).catch(() => false);
        setDraftError(!persisted);
        if (!persisted) {
          // Stay on the page so the author can retry saving or copy the
          // transcript; navigating away now would silently lose it.
          savedRef.current = false;
          return;
        }
        savedRef.current = true;
      } else {
        savedRef.current = true;
      }
      proceed();
    } finally {
      setLeaving(false);
    }
  };
  // Toggling the preference also writes it through; a storage failure leaves
  // the session default standing.
  const updateKeepAudio = (checked: boolean) => {
    const value = Boolean(checked);
    setKeepAudio(value);
    try {
      localStorage.setItem(CAPTURE_KEEP_AUDIO_KEY, value ? "on" : "off");
    } catch {
      /* Storage unavailable: the session default stands. */
    }
  };

  return {
    status,
    canManageVoiceService,
    controller,
    snapshot,
    transcribing,
    transcribeProgress,
    active,
    local,
    setLocal,
    recovery,
    setRecovery,
    loaded,
    review,
    setReview,
    logLeaving,
    saving,
    setSaving,
    saveError,
    setSaveError,
    draftError,
    setDraftError,
    cleanupError,
    setCleanupError,
    keepAudio,
    updateKeepAudio,
    now,
    getWaveform,
    tail,
    blocker,
    leaving,
    start,
    discard,
    stopAndLeave,
    /** Handed to the submit chain (use-capture-submit) as-is. */
    savedRef,
    savedMemoRef,
    submittedMemoRef,
    uploadedAudioRef,
    audioBoundRef,
    savingRef,
    keepAudioRef,
    store,
  };
}

export type CaptureSession = ReturnType<typeof useCaptureSession>;
