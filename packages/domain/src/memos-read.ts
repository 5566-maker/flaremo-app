import {
  type ListMemosQuery,
  type MemoSpace,
  type MemoStatsQuery,
  type MemoStatsResponse,
  parseMemoSearchQuery,
} from "@flaremo/contracts";
import type { FlareMoDb, MemoRow } from "@flaremo/db";
import { attachments, memos, memoTags } from "@flaremo/db";
import { and, asc, desc, eq, gt, gte, inArray, lt, or, sql } from "drizzle-orm";
import { NotFoundError, ValidationError } from "./errors";
import { compileMemoFilter } from "./memo-filter";
import { DEFAULT_MEMO_FILTER_SCAN_LIMIT } from "./memos-helpers";
import {
  buildActivity,
  buildFtsQuery,
  createDateKeyFormatter,
  decodePageToken,
  encodePageToken,
  escapeLike,
  memoSearchScopeToState,
  toUtcDayStart,
} from "./memos-query";
import { normalizeMemoTags } from "./tags";
import {
  memoReadScope,
  scopedReadScope,
  spaceScope,
  type TeamViewer,
} from "./team-permissions";

export type MemoListResult = {
  memos: MemoRow[];
  nextPageToken?: string;
};

export async function listMemos(
  db: FlareMoDb,
  user: TeamViewer,
  query: ListMemosQuery,
  options: MemoFilterOptions = {},
): Promise<MemoListResult> {
  return listMemosForViewer(db, user, query, options);
}

/** Optional list-scanning knobs threaded from the worker's env. */
export type MemoFilterOptions = {
  /** Upper bound for candidate rows scanned for a not-fully-translatable CEL filter. */
  celScanLimit?: number;
};

/**
 * List memos using the same visibility boundary as the Memos API. An
 * anonymous viewer is intentionally restricted to normal public memos. Active
 * members receive their own rows plus normal team/public rows, while team
 * administrators may also manage non-private archived or trashed rows.
 */
export async function listMemosForViewer(
  db: FlareMoDb,
  user: TeamViewer | null,
  query: ListMemosQuery,
  options: MemoFilterOptions = {},
): Promise<MemoListResult> {
  const search = parseMemoSearchQuery(query.q);
  const celFilter = compileMemoFilter(query.filter);
  const cursor = query.page_token
    ? decodePageToken(query.page_token, query.order_by)
    : undefined;
  const direction = query.order_by.endsWith(" asc") ? "asc" : "desc";
  const orderColumn = query.order_by.startsWith("updated_at")
    ? memos.updatedAt
    : memos.createdAt;
  const filters = [memoReadScope(user)];
  const spaceFilter = spaceScope(user, query.space);
  if (spaceFilter) filters.push(spaceFilter);
  if (celFilter?.sqlPredicate) filters.push(celFilter.sqlPredicate);

  // The established `state` query parameter wins over a search scope so that
  // Memos-compatible clients retain their existing filtering semantics.
  const searchState = query.state ?? memoSearchScopeToState(search.scope);
  if (searchState) {
    filters.push(eq(memos.status, searchState));
  } else if (query.q?.trim() && !query.include_deleted) {
    // Full-text search is intentionally broader than the timeline: archived
    // notes stay discoverable, while trashed notes remain opt-in via in:trash.
    filters.push(inArray(memos.status, ["normal", "archived"]));
  } else if (!query.include_deleted) {
    filters.push(eq(memos.status, "normal"));
  }

  if (query.visibility) {
    filters.push(eq(memos.visibility, query.visibility));
  }

  let likeScanFallback = false;
  if (search.text) {
    const ftsQuery = buildFtsQuery(search.text);
    if (ftsQuery) {
      filters.push(sql`${memos.id} IN (
        SELECT memo_id FROM memos_fts WHERE memos_fts MATCH ${ftsQuery}
      )`);
    } else {
      // Non-Latin text (CJK and friends) cannot use the unicode61 FTS index,
      // so the query falls back to a LIKE scan. It is bounded by the same
      // scan-limit window as CEL filters below instead of scanning the
      // author's whole corpus on every keystroke.
      likeScanFallback = true;
      filters.push(
        sql`${memos.content} LIKE ${`%${escapeLike(search.text)}%`} ESCAPE '\\'`,
      );
    }
  }

  if (search.hasAttachment) {
    filters.push(
      sql`EXISTS (
        SELECT 1 FROM ${attachments}
        WHERE ${attachments.memoId} = ${memos.id}
          AND ${attachments.deletedAt} IS NULL
          AND ${attachments.state} = 'ready'
      )`,
    );
  }

  if (search.isPinned) {
    filters.push(eq(memos.pinned, true));
  }

  if (search.after) {
    filters.push(gte(memos.createdAt, toUtcDayStart(search.after)));
  }

  if (search.before) {
    filters.push(lt(memos.createdAt, toUtcDayStart(search.before)));
  }

  if (query.tag) {
    const tag = normalizeMemoTags([query.tag])[0];
    if (!tag) {
      return { memos: [] };
    }
    // Hierarchical tag filter: `工作` matches `工作` and any descendant
    // (`工作/项目A`), while `工作/项目A` matches itself and deeper children.
    // The candidate set is exact-equals plus LIKE-prefix with the separator.
    const escapedPrefix = escapeLike(`${tag}/`);
    filters.push(
      sql`EXISTS (
        SELECT 1 FROM ${memoTags}
        WHERE ${memoTags.memoId} = ${memos.id}
          AND (
            ${memoTags.tag} = ${tag}
            OR ${memoTags.tag} LIKE ${`${escapedPrefix}%`} ESCAPE '\\'
          )
      )`,
    );
  }

  if (query.untagged) {
    filters.push(
      sql`NOT EXISTS (
        SELECT 1 FROM ${memoTags}
        WHERE ${memoTags.memoId} = ${memos.id}
      )`,
    );
  }

  if (cursor) {
    const sortFilter =
      direction === "asc"
        ? or(
            gt(orderColumn, cursor.sortValue),
            and(eq(orderColumn, cursor.sortValue), gt(memos.id, cursor.id)),
          )
        : or(
            lt(orderColumn, cursor.sortValue),
            and(eq(orderColumn, cursor.sortValue), lt(memos.id, cursor.id)),
          );
    const cursorFilter = or(
      sql`${memos.pinned} < ${cursor.pinned ? 1 : 0}`,
      and(eq(memos.pinned, cursor.pinned), sortFilter),
    );
    if (cursorFilter) filters.push(cursorFilter);
  }

  const orderedQuery = db
    .select()
    .from(memos)
    .where(and(...filters.filter(Boolean)))
    .orderBy(
      desc(memos.pinned),
      direction === "asc" ? asc(orderColumn) : desc(orderColumn),
      direction === "asc" ? asc(memos.id) : desc(memos.id),
    );
  // Never hydrate an unbounded candidate set for a user-supplied expression.
  // If the bounded window contains a complete page plus a lookahead match,
  // the existing cursor safely resumes after that page. Otherwise require a
  // narrower query rather than silently claiming that a partial scan is final.
  // A CEL filter that fully translates to SQL (checked by completeInSql) is
  // evaluated by SQLite itself and needs neither the JS scan nor the limit.
  const fullyPushedDown = celFilter?.completeInSql === true;
  const scanLimit = options.celScanLimit ?? DEFAULT_MEMO_FILTER_SCAN_LIMIT;
  const jsScan = (celFilter && !fullyPushedDown) || likeScanFallback;
  if (celFilter && !fullyPushedDown) {
    // Probe cheaply (id only) before hydrating full rows, so an abusive
    // expression costs an index-shaped scan instead of 5000 full-row reads.
    const probe = await db
      .select({ id: memos.id })
      .from(memos)
      .where(and(...filters.filter(Boolean)))
      .orderBy(
        desc(memos.pinned),
        direction === "asc" ? asc(orderColumn) : desc(orderColumn),
        direction === "asc" ? asc(memos.id) : desc(memos.id),
      )
      .limit(scanLimit + 1);
    if (probe.length > scanLimit && !likeScanFallback) {
      throw new ValidationError(
        `Filter scan limit reached (${scanLimit} memos). Narrow the query using a tag, date range, state, or visibility.`,
      );
    }
  }
  const candidates = await orderedQuery.limit(
    jsScan ? scanLimit + 1 : query.page_size + 1,
  );
  const rows =
    celFilter && !fullyPushedDown
      ? candidates.slice(0, scanLimit).filter((memo) => celFilter(memo, user))
      : candidates;
  if (candidates.length > scanLimit && rows.length <= query.page_size) {
    throw new ValidationError(
      `Search scan limit reached (${scanLimit} memos). Narrow the query using a tag, date range, state, or visibility.`,
    );
  }

  const page = rows.slice(0, query.page_size);
  const next = rows.length > query.page_size ? page.at(-1) : undefined;

  return {
    memos: page,
    nextPageToken: next
      ? encodePageToken({
          id: next.id,
          orderBy: query.order_by,
          pinned: next.pinned,
          sortValue: query.order_by.startsWith("updated_at")
            ? next.updatedAt
            : next.createdAt,
        })
      : undefined,
  };
}

/**
 * Team-wide per-user memo totals for the Memos ListAllUserStats RPC — the
 * only fields its DTO consumes. Two grouped queries replace the per-user
 * stat fan-out; users without memos are absent from the map and default to
 * zero upstream. Counting semantics mirror getMemoStats (total excludes
 * trashed).
 */
export async function listMemoTotalsByUser(db: FlareMoDb) {
  const [countRows, tagRows] = await Promise.all([
    db
      .select({
        userId: memos.userId,
        total:
          sql<number>`SUM(CASE WHEN ${memos.status} IN ('normal', 'archived') THEN 1 ELSE 0 END)`.mapWith(
            Number,
          ),
      })
      .from(memos)
      .groupBy(memos.userId),
    db
      .select({
        userId: memos.userId,
        name: memoTags.tag,
        count: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(memoTags)
      .innerJoin(memos, eq(memoTags.memoId, memos.id))
      .where(inArray(memos.status, ["normal", "archived"]))
      .groupBy(memos.userId, memoTags.tag),
  ]);
  const totals = new Map<
    string,
    { total: number; tags: Map<string, number> }
  >();
  for (const row of countRows) {
    totals.set(row.userId, { total: row.total ?? 0, tags: new Map() });
  }
  for (const row of tagRows) {
    const entry = totals.get(row.userId);
    if (entry) entry.tags.set(row.name, row.count);
  }
  return totals;
}

export type MemoStatsOptions = {
  /**
   * Space partition for the workspace sidebar. Absent keeps the historical
   * own-corpus semantics the Memos-compatible clients depend on; when set,
   * every number (counts, tags, activity) obeys the same read scope plus
   * space partition as the corresponding list view.
   */
  space?: MemoSpace;
};

export async function getMemoStats(
  db: FlareMoDb,
  user: TeamViewer,
  query: MemoStatsQuery,
  options: MemoStatsOptions = {},
): Promise<MemoStatsResponse> {
  const dateKeyFormatter = createDateKeyFormatter(query.time_zone);
  const todayKey = dateKeyFormatter(new Date());
  const recentCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const corpus = options.space
    ? scopedReadScope(user, options.space)
    : eq(memos.userId, user.id);
  const normalOrArchived = inArray(memos.status, ["normal", "archived"]);

  const [countRow, tagRows, activeDayRows, recentRows, spaceCountRows] =
    await Promise.all([
      db
        .select({
          normal:
            sql<number>`SUM(CASE WHEN ${memos.status} = 'normal' THEN 1 ELSE 0 END)`.mapWith(
              Number,
            ),
          archived:
            sql<number>`SUM(CASE WHEN ${memos.status} = 'archived' THEN 1 ELSE 0 END)`.mapWith(
              Number,
            ),
          trashed:
            sql<number>`SUM(CASE WHEN ${memos.status} = 'trashed' THEN 1 ELSE 0 END)`.mapWith(
              Number,
            ),
          total:
            sql<number>`SUM(CASE WHEN ${memos.status} IN ('normal', 'archived') THEN 1 ELSE 0 END)`.mapWith(
              Number,
            ),
        })
        .from(memos)
        .where(corpus)
        .get(),
      db
        .select({
          name: memoTags.tag,
          count: sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(memoTags)
        .innerJoin(memos, eq(memoTags.memoId, memos.id))
        .where(
          options.space
            ? and(corpus, normalOrArchived)
            : and(
                eq(memoTags.userId, user.id),
                inArray(memos.status, ["normal", "archived"]),
              ),
        )
        .groupBy(memoTags.tag)
        .orderBy(asc(memoTags.tag)),
      db
        .select({ day: sql<string>`substr(${memos.createdAt}, 1, 10)` })
        .from(memos)
        .where(and(corpus, normalOrArchived))
        .groupBy(sql`substr(${memos.createdAt}, 1, 10)`),
      db
        .select({ createdAt: memos.createdAt })
        .from(memos)
        .where(
          and(
            corpus,
            normalOrArchived,
            gte(memos.createdAt, recentCutoff.toISOString()),
          ),
        ),
      // Sidebar badges for the two spaces, computed under the same read
      // boundary as the mixed timeline. Only requested with a space.
      options.space
        ? Promise.all([
            db
              .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
              .from(memos)
              .where(
                and(
                  scopedReadScope(user, "personal"),
                  eq(memos.status, "normal"),
                ),
              ),
            db
              .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
              .from(memos)
              .where(
                and(scopedReadScope(user, "team"), eq(memos.status, "normal")),
              ),
          ])
        : undefined,
    ]);

  const activityCounts = new Map<string, number>();
  for (const row of recentRows) {
    const date = new Date(row.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dateKeyFormatter(date);
    activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1);
  }

  const [personalCountRows, teamCountRows] = spaceCountRows ?? [[], []];
  return {
    counts: {
      normal: countRow?.normal ?? 0,
      archived: countRow?.archived ?? 0,
      trashed: countRow?.trashed ?? 0,
      total: countRow?.total ?? 0,
      ...(options.space
        ? {
            spaces: {
              personal: personalCountRows[0]?.count ?? 0,
              team: teamCountRows[0]?.count ?? 0,
            },
          }
        : {}),
    },
    active_days: activeDayRows.length,
    tags: tagRows,
    activity: buildActivity(todayKey, activityCounts),
  };
}

export async function getMemoById(
  db: FlareMoDb,
  user: TeamViewer,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<MemoRow> {
  return getMemoByIdForViewer(db, user, id, options);
}

/**
 * Resolve a memo for a read-only viewer without ever substituting the owner
 * user for an anonymous request. This prevents a public request from
 * inheriting the owner's private timeline by accident.
 */
export async function getMemoByIdForViewer(
  db: FlareMoDb,
  user: TeamViewer | null,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<MemoRow> {
  const filters = [eq(memos.id, id), memoReadScope(user)];
  if (!options.includeDeleted) {
    filters.push(inArray(memos.status, ["normal", "archived", "trashed"]));
  }

  const row = await db
    .select()
    .from(memos)
    .where(and(...filters.filter(Boolean)))
    .get();

  if (!row) {
    throw new NotFoundError("Memo not found");
  }

  return row;
}

export async function getMemoByClientId(
  db: FlareMoDb,
  userId: string,
  clientId: string,
): Promise<MemoRow | undefined> {
  return db
    .select()
    .from(memos)
    .where(and(eq(memos.userId, userId), eq(memos.clientId, clientId)))
    .get();
}
