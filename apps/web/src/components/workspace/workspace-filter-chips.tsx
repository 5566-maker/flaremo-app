import { CalendarIcon, XIcon } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { useI18n } from "@/i18n";
import { formatDayTitle } from "@/lib/calendar-date";

/**
 * The active-filter chip row above the timeline: the global-search note, the
 * removable day filter, tag and untagged chips, and clear-all.
 */
export function WorkspaceFilterChips({
  activeTag,
  clearFilters,
  dayFilter,
  hasFilters,
  isSemanticSearch,
  query,
  setActiveTag,
  setQuery,
  setUntagged,
  untagged,
}: {
  activeTag?: string;
  clearFilters: () => void;
  dayFilter: string | null;
  hasFilters: boolean;
  isSemanticSearch: boolean;
  query: string;
  setActiveTag: (tag: string | undefined) => void;
  setQuery: (q: string) => void;
  setUntagged: (untagged: boolean) => void;
  untagged: boolean;
}) {
  const { locale, t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground motion-safe:animate-rise">
      {query.trim() && !dayFilter && !isSemanticSearch && (
        <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
          {t("search.globalScope")}
          <InfoTip text={t("search.syntaxHint")} />
        </span>
      )}
      {dayFilter && (
        <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
          <CalendarIcon aria-hidden="true" className="size-3 shrink-0" />
          {formatDayTitle(dayFilter, locale)}
          <button
            aria-label={t("filter.clearDate")}
            className="-mr-1 rounded p-0.5 hover:text-foreground"
            type="button"
            onClick={() => setQuery("")}
          >
            <XIcon className="size-3.5" />
          </button>
        </span>
      )}
      {activeTag && (
        <button
          aria-label={t("filter.clearTag", { tag: activeTag })}
          className="flex min-h-8 items-center gap-1 rounded-md bg-muted px-2 py-1 motion-safe:transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          type="button"
          onClick={() => setActiveTag(undefined)}
        >
          #{activeTag}
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      )}
      {untagged && (
        <button
          className="flex min-h-8 items-center gap-1 rounded-md bg-muted px-2 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={t("filter.clearUntagged")}
          type="button"
          onClick={() => setUntagged(false)}
        >
          {t("explorer.untagged")}
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      )}
      {hasFilters && (
        <button
          className="rounded-md px-2 py-1 motion-safe:transition-colors hover:bg-muted hover:text-foreground"
          type="button"
          onClick={clearFilters}
        >
          {t("common.clearFilters")}
        </button>
      )}
    </div>
  );
}
