import type { MemoRow, ReactionRow, UserRow } from "@flaremo/db";
import {
  getMemoByIdForViewer,
  listAttachmentsForMemosForViewer,
  listMemoAttachmentsForViewer,
  listMemoReactions,
  listMemoRelationsForViewer,
  listReactionsForMemosForViewer,
} from "@flaremo/domain";
import {
  currentMemoToDto,
  currentReactionToDto,
  currentRelationToDto,
} from "@flaremo/memos";
import type { getOptionalRequestContext } from "../../context";
import { getFlaremoUserCached } from "../../identity-cache";
import { type MemoReactionPage, resolveMemoCreatorRow } from "./parsing";

export async function memoToCurrentDto(
  context: Awaited<ReturnType<typeof getOptionalRequestContext>>,
  memo: MemoRow,
  parentName?: string,
) {
  const reactionPagePromise: Promise<MemoReactionPage> = listMemoReactions(
    context.db,
    context.user,
    {
      memoName: memo.id,
      pageSize: 1000,
    },
  );
  const [attachments, relationRows, reactionPage] = await Promise.all([
    listMemoAttachmentsForViewer(context.db, context.user, memo.id),
    listMemoRelationsForViewer(context.db, context.user, memo.id),
    reactionPagePromise,
  ]);
  const relations = await Promise.all(
    relationRows.map(async (relation) => {
      try {
        const [relationMemo, relatedMemo] = await Promise.all([
          getMemoByIdForViewer(context.db, context.user, relation.memoId, {
            includeDeleted: true,
          }),
          getMemoByIdForViewer(
            context.db,
            context.user,
            relation.relatedMemoId,
            { includeDeleted: true },
          ),
        ]);
        return currentRelationToDto(relation, relationMemo, relatedMemo);
      } catch {
        return null;
      }
    }),
  );
  const creator =
    context.user?.id === memo.userId
      ? context.user
      : await getFlaremoUserCached(context.db, memo.userId);
  if (!creator) throw new Error("Memo creator not found");
  return {
    ...currentMemoToDto(memo, creator, {
      attachments,
      relations: relations.filter(
        (value): value is NonNullable<typeof value> => value !== null,
      ),
    }),
    reactions: reactionPage.reactions.map((reaction) =>
      reactionToDto(reaction),
    ),
    ...(parentName ? { parent: parentName } : {}),
  };
}

export function reactionToDto(value: ReactionRow) {
  return currentReactionToDto(value);
}

function groupByContentMemo<T>(
  rows: T[],
  memoKey: (row: T) => string | null | undefined,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const memoId = memoKey(row);
    if (!memoId) continue;
    const bucket = grouped.get(memoId) ?? [];
    bucket.push(row);
    grouped.set(memoId, bucket);
  }
  return grouped;
}

/**
 * Hydrate a page of comment rows without the per-comment round trips:
 * attachments and reactions are resolved with one batched query each;
 * relations stay per-memo because most comments carry none, and creators are
 * cached across the page. Mirrors memoToCurrentDto's DTO shape exactly.
 */
export async function hydrateSocialMemos(
  context: Awaited<ReturnType<typeof getOptionalRequestContext>>,
  memoRows: MemoRow[],
  parentName?: string,
) {
  const ids = memoRows.map((memo) => memo.id);
  const [attachmentsByMemo, reactionRows] = await Promise.all([
    listAttachmentsForMemosForViewer(context.db, context.user, ids),
    listReactionsForMemosForViewer(context.db, context.user, ids),
  ]);
  const attachments = groupByContentMemo(
    attachmentsByMemo,
    (attachment) => attachment.memoId,
  );
  const reactions = groupByContentMemo(
    reactionRows,
    (reaction) => reaction.contentId,
  );
  const creators = new Map<string, UserRow | null>();
  return Promise.all(
    memoRows.map(async (memo) => {
      const relationRows = await listMemoRelationsForViewer(
        context.db,
        context.user,
        memo.id,
      );
      const relations = (
        await Promise.all(
          relationRows.map(async (relation) => {
            try {
              const [relationMemo, relatedMemo] = await Promise.all([
                getMemoByIdForViewer(
                  context.db,
                  context.user,
                  relation.memoId,
                  {
                    includeDeleted: true,
                  },
                ),
                getMemoByIdForViewer(
                  context.db,
                  context.user,
                  relation.relatedMemoId,
                  { includeDeleted: true },
                ),
              ]);
              return currentRelationToDto(relation, relationMemo, relatedMemo);
            } catch {
              return null;
            }
          }),
        )
      ).filter(
        (relation): relation is NonNullable<typeof relation> =>
          relation !== null,
      );
      const creator = await resolveMemoCreatorRow(context, creators, memo);
      return {
        ...currentMemoToDto(memo, creator, {
          attachments: attachments.get(memo.id) ?? [],
          relations,
        }),
        reactions: (reactions.get(memo.id) ?? []).map((reaction) =>
          reactionToDto(reaction),
        ),
        ...(parentName ? { parent: parentName } : {}),
      };
    }),
  );
}
