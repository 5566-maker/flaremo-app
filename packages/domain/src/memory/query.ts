import type { FlareMoDb, MemoryItemRow, UserRow } from "@flaremo/db";
import {
  memoryEvents,
  memoryEvidence,
  memoryItems,
  memoryRelations,
  memoryRevisions,
} from "@flaremo/db";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  memoryEventToDto,
  memoryEvidenceToDto,
  memoryRelationToDto,
  memoryRevisionToDto,
  memoryToDto,
} from "./dto";
import { buildFtsCondition, requireMemory } from "./shared";

export async function getMemory(db: FlareMoDb, user: UserRow, id: string) {
  const row = await requireMemory(db, user, id);
  await db
    .update(memoryItems)
    .set({
      accessCount: row.accessCount + 1,
      lastAccessedAt: new Date().toISOString(),
    })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, user.id)));

  const evidenceRows = await db
    .select()
    .from(memoryEvidence)
    .where(
      and(eq(memoryEvidence.memoryId, id), eq(memoryEvidence.userId, user.id)),
    );

  const fresh = await requireMemory(db, user, id);
  return memoryToDto(fresh, evidenceRows.map(memoryEvidenceToDto));
}

export async function listMemories(
  db: FlareMoDb,
  user: UserRow,
  input: {
    q?: string;
    type?: MemoryItemRow["type"];
    kind?: MemoryItemRow["kind"];
    scopeType?: MemoryItemRow["scopeType"];
    scopeKey?: string;
    factKey?: string;
    tier?: MemoryItemRow["tier"];
    verification?: MemoryItemRow["verification"];
    status?: MemoryItemRow["status"];
    sourceAgent?: string;
    needsReview?: boolean;
    asOf?: string;
  } = {},
) {
  const filters: SQL[] = [eq(memoryItems.userId, user.id)];
  if (input.q?.trim()) {
    const fts = buildFtsCondition(input.q);
    if (fts) filters.push(fts);
  }
  if (input.type) filters.push(eq(memoryItems.type, input.type));
  if (input.kind) filters.push(eq(memoryItems.kind, input.kind));
  if (input.scopeType) filters.push(eq(memoryItems.scopeType, input.scopeType));
  if (input.scopeKey) filters.push(eq(memoryItems.scopeKey, input.scopeKey));
  if (input.factKey) filters.push(eq(memoryItems.factKey, input.factKey));
  if (input.tier) filters.push(eq(memoryItems.tier, input.tier));
  if (input.verification)
    filters.push(eq(memoryItems.verification, input.verification));
  if (input.status) filters.push(eq(memoryItems.status, input.status));
  if (input.sourceAgent)
    filters.push(eq(memoryItems.sourceAgent, input.sourceAgent));
  if (input.needsReview !== undefined)
    filters.push(eq(memoryItems.needsReview, input.needsReview));

  if (input.asOf) {
    filters.push(
      or(
        isNull(memoryItems.validFrom),
        lte(memoryItems.validFrom, input.asOf),
      ) as SQL,
    );
    filters.push(
      or(
        isNull(memoryItems.validTo),
        sql`${memoryItems.validTo} > ${input.asOf}`,
      ) as SQL,
    );
  }

  const rows = await db
    .select()
    .from(memoryItems)
    .where(and(...filters))
    .orderBy(desc(memoryItems.updatedAt), desc(memoryItems.id));
  return rows.map((r) => memoryToDto(r));
}

export async function listMemoryReview(db: FlareMoDb, user: UserRow) {
  const rows = await db
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.userId, user.id),
        // The inbox holds *pending* items only. A rejected proposal is still an
        // inference semantically, so the work of keeping a dismissed card off
        // this list happens here rather than by rewriting the row's
        // verification: archived inferences (rejected or forgotten) are done.
        or(
          eq(memoryItems.needsReview, true),
          eq(memoryItems.status, "disputed"),
          and(
            eq(memoryItems.verification, "inferred"),
            eq(memoryItems.status, "active"),
            isNull(memoryItems.rejectedAt),
          ),
        ),
      ),
    )
    .orderBy(desc(memoryItems.updatedAt), desc(memoryItems.id));

  const ids = rows.map((r) => r.id);
  const evidenceMap = new Map<string, (typeof memoryEvidence.$inferSelect)[]>();
  if (ids.length > 0) {
    const evidenceRows = await db
      .select()
      .from(memoryEvidence)
      .where(
        and(
          eq(memoryEvidence.userId, user.id),
          inArray(memoryEvidence.memoryId, ids),
        ),
      );
    for (const ev of evidenceRows) {
      const list = evidenceMap.get(ev.memoryId) ?? [];
      list.push(ev);
      evidenceMap.set(ev.memoryId, list);
    }
  }

  return rows.map((r) =>
    memoryToDto(r, (evidenceMap.get(r.id) ?? []).map(memoryEvidenceToDto)),
  );
}

export async function listMemoryRevisions(
  db: FlareMoDb,
  user: UserRow,
  memoryId: string,
) {
  await requireMemory(db, user, memoryId);
  const rows = await db
    .select()
    .from(memoryRevisions)
    .where(
      and(
        eq(memoryRevisions.memoryId, memoryId),
        eq(memoryRevisions.userId, user.id),
      ),
    )
    .orderBy(desc(memoryRevisions.createdAt));
  return rows.map(memoryRevisionToDto);
}

export async function listMemoryRelations(
  db: FlareMoDb,
  user: UserRow,
  memoryId: string,
) {
  await requireMemory(db, user, memoryId);
  const rows = await db
    .select()
    .from(memoryRelations)
    .where(
      and(
        eq(memoryRelations.userId, user.id),
        or(
          eq(memoryRelations.memoryId, memoryId),
          eq(memoryRelations.relatedMemoryId, memoryId),
        ),
      ),
    )
    .orderBy(desc(memoryRelations.createdAt));
  return rows.map(memoryRelationToDto);
}

export async function listMemoryEvidence(
  db: FlareMoDb,
  user: UserRow,
  memoryId: string,
) {
  await requireMemory(db, user, memoryId);
  const rows = await db
    .select()
    .from(memoryEvidence)
    .where(
      and(
        eq(memoryEvidence.memoryId, memoryId),
        eq(memoryEvidence.userId, user.id),
      ),
    )
    .orderBy(desc(memoryEvidence.createdAt));
  return rows.map(memoryEvidenceToDto);
}

export async function getMemoryLineage(
  db: FlareMoDb,
  user: UserRow,
  memoryId: string,
) {
  const current = await requireMemory(db, user, memoryId);

  let chainRows: MemoryItemRow[] = [current];
  if (current.factKey) {
    chainRows = await db
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.userId, user.id),
          eq(memoryItems.factKey, current.factKey),
        ),
      )
      .orderBy(desc(memoryItems.createdAt));
  }

  const revisions = await db
    .select()
    .from(memoryRevisions)
    .where(
      and(
        eq(memoryRevisions.memoryId, memoryId),
        eq(memoryRevisions.userId, user.id),
      ),
    )
    .orderBy(desc(memoryRevisions.createdAt));

  const evidenceRows = await db
    .select()
    .from(memoryEvidence)
    .where(
      and(
        eq(memoryEvidence.memoryId, memoryId),
        eq(memoryEvidence.userId, user.id),
      ),
    )
    .orderBy(desc(memoryEvidence.createdAt));

  const eventRows = await db
    .select()
    .from(memoryEvents)
    .where(
      and(
        eq(memoryEvents.memoryId, memoryId),
        eq(memoryEvents.userId, user.id),
      ),
    )
    .orderBy(desc(memoryEvents.createdAt));

  return {
    current: memoryToDto(current),
    chain: chainRows.map((r) => memoryToDto(r)),
    revisions: revisions.map(memoryRevisionToDto),
    evidence: evidenceRows.map(memoryEvidenceToDto),
    events: eventRows.map(memoryEventToDto),
  };
}
