import { Environment } from "@marcbachmann/cel-js";
import { MAX_MEMO_FILTER_AST_NODES } from "./limits";
import { getMemoFilterRegex } from "./regex";

// Memos filters are user supplied. Keep the parser bounded even before the
// domain-level node count check below gets a chance to run.
export const memoFilterEnvironment = new Environment({
  limits: {
    maxAstNodes: MAX_MEMO_FILTER_AST_NODES,
    maxDepth: 64,
    maxListElements: 128,
    maxMapEntries: 128,
    maxCallArguments: 16,
  },
  unlistedVariablesAreDyn: false,
})
  .registerVariable("content", "string")
  .registerVariable("creator", "string")
  .registerVariable("creator_id", "int")
  .registerVariable("created_ts", "google.protobuf.Timestamp")
  .registerVariable("updated_ts", "google.protobuf.Timestamp")
  .registerVariable("pinned", "bool")
  .registerVariable("visibility", "string")
  .registerVariable("state", "string")
  .registerVariable("tags", "list<string>")
  .registerVariable("tag", "string")
  .registerVariable("has_link", "bool")
  .registerVariable("has_task_list", "bool")
  .registerVariable("has_code", "bool")
  .registerVariable("has_incomplete_tasks", "bool")
  // AttachmentService uses the same CEL runtime with a smaller schema. Keep
  // these variables in the shared environment so both filters use identical
  // parsing, timestamp, duration, arithmetic, and string-method semantics.
  .registerVariable("filename", "string")
  .registerVariable("mime_type", "string")
  .registerVariable("create_time", "google.protobuf.Timestamp")
  // cel-js names CEL's dynamic/any type `dyn`.
  .registerVariable("memo_id", "dyn")
  .registerVariable("memo", "string")
  .registerVariable("now", "google.protobuf.Timestamp")
  .registerFunction(
    "flaremo_sets_contains(list<string>, list<string>): bool",
    (left: string[], right: string[]) =>
      distinctStrings(right).every((value) => left.includes(value)),
  )
  .registerFunction(
    "flaremo_sets_intersects(list<string>, list<string>): bool",
    (left: string[], right: string[]) =>
      distinctStrings(left).some((value) => right.includes(value)),
  )
  .registerFunction(
    "flaremo_sets_equivalent(list<string>, list<string>): bool",
    (left: string[], right: string[]) => {
      const leftSet = distinctStrings(left);
      const rightSet = distinctStrings(right);
      return (
        leftSet.length === rightSet.length &&
        leftSet.every((value) => rightSet.includes(value))
      );
    },
  )
  .registerFunction(
    "flaremo_tag_in(list<string>, list<string>): bool",
    (tags: string[], candidates: string[]) =>
      candidates.some((candidate) =>
        tags.some(
          (tag) => tag === candidate || tag.startsWith(`${candidate}/`),
        ),
      ),
  )
  .registerFunction(
    "string.flaremo_contains(string): bool",
    (left: string, right: string) =>
      left.toLowerCase().includes(right.toLowerCase()),
  )
  .registerFunction(
    "string.flaremo_startsWith(string): bool",
    (left: string, right: string) =>
      left.toLowerCase().startsWith(right.toLowerCase()),
  )
  .registerFunction(
    "string.flaremo_endsWith(string): bool",
    (left: string, right: string) =>
      left.toLowerCase().endsWith(right.toLowerCase()),
  )
  .registerFunction(
    "string.flaremo_matches(string): bool",
    (left: string, pattern: string) => {
      const regex = getMemoFilterRegex(pattern);
      return regex.test(left);
    },
  );

function distinctStrings(values: string[]) {
  return [...new Set(values)];
}
