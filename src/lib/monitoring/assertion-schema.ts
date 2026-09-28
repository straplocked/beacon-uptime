/**
 * Zod schema for `Assertion` (see assertions.ts), shared by the internal
 * API, the v1 REST API, and the MCP tool definitions so the wire shape is
 * defined in exactly one place.
 *
 * This only validates *shape* (required fields present, right types). The
 * deeper semantic checks — non-empty values, regex safety, max pattern
 * length — live in `validateAssertion`/`validateAssertions` in
 * assertions.ts and must be called explicitly after `.parse()`/`.safeParse()`
 * succeeds, since zod's `z.record()` needs two args per CLAUDE.md and a
 * discriminated union here is otherwise clean without duplicating that
 * logic in two places.
 */
import { z } from "zod";

export const assertionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("body_contains"),
    value: z.string().min(1).max(1000),
  }),
  z.object({
    type: z.literal("body_not_contains"),
    value: z.string().min(1).max(1000),
  }),
  z.object({
    type: z.literal("body_regex"),
    pattern: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("header_equals"),
    header: z.string().min(1).max(200),
    value: z.string().max(2000),
  }),
  z.object({
    type: z.literal("json_path_equals"),
    path: z.string().min(1).max(200),
    value: z.string().max(2000),
  }),
]);
