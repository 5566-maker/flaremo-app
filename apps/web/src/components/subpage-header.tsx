import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

type SubpageHeaderProps = {
  /** Page title. Omit on pages that render their own heading inside the body. */
  title?: ReactNode;
  /** Secondary line under the title: account email, capture hint, ... */
  subtitle?: ReactNode;
  /** Trailing controls, pinned to the end of the row. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Shared header for subpages: back link, title block, and page actions in a
 * single row so the page chrome stays one band tall.
 */
export function SubpageHeader({
  actions,
  className,
  subtitle,
  title,
}: SubpageHeaderProps) {
  const { t } = useI18n();
  return (
    <header className={cn("flex items-center gap-3", className)}>
      <Button
        className="shrink-0"
        render={
          <Link
            search={{
              q: undefined,
              tag: undefined,
              view: undefined,
              space: undefined,
              untagged: undefined,
              compose: undefined,
            }}
            to="/"
          />
        }
        size="sm"
        variant="ghost"
      >
        <ArrowLeftIcon className="rtl:-rotate-180" data-icon="inline-start" />
        {t("common.back")}
      </Button>
      {title ? (
        <>
          <span aria-hidden="true" className="h-7 w-px shrink-0 bg-border" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate font-heading text-base font-semibold sm:text-lg">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <span className="flex-1" />
      )}
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
