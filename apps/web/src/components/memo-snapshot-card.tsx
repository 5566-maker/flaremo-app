import { Link } from "@tanstack/react-router";
import type { Memo } from "@/api";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { LazyMemoContent } from "@/components/lazy-memo-content";
import { Card, CardContent } from "@/components/ui/card";
import { formatMemoTime, getMemoResourceId } from "@/lib/memo";

/** Read-only memo card used by review surfaces (daily review, random walk). */
export function MemoSnapshotCard({
  badge,
  locale,
  memo,
}: {
  badge?: string | null;
  locale: string;
  memo: Memo;
}) {
  const id = getMemoResourceId(memo);
  return (
    <Card className="motion-safe:transition-[border-color,box-shadow] motion-safe:duration-150 hover:border-border hover:shadow-xs">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            params={{ memoId: memo.id || id }}
            to="/memo/$memoId"
          >
            <time>
              {formatMemoTime(memo.display_time ?? memo.create_time, locale)}
            </time>
          </Link>
          {badge && (
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-400/12 dark:text-brand-200">
              {badge}
            </span>
          )}
        </div>
        <LazyMemoContent content={memo.content} />
        <AttachmentGallery attachments={memo.attachments ?? []} />
      </CardContent>
    </Card>
  );
}
