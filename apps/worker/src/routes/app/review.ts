import {
  dailyReviewQuerySchema,
  randomMemoQuerySchema,
  relatedMemosQuerySchema,
  walkNextQuerySchema,
} from "@flaremo/contracts";
import {
  getRandomMemo,
  getWalkNextMemo,
  listDailyReviewMemos,
  listRelatedMemos,
} from "@flaremo/domain";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { getRequestContext, type HonoBindings } from "../../context";
import { jsonError } from "../../http";
import { parseExcludeParam, serializeMemosWithAttachments } from "./helpers";

export function registerReviewRoutes(app: Hono<HonoBindings>) {
  app.get(
    "/review/daily",
    zValidator("query", dailyReviewQuerySchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const rows = await listDailyReviewMemos(db, user, c.req.valid("query"));
        return c.json({
          memos: await serializeMemosWithAttachments(db, user, rows),
        });
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );

  app.get(
    "/review/random",
    zValidator("query", randomMemoQuerySchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const memo = await getRandomMemo(
          db,
          user,
          parseExcludeParam(c.req.valid("query").exclude),
        );
        const [serialized] = memo
          ? await serializeMemosWithAttachments(db, user, [memo])
          : [null];
        return c.json({ memo: serialized ?? null });
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );

  app.get(
    "/review/walk",
    zValidator("query", walkNextQuerySchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const query = c.req.valid("query");
        const { memo, via } = await getWalkNextMemo(
          db,
          user,
          query.memoId,
          parseExcludeParam(query.exclude),
        );
        const [serialized] = memo
          ? await serializeMemosWithAttachments(db, user, [memo])
          : [null];
        return c.json({ memo: serialized ?? null, via: memo ? via : null });
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );

  app.get(
    "/memos/:id/related",
    zValidator("query", relatedMemosQuerySchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const related = await listRelatedMemos(
          db,
          user,
          `memos/${c.req.param("id")}`,
          c.req.valid("query"),
        );
        const serialized = await serializeMemosWithAttachments(
          db,
          user,
          related.map((entry) => entry.memo),
        );
        const byId = new Map(serialized.map((memo) => [memo.name, memo]));
        return c.json({
          memos: related.flatMap((entry) => {
            const memo = byId.get(entry.memo.id);
            return memo
              ? [
                  {
                    ...memo,
                    shared_tags: entry.sharedTags,
                    via_relation: entry.viaRelation,
                  },
                ]
              : [];
          }),
        });
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );
}
