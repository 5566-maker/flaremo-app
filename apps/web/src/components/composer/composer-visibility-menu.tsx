import { Loader2Icon, LockIcon, SendIcon, UsersIcon } from "lucide-react";
import type { MemoVisibility } from "@/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The composer's right rail: the personal/team visibility picker (only for
 * members who can choose) and the round send button, which submits the form.
 * The current visibility decides which of the two items is inert, so picking
 * the active one is a no-op rather than a redundant draft write.
 */
export function ComposerVisibilityMenu({
  showVisibility,
  visibility,
  isPending,
  isUploadingImages,
  canSubmit,
  voiceActive,
  onVisibilityChange,
}: {
  showVisibility: boolean;
  visibility: MemoVisibility;
  isPending: boolean;
  isUploadingImages: boolean;
  canSubmit: boolean;
  voiceActive: boolean;
  /** Records the pick in the draft and persists the per-space preference. */
  onVisibilityChange: (visibility: MemoVisibility) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 items-center gap-1.5 self-center">
      {showVisibility && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t("composer.visibility.aria")}
                className={cn(
                  "h-7 gap-1 rounded-full border px-2 text-xs transition-colors",
                  visibility === "protected"
                    ? "border-brand-500/40 bg-brand-50/60 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "border-border/60 bg-card text-muted-foreground hover:text-foreground",
                )}
                disabled={isPending}
                size="sm"
                type="button"
                variant="ghost"
              />
            }
          >
            {visibility === "protected" ? (
              <UsersIcon data-icon="inline-start" className="size-3.5" />
            ) : (
              <LockIcon data-icon="inline-start" className="size-3.5" />
            )}
            <span
              className={cn(visibility === "private" && "hidden sm:inline")}
            >
              {visibility === "protected"
                ? t("composer.visibility.team")
                : t("composer.visibility.personal")}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                if (visibility === "protected") return;
                onVisibilityChange("private");
              }}
            >
              <LockIcon />
              {t("composer.visibility.personal")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (visibility !== "protected") return;
                onVisibilityChange("protected");
              }}
            >
              <UsersIcon />
              {t("composer.visibility.team")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {/* flomo's round send: the icon is the affordance, the label lives
          in the aria name. */}
      <Button
        aria-label={t("composer.send")}
        className="size-8 rounded-full"
        disabled={isPending || isUploadingImages || !canSubmit || voiceActive}
        size="icon-sm"
        type="submit"
        variant="brand"
      >
        {isPending ? (
          <Loader2Icon className="motion-safe:animate-spin" />
        ) : (
          <SendIcon className="motion-safe:animate-scale-in" />
        )}
      </Button>
    </div>
  );
}
