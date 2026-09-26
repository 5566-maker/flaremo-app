import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  type Attachment,
  bindMemoAttachments,
  type createMemo,
  uploadAttachment,
} from "@/api";
import { useI18n } from "@/i18n";
import { createOrReconcileCaptureMemo } from "@/lib/capture-reconcile";
import { formatDuration } from "@/lib/format-duration";
import { vibrate } from "@/lib/haptics";
import type { CaptureSession } from "./use-capture-session";

/** The Worker's attachment cap (attachment-http.ts MAX_ATTACHMENT_BYTES). */
const CAPTURE_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Uploads the encoded session recording through the same attachment pipeline
 * the composer uses (R2 + /api/v1/attachments, rollout §4.1). Exactly one
 * retry, and the retry reuses the client id so a first attempt that actually
 * landed cannot duplicate the file. Null means the caller degrades to a
 * transcript-only memo (D4) — text is never blocked by audio.
 */
async function uploadCaptureAudio(
  file: File,
  clientId: string,
): Promise<Attachment | null> {
  try {
    return await uploadAttachment({ file, clientId });
  } catch {
    try {
      return await uploadAttachment({ file, clientId });
    } catch {
      return null;
    }
  }
}

/**
 * The capture page's submit chain: the R2 preupload that runs before the memo
 * exists, and the save/reconcile that turns the draft into a memo. It borrows
 * the session's refs and draft state (so a retry after a lost create response
 * binds the same attachment and memo) and owns only the saving flags.
 */
export function useCaptureSubmit(session: CaptureSession) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    savedRef,
    savedMemoRef,
    submittedMemoRef,
    uploadedAudioRef,
    audioBoundRef,
    keepAudioRef,
    savingRef,
    local,
    store,
    controller,
    setSaving,
    setSaveError,
    setDraftError,
    setCleanupError,
  } = session;

  // Uploads the encoded session recording to R2 before the memo exists (the
  // composer's preupload pattern): the attachment id lands in the payload at
  // create time and the bind claims the file right after (rollout §4.1).
  const resolveAudioAttachment = async (): Promise<Attachment | null> => {
    if (uploadedAudioRef.current) return uploadedAudioRef.current;
    const audio = keepAudioRef.current ? controller.getCapturedAudio() : null;
    const recording = audio?.recording;
    if (!recording || recording.size === 0) return null;
    if (recording.size > CAPTURE_MAX_AUDIO_BYTES) {
      toast.warning(t("capture.audioNotSaved"));
      return null;
    }
    const extension = audio.mimeType === "audio/ogg" ? "ogg" : "wav";
    const file = new File(
      [recording],
      `voice-${new Date(local.startedAt).toISOString().replace(/[:.]/g, "-")}.${extension}`,
      { type: audio.mimeType },
    );
    const attachment = await uploadCaptureAudio(
      file,
      `${local.clientId}:audio`,
    );
    if (!attachment) {
      // D4: the transcript is the value; the recording is the enhancement.
      toast.warning(t("capture.audioNotSaved"));
      return null;
    }
    uploadedAudioRef.current = attachment;
    return attachment;
  };

  const save = async () => {
    if (savingRef.current || !local.text.trim()) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      let memo = savedMemoRef.current;
      if (!memo) {
        const audioAttachment = await resolveAudioAttachment();
        const content = `# ${t("capture.title")}\n\n${t("capture.recordedAt")}: ${new Date(local.startedAt).toLocaleString()}\n\n${t("capture.duration")}: ${formatDuration(local.duration)}\n\n${local.gap ? `${t("capture.gap")}\n\n` : ""}---\n\n${local.text.trim()}`;
        const input: Parameters<typeof createMemo>[0] = {
          content,
          visibility: local.visibility,
          source: "voice",
          payload: {
            tags: Array.from(new Set(["voice", ...local.tags])),
            client_id: local.clientId,
            durationSeconds: local.duration,
            ...(audioAttachment
              ? { audioAttachmentId: audioAttachment.id }
              : {}),
          },
        };
        const previousInput = submittedMemoRef.current;
        submittedMemoRef.current = input;
        memo = await createOrReconcileCaptureMemo(input, previousInput);
        savedMemoRef.current = memo;
      }
      if (uploadedAudioRef.current && !audioBoundRef.current) {
        // Claim the preuploaded recording: the bind replaces the memo's
        // attachment list, which is empty for a fresh capture memo.
        await bindMemoAttachments(memo.name, [uploadedAudioRef.current.name]);
        audioBoundRef.current = true;
      }
      const cleared = await store.clear();
      if (!cleared) {
        setCleanupError(true);
        return;
      }
      savedRef.current = true;
      setDraftError(false);
      setCleanupError(false);
      vibrate(10);
      toast.success(t("capture.saveSucceeded"));
      await Promise.all(
        ["memos", "memo-stats", "tag-hierarchy"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      await navigate({ to: "/memo/$memoId", params: { memoId: memo.id } });
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return { save };
}
