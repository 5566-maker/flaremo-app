import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useI18n } from "@/i18n";

// TanStack Router's ErrorComponentProps carries `error: unknown`; narrow it
// defensively instead of assuming an Error instance.
function RouteErrorPage({ error }: { error: unknown }) {
  const { t } = useI18n();
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);
  // A lazy route chunk can fail to load after a new deployment: the open tab
  // still runs the old index.html, so its hashed chunk ids no longer exist.
  // A plain retry re-runs the same stale import; the real fix is to drop the
  // service worker's cached shell (which pins the old document) and reload so
  // the browser fetches the freshly deployed index.html and chunk graph.
  const isChunkLoadFailure =
    /Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      message,
    );
  const retry = async () => {
    if (isChunkLoadFailure) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // Cache clearing is best-effort; the reload below still retries.
      }
      window.location.reload();
      return;
    }
    await router.invalidate();
  };
  // Built from the same component family as the inline QueryErrorState rather
  // than hand-rolled markup: both render `list.errorTitle`, and two hand-rolled
  // versions had already drifted apart (18px/600 here vs 14px/500 inline), so
  // the shared parts are the fix — the surfaces cannot disagree again.
  return (
    <Empty className="min-h-svh text-muted-foreground">
      <EmptyHeader>
        <EmptyMedia
          className="bg-destructive/10 text-destructive"
          variant="icon"
        >
          <CircleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{t("list.errorTitle")}</EmptyTitle>
        {/* The bound message is a technical detail here (it is what a crash or
            a stale chunk id reports), so it keeps the description slot. */}
        <EmptyDescription className="break-words">{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={() => void retry()}>
          {t("common.retry")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

// Typed context makes every route loader's `context.queryClient` known; the
// real QueryClient is injected through RouterProvider's context prop.
export const rootRoute = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => <Outlet />,
  errorComponent: RouteErrorPage,
});
