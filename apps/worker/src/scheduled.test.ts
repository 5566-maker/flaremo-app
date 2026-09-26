import {
  applyFlaremoMigrations,
  attachments,
  createDb,
  dataTasks,
  memos,
  memosNotifications,
  pushSubscriptions,
} from "@flaremo/db";
import {
  createMemo,
  createProject,
  createResourceId,
  createTask,
  ensureSingleUser,
  moveMemoToTrash,
  type PushPayload,
  pushNotificationToUser,
  type TeamViewer,
} from "@flaremo/domain";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlareMoEnv } from "./env";
import { runScheduledMaintenance } from "./index";

const NOW = Date.parse("2026-09-15T03:00:00.000Z");

vi.mock("@flaremo/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@flaremo/domain")>();
  // The default no-op resolves like the real function; scheduled-tasks calls
  // `.catch()` on the result, so a bare vi.fn() would break its callers.
  return { ...actual, pushNotificationToUser: vi.fn(async () => 0) };
});

/** Minimal R2 bucket double covering the maintenance surface: delete + list. */
class FakeR2Bucket {
  objects = new Set<string>();
  deletedKeys: string[][] = [];
  listPrefixes: string[] = [];

  async delete(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    this.deletedKeys.push(list);
    for (const key of list) this.objects.delete(key);
  }
  async list(options: { prefix?: string; cursor?: string }) {
    const prefix = options.prefix ?? "";
    this.listPrefixes.push(prefix);
    return {
      objects: [...this.objects]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })),
      truncated: false,
      cursor: undefined,
    };
  }
}

async function insertAttachment(
  db: ReturnType<typeof createDb>,
  userId: string,
  fields: { memoId?: string | null; createdAt: string },
) {
  const id = createResourceId("attachments");
  await db.insert(attachments).values({
    id,
    userId,
    memoId: fields.memoId ?? null,
    r2Key: `${id}/clip.bin`,
    filename: "clip.bin",
    contentType: "application/octet-stream",
    size: 10,
    state: "ready",
    createdAt: fields.createdAt,
    updatedAt: fields.createdAt,
  });
  return id;
}

describe("scheduled maintenance", () => {
  let mf: Miniflare;
  let db: ReturnType<typeof createDb>;
  let r2: FakeR2Bucket;
  let user: TeamViewer;
  let env: FlareMoEnv;

  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-scheduled-test" },
    });
    const database = await mf.getD1Database("DB");
    db = createDb(database);
    await applyFlaremoMigrations(database);
    user = (await ensureSingleUser(db, {
      email: "owner@example.com",
      name: "Owner",
    })) as TeamViewer;
    r2 = new FakeR2Bucket();
    env = {
      DB: database,
      ATTACHMENTS: r2,
      FLAREMO_EMBEDDING_PROVIDER: "none",
      // Non-empty keys open the web-push branch; the pushNotificationToUser
      // mock keeps the tests off the real crypto path.
      FLAREMO_VAPID_PUBLIC_KEY: "test-public-key",
      FLAREMO_VAPID_PRIVATE_KEY: "test-private-key",
    } as unknown as FlareMoEnv;
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("purges expired trash with its attachments and sweeps orphaned ones", async () => {
    const live = await createMemo(db, user, {
      content: "keep",
      visibility: "private",
      source: "web",
    });
    const expiredTrash = await createMemo(db, user, {
      content: "old trash",
      visibility: "private",
      source: "web",
    });
    await moveMemoToTrash(db, user, expiredTrash.id);
    const trashAttachmentId = await insertAttachment(db, user.id, {
      memoId: expiredTrash.id,
      createdAt: new Date(NOW - 40 * 86_400_000).toISOString(),
    });
    await db
      .update(memos)
      .set({ deletedAt: new Date(NOW - 40 * 86_400_000).toISOString() })
      .where(eq(memos.id, expiredTrash.id));

    const boundOld = await insertAttachment(db, user.id, {
      memoId: live.id,
      createdAt: new Date(NOW - 10 * 86_400_000).toISOString(),
    });
    const orphan = await insertAttachment(db, user.id, {
      createdAt: new Date(NOW - 10 * 86_400_000).toISOString(),
    });
    const freshOrphan = await insertAttachment(db, user.id, {
      createdAt: new Date(NOW).toISOString(),
    });

    await runScheduledMaintenance(env, NOW);

    // The orphan GC runs first, then the trash purge deletes its R2 keys via
    // the hard-delete path.
    expect(r2.deletedKeys).toEqual([
      [expect.stringContaining(orphan)],
      [expect.stringContaining(trashAttachmentId)],
    ]);
    const remainingIds = (await db.select().from(attachments)).map(
      (row) => row.id,
    );
    expect(remainingIds).toContain(boundOld);
    expect(remainingIds).toContain(freshOrphan);
    expect(remainingIds).not.toContain(orphan);
    const trashedRow = await db
      .select()
      .from(memos)
      .where(eq(memos.id, expiredTrash.id))
      .get();
    expect(trashedRow).toBeUndefined();
    // The hard delete marks its attachment rows `deleting` instead of
    // dropping them inline; the next daily sweep finalizes them.
    const marked = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, trashAttachmentId))
      .get();
    expect(marked?.state).toBe("deleting");
    await runScheduledMaintenance(env, NOW);
    expect(
      (await db.select().from(attachments)).some(
        (row) => row.id === trashAttachmentId,
      ),
    ).toBe(false);
  });

  it("files daily review and overdue notifications exactly once per day", async () => {
    const anchor = await createMemo(db, user, {
      content: "a year ago today",
      visibility: "private",
      source: "web",
    });
    await db
      .update(memos)
      .set({ createdAt: "2025-09-15T10:00:00.000Z" })
      .where(eq(memos.id, anchor.id));
    const project = await createProject(db, user, { name: "plan" });
    await createTask(db, user, { type: "user" }, {
      project_id: project.id,
      title: "overdue chore",
      due_at: "2026-09-01",
    } as never);

    await runScheduledMaintenance(env, NOW);
    let rows = await db.select().from(memosNotifications);
    expect(rows.filter((row) => row.type === "daily_review")).toHaveLength(1);
    expect(rows.filter((row) => row.type === "task_overdue")).toHaveLength(1);

    // A cron retry for the same day must not duplicate the inbox rows.
    await runScheduledMaintenance(env, NOW);
    rows = await db.select().from(memosNotifications);
    expect(rows.filter((row) => row.type === "daily_review")).toHaveLength(1);
    expect(rows.filter((row) => row.type === "task_overdue")).toHaveLength(1);
  });

  it("expires stale data tasks and garbage-collects their export artifacts", async () => {
    const taskId = createResourceId("data_tasks");
    await db.insert(dataTasks).values({
      id: taskId,
      userId: user.id,
      kind: "export",
      status: "succeeded",
      phase: "completed",
      manifestKey: `exports/${taskId}/manifest.json`,
      createdAt: new Date(NOW - 30 * 86_400_000).toISOString(),
      updatedAt: new Date(NOW - 30 * 86_400_000).toISOString(),
      completedAt: new Date(NOW - 30 * 86_400_000).toISOString(),
    });
    r2.objects.add(`exports/${taskId}/manifest.json`);
    r2.objects.add("exports/other/artifact.json");

    await runScheduledMaintenance(env, NOW);

    const row = await db
      .select()
      .from(dataTasks)
      .where(eq(dataTasks.id, taskId))
      .get();
    expect(row).toBeUndefined();
    expect(r2.listPrefixes).toContain(`exports/${taskId}`);
    expect(r2.objects.has(`exports/${taskId}/manifest.json`)).toBe(false);
    // Artifacts of live tasks are untouched.
    expect(r2.objects.has("exports/other/artifact.json")).toBe(true);
  });

  it("pushes an overdue reminder whose payload deep-links to /projects", async () => {
    // A subscription row makes the web-push branch live; the mock on
    // pushNotificationToUser captures the plaintext payload, so the click
    // URL — the /calendar → /projects migration's regression guard — is
    // asserted without depending on the aes128gcm crypto internals.
    await db.insert(pushSubscriptions).values({
      id: createResourceId("push"),
      userId: user.id,
      endpoint: "https://push.example/endpoint-1",
      p256dh: "test-p256dh",
      auth: "test-auth",
      createdAt: new Date(NOW).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    });

    const project = await createProject(db, user, { name: "plan" });
    await createTask(db, user, { type: "user" }, {
      project_id: project.id,
      title: "overdue chore",
      due_at: "2026-09-01",
    } as never);

    const pushes: Array<{ userId: string; payload: PushPayload }> = [];
    vi.mocked(pushNotificationToUser).mockClear();
    vi.mocked(pushNotificationToUser).mockImplementation(
      async (_db, _keys, userId, payload) => {
        pushes.push({ userId, payload });
        return 1;
      },
    );

    await runScheduledMaintenance(env, NOW);

    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.userId).toBe(user.id);
    expect(pushes[0]?.payload).toMatchObject({
      title: "FlareMo 任务提醒",
      body: "有 1 个任务已经逾期。",
      url: "/projects",
    });

    // The inbox row carries the task title as its snippet.
    const rows = await db.select().from(memosNotifications);
    const overdueRow = rows.find((row) => row.type === "task_overdue");
    expect(overdueRow?.snippet).toBe("overdue chore");
  });
});
