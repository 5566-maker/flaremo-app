/**
 * Centralized TanStack Query cache keys for the web app.
 *
 * Every `queryKey` literal used across `apps/web/src` must come from this
 * module: these keys are the invalidation anchors of the query cache, and a
 * typo in a hand-written literal silently breaks invalidation. Key string
 * values here are frozen — do not rename them.
 */
export const queryKeys = {
  /** Task lists. Bare form = "all"; second element = project id or "trash". */
  tasks: {
    all: ["tasks"] as const,
    byProject: (projectId: string) => ["tasks", projectId] as const,
    trash: () => ["tasks", "trash"] as const,
  },
  currentUser: ["current-flaremo-user"] as const,
  adminUsers: ["admin-users"] as const,
  adminBranding: ["admin-branding"] as const,
  /**
   * Capture pipeline status, scoped per user id ("" = unknown user).
   * `all` is the bare key — invalidating it hits every per-user entry.
   */
  captureStatus: {
    all: ["capture-status"] as const,
    forUser: (userId: string | undefined) =>
      ["capture-status", userId] as const,
  },
} as const;
