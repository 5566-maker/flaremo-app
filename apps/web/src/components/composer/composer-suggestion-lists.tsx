import { Link2Icon } from "lucide-react";
import type { Memo } from "@/api";
import type { TagSuggestion } from "@/lib/tag-autocomplete";

/**
 * "#tag" autocomplete rows. The list is a plain (non-focusable) overlay: the
 * buttons keep the editor selection on mousedown so the picked tag rewrites
 * the token that opened the list.
 */
export function ComposerTagSuggestions({
  visible,
  suggestions,
  onAccept,
}: {
  visible: boolean;
  suggestions: TagSuggestion[];
  onAccept: (name: string) => void;
}) {
  if (!visible) return null;
  return (
    <div
      className="absolute inset-x-4 bottom-12 z-30 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md motion-safe:animate-rise"
      data-testid="composer-tag-suggestions"
    >
      {suggestions.map((suggestion) => (
        <button
          className="flex w-full items-center justify-between gap-3 rounded-md px-3.5 py-1.5 text-left text-sm text-muted-foreground motion-safe:transition-colors hover:bg-muted/60 hover:text-foreground"
          key={suggestion.name}
          type="button"
          onMouseDown={(event) => {
            // Keep editor focus/selection so the rewritten caret lands.
            event.preventDefault();
            onAccept(suggestion.name);
          }}
        >
          <span className="truncate">
            <span className="text-muted-foreground">#</span>
            {suggestion.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {suggestion.count}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * "[[" wikilink autocomplete rows: the note's first line as the link title,
 * with its date on the right. Same mousedown contract as the tag list.
 */
export function ComposerWikiSuggestions({
  visible,
  suggestions,
  onAccept,
}: {
  visible: boolean;
  suggestions: Memo[];
  onAccept: (memo: Memo) => void;
}) {
  if (!visible) return null;
  return (
    <div
      className="absolute inset-x-4 bottom-12 z-30 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md motion-safe:animate-rise divide-y divide-border/20"
      data-testid="composer-wikilink-suggestions"
    >
      {suggestions.map((memo) => {
        const preview = memo.content.split("\n")[0]?.slice(0, 50) || memo.id;
        return (
          <button
            className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm text-muted-foreground motion-safe:transition-colors hover:bg-muted/60 hover:text-foreground cursor-pointer"
            key={memo.name}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onAccept(memo);
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Link2Icon className="size-3.5 shrink-0 text-primary" />
              <span className="truncate font-medium text-foreground text-xs">
                {preview}
              </span>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {(memo.display_time ?? memo.create_time)?.slice(0, 10)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
