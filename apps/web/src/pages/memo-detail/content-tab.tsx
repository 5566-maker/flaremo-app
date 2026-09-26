import { Link } from "@tanstack/react-router";
import type { MemoContext, RelatedMemo } from "@/api";
import { MemoReadingView } from "@/components/reading/memo-reading-view";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/i18n";

/**
 * The read view's optional to-do wiring. Absent (undefined) while the viewer
 * cannot manage the memo, which leaves the checkboxes in their read-only state.
 */
export type MemoDetailTaskInteraction = {
  onToggleTask: (lineIndex: number) => void;
  onConvertTask: (lineIndex: number, text: string) => void;
};

export function ContentTab({
  context,
  related,
  relatedPending,
  taskInteraction,
}: {
  context: MemoContext;
  related: RelatedMemo[];
  relatedPending: boolean;
  taskInteraction: MemoDetailTaskInteraction | undefined;
}) {
  const { t } = useI18n();
  return (
    <TabsContent className="flex flex-col gap-5 pt-4" value="content">
      <MemoReadingView
        attachments={context.attachments}
        content={context.memo.content}
        contentClassName="text-base"
        onToggleTask={taskInteraction?.onToggleTask}
        onConvertTask={taskInteraction?.onConvertTask}
      />
      {context.memories.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <h2 className="text-sm font-medium">{t("memory.title")}</h2>
          {context.memories.map((memory) => (
            <div className="rounded-lg border p-3 text-sm" key={memory.id}>
              <div className="whitespace-pre-wrap">{memory.content}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="outline">
                  {t(`memory.type.${memory.type}`)}
                </Badge>
                <Badge variant="outline">
                  {t(`memory.kind.${memory.kind}`)}
                </Badge>
                <Badge variant="brand">
                  {t(`memory.verification.${memory.verification}`)}
                </Badge>
              </div>
            </div>
          ))}
        </section>
      )}
      {relatedPending && (
        <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <h2 className="text-sm font-medium">{t("detail.related")}</h2>
          <Skeleton className="h-16 w-full" />
        </section>
      )}
      {related.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <h2 className="text-sm font-medium">{t("detail.related")}</h2>
          {related.map((memo) => (
            <Link
              className="rounded-lg border p-3 text-sm transition-colors hover:bg-muted"
              key={memo.name}
              params={{ memoId: memo.id }}
              to="/memo/$memoId"
            >
              <div className="line-clamp-2">{memo.content}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {[
                  memo.via_relation ? t("detail.relatedViaRelation") : null,
                  memo.shared_tags.length > 0
                    ? t("detail.relatedSharedTags", {
                        tags: memo.shared_tags
                          .map((tag) => `#${tag}`)
                          .join(" "),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </Link>
          ))}
        </section>
      )}
    </TabsContent>
  );
}
