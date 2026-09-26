import type { FlareMoDb, MemoRow, UserRow } from "@flaremo/db";
import { memoRelations, memos, memoTags, tasks, users } from "@flaremo/db";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "./errors";
import { parseResourceName } from "./ids";
import { getMemoById } from "./memos";
import { insertMemoNotification } from "./memos-user";

export type WalkVia =
  | { type: "tag"; tag: string }
  | { type: "relation" }
  | { type: "jump" };

const DAILY_REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "On this day" review: normal memos whose creation month-day matches the
 * given local date, excluding memos created on that exact date. The caller
 * passes the viewer's local date and UTC offset (minutes ahead of UTC) so
 * month-day comparisons stay in the viewer's frame without a server
 * time-zone guess.
 */
export async function listDailyReviewMemos(
  db: FlareMoDb,
  user: UserRow,
  input: { date: string; tzOffset?: number },
): Promise<MemoRow[]> {
  const date = input.date.trim();
  if (!DAILY_REVIEW_DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
    throw new ValidationError("Invalid review date");
  }
  const tzOffset = input.tzOffset ?? 0;
  const monthDay = date.slice(5);
  return db
    .select()
    .from(memos)
    .where(
      and(
        eq(memos.userId, user.id),
        eq(memos.status, "normal"),
        sql`substr(datetime(${memos.createdAt}, printf('%+d minutes', ${tzOffset})), 6, 5) = ${monthDay}`,
        sql`substr(datetime(${memos.createdAt}, printf('%+d minutes', ${tzOffset})), 1, 10) != ${date}`,
      ),
    )
    .orderBy(asc(memos.createdAt), asc(memos.id));
}

/**
 * File one "daily review" inbox row per user for the given UTC date. The
 * source event id (`daily-review:<date>`) plus the receiver/source/type
 * unique index make cron retries idempotent; a user without on-this-day
 * history simply gets nothing. Returns the number of rows created.
 */
export async function createDailyReviewNotifications(
  db: FlareMoDb,
  input: { date: string },
): Promise<number> {
  const date = input.date.trim();
  if (!DAILY_REVIEW_DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
    throw new ValidationError("Invalid review date");
  }
  // One scan over the normal memo corpus grouped in memory replaces the
  // users × per-user double fan-out; UTC month-day is a direct substr on the
  // ISO timestamp, so no per-row datetime() arithmetic is needed.
  const monthDay = date.slice(5);
  const rows = await db
    .select({ id: memos.id, userId: memos.userId, createdAt: memos.createdAt })
    .from(memos)
    .where(
      and(
        eq(memos.status, "normal"),
        sql`substr(${memos.createdAt}, 6, 5) = ${monthDay}`,
        sql`substr(${memos.createdAt}, 1, 10) != ${date}`,
      ),
    );
  const anchorByUser = new Map<string, string>();
  for (const row of rows) {
    const current = anchorByUser.get(row.userId);
    if (!current || row.createdAt > current) {
      anchorByUser.set(row.userId, row.id);
    }
  }
  const allUsers = await db.select({ id: users.id }).from(users);
  const activeUserIds = new Set(allUsers.map((user) => user.id));
  let created = 0;
  for (const [receiverId, anchorId] of anchorByUser) {
    if (!activeUserIds.has(receiverId)) continue;
    const inserted = await insertMemoNotification(db, {
      receiverId,
      senderId: receiverId,
      type: "daily_review",
      sourceEventId: `daily-review:${date}`,
      memoId: anchorId,
    });
    if (inserted.meta.changes > 0) created += 1;
  }
  return created;
}

/**
 * Pick one random normal memo outside the exclusion set. Exclusions are
 * applied in memory rather than as bound parameters so long random walks
 * cannot exceed D1's bound-parameter limit.
 */
const RANDOM_SAMPLE_WINDOW = 64;

export async function getRandomMemo(
  db: FlareMoDb,
  user: UserRow,
  excludeIds: string[] = [],
): Promise<MemoRow | null> {
  const excluded = new Set(excludeIds);
  // Sample a bounded random window instead of pulling every memo id; for a
  // long walk the fallback below covers the rare all-excluded case.
  const sampled = await db
    .select({ id: memos.id })
    .from(memos)
    .where(and(eq(memos.userId, user.id), eq(memos.status, "normal")))
    .orderBy(sql`random()`)
    .limit(RANDOM_SAMPLE_WINDOW);
  const pickedId = sampled.find((row) => !excluded.has(row.id))?.id;
  if (!pickedId) {
    // Fall back to a full scan only when the sampled window is exhausted.
    const rows = await db
      .select({ id: memos.id })
      .from(memos)
      .where(and(eq(memos.userId, user.id), eq(memos.status, "normal")));
    const candidates = rows.filter((row) => !excluded.has(row.id));
    if (candidates.length === 0) return null;
    return (
      (await db
        .select()
        .from(memos)
        .where(eq(memos.id, pickRandom(candidates).id))
        .get()) ?? null
    );
  }
  return (
    (await db.select().from(memos).where(eq(memos.id, pickedId)).get()) ?? null
  );
}

/**
 * Continue a random walk from `memoId`: prefer a normal memo sharing a tag,
 * then a memo connected through memo_relations (either direction), and
 * finally a completely unrelated random memo ("jump"). Returns null when
 * every normal memo has already been walked through.
 */
export async function getWalkNextMemo(
  db: FlareMoDb,
  user: UserRow,
  memoId: string,
  excludeIds: string[] = [],
): Promise<{ memo: MemoRow | null; via: WalkVia | null }> {
  const normalizedMemoId = parseResourceName(memoId.trim(), "memos");
  if (!normalizedMemoId || normalizedMemoId === "memos/") {
    throw new ValidationError("Invalid memo id");
  }
  await getMemoById(db, user, normalizedMemoId);
  const excluded = new Set([normalizedMemoId, ...excludeIds]);

  const sourceTags = (
    await db
      .select({ tag: memoTags.tag })
      .from(memoTags)
      .where(and(eq(memoTags.memoId, normalizedMemoId)))
  ).map((row) => row.tag);

  if (sourceTags.length > 0) {
    const tagCandidates = (
      await db
        .select({ memoId: memoTags.memoId, tag: memoTags.tag })
        .from(memoTags)
        .innerJoin(memos, eq(memoTags.memoId, memos.id))
        .where(
          and(
            eq(memoTags.userId, user.id),
            inArray(memoTags.tag, sourceTags),
            eq(memos.status, "normal"),
          ),
        )
        .orderBy(sql`random()`)
        .limit(RANDOM_SAMPLE_WINDOW)
    ).filter((row) => !excluded.has(row.memoId));
    if (tagCandidates.length > 0) {
      const picked = pickRandom(tagCandidates);
      const memo = await db
        .select()
        .from(memos)
        .where(eq(memos.id, picked.memoId))
        .get();
      if (memo) return { memo, via: { type: "tag", tag: picked.tag } };
    }
  }

  const relations = await db
    .select({
      memoId: memoRelations.memoId,
      relatedMemoId: memoRelations.relatedMemoId,
    })
    .from(memoRelations)
    .where(
      or(
        eq(memoRelations.memoId, normalizedMemoId),
        eq(memoRelations.relatedMemoId, normalizedMemoId),
      ),
    );
  const relatedIds = [
    ...new Set(
      relations.map((relation) =>
        relation.memoId === normalizedMemoId
          ? relation.relatedMemoId
          : relation.memoId,
      ),
    ),
  ].filter((id) => !excluded.has(id));
  if (relatedIds.length > 0) {
    const related = await db
      .select()
      .from(memos)
      .where(
        and(
          eq(memos.userId, user.id),
          eq(memos.status, "normal"),
          inArray(memos.id, relatedIds),
        ),
      );
    if (related.length > 0) {
      return { memo: pickRandom(related), via: { type: "relation" } };
    }
  }

  const memo = await getRandomMemo(db, user, [...excluded]);
  return memo ? { memo, via: { type: "jump" } } : { memo: null, via: null };
}

export type RelatedMemo = {
  memo: MemoRow;
  sharedTags: string[];
  viaRelation: boolean;
};

/**
 * Lightweight "related notes": rank normal memos by direct relation (either
 * direction, strongest signal) plus the number of shared exact tags. This is
 * the pre-Vectorize version of flomo's related notes; semantic ranking can
 * replace the scoring later without changing the route contract.
 */
export async function listRelatedMemos(
  db: FlareMoDb,
  user: UserRow,
  memoId: string,
  input: { limit?: number } = {},
): Promise<RelatedMemo[]> {
  const normalizedMemoId = parseResourceName(memoId.trim(), "memos");
  if (!normalizedMemoId || normalizedMemoId === "memos/") {
    throw new ValidationError("Invalid memo id");
  }
  await getMemoById(db, user, normalizedMemoId);
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);

  const sourceTags = (
    await db
      .select({ tag: memoTags.tag })
      .from(memoTags)
      .where(eq(memoTags.memoId, normalizedMemoId))
  ).map((row) => row.tag);

  const sharedTagsByMemo = new Map<string, Set<string>>();
  if (sourceTags.length > 0) {
    const rows = await db
      .select({ memoId: memoTags.memoId, tag: memoTags.tag })
      .from(memoTags)
      .innerJoin(memos, eq(memoTags.memoId, memos.id))
      .where(
        and(
          eq(memoTags.userId, user.id),
          inArray(memoTags.tag, sourceTags),
          eq(memos.status, "normal"),
        ),
      );
    for (const row of rows) {
      if (row.memoId === normalizedMemoId) continue;
      const tags = sharedTagsByMemo.get(row.memoId) ?? new Set<string>();
      tags.add(row.tag);
      sharedTagsByMemo.set(row.memoId, tags);
    }
  }

  const relations = await db
    .select({
      memoId: memoRelations.memoId,
      relatedMemoId: memoRelations.relatedMemoId,
    })
    .from(memoRelations)
    .where(
      or(
        eq(memoRelations.memoId, normalizedMemoId),
        eq(memoRelations.relatedMemoId, normalizedMemoId),
      ),
    );
  const relatedIds = new Set(
    relations.map((relation) =>
      relation.memoId === normalizedMemoId
        ? relation.relatedMemoId
        : relation.memoId,
    ),
  );

  const candidateIds = [
    ...new Set([...sharedTagsByMemo.keys(), ...relatedIds]),
  ];
  if (candidateIds.length === 0) return [];
  const rows = await db
    .select()
    .from(memos)
    .where(
      and(
        eq(memos.userId, user.id),
        eq(memos.status, "normal"),
        inArray(memos.id, candidateIds),
      ),
    );

  return rows
    .map((memo) => ({
      memo,
      sharedTags: [...(sharedTagsByMemo.get(memo.id) ?? [])].sort(),
      viaRelation: relatedIds.has(memo.id),
    }))
    .sort(
      (a, b) =>
        relatedScore(b) - relatedScore(a) ||
        b.memo.createdAt.localeCompare(a.memo.createdAt) ||
        a.memo.id.localeCompare(b.memo.id),
    )
    .slice(0, limit);
}

function relatedScore(entry: RelatedMemo): number {
  return (entry.viaRelation ? 3 : 0) + entry.sharedTags.length;
}

function pickRandom<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error("pickRandom requires a non-empty array");
  }
  return item;
}

/**
 * File one "task overdue" inbox row per overdue, unfinished task. The source
 * event id (`task-overdue:<taskId>:<dueDate>`) makes cron retries idempotent;
 * rescheduling the task produces a new event id on the next sweep. The task
 * title travels in the row's `snippet` since tasks have no memo anchor.
 * Returns the number of rows created.
 */
export async function createOverdueTaskNotifications(
  db: FlareMoDb,
  input: { date: string },
): Promise<number> {
  const date = input.date.trim();
  if (!DAILY_REVIEW_DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
    throw new ValidationError("Invalid review date");
  }
  const overdue = await db
    .select({
      id: tasks.id,
      userId: tasks.userId,
      title: tasks.title,
      dueAt: tasks.dueAt,
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        lt(tasks.dueAt, date),
        inArray(tasks.status, ["todo", "in_progress"]),
      ),
    )
    .limit(500);
  let created = 0;
  for (const task of overdue) {
    const inserted = await insertMemoNotification(db, {
      receiverId: task.userId,
      senderId: task.userId,
      type: "task_overdue",
      sourceEventId: `task-overdue:${task.id}:${task.dueAt}`,
      snippet: task.title,
    });
    if (inserted.meta.changes > 0) created += 1;
  }
  return created;
}
