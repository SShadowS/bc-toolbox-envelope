import { z } from "zod";

/*
 * The shared machine envelope of the bc-toolbox (epic SShadowS/bc-dev-mcp#18, c04):
 *
 * - MCP: every isError tool result's text is an ErrorBody (JSON).
 * - CLI: `--json` stdout is a CliEnvelope; logs go to stderr.
 *
 * Error codes come in two disjoint sets. TOOLBOX_CORE_ERROR_CODES mean the same thing
 * for every tool, so an agent can branch on them without knowing which tool failed. A tool
 * adds its own extension codes for state only it has. Rules: a code goes into the core
 * set only if it means the same for any tool; an extension code never reuses a core name;
 * codes are never renamed; a consumer that does not know a code falls back to
 * error.category and error.retryable.
 */

export const SCHEMA_VERSION = "1";

export const TOOLBOX_CORE_ERROR_CODES = [
  "INVALID_ARGUMENT",
  "CONFIGURATION_ERROR",
  "AUTHENTICATION_FAILED",
  "ENDPOINT_UNREACHABLE",
  "UNSUPPORTED_SERVER",
  "NOT_FOUND",
  "TOOL_DISABLED",
  "TIMEOUT",
  "SERVER_REJECTED",
  "PROTOCOL_ERROR",
  "INTERNAL_ERROR",
] as const;
export type ToolboxCoreErrorCode = (typeof TOOLBOX_CORE_ERROR_CODES)[number];

export const ERROR_CATEGORIES = ["validation", "configuration", "auth", "network", "state", "server", "protocol", "internal"] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** Any code: a core code or a tool's UPPER_SNAKE extension code. */
export const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Machine-readable extras. Lists and records stay structured (an agent should not have to parse a JSON string). */
export type ErrorDetails = Record<string, JsonValue>;

const detailsSchema = z.record(z.string(), z.json());

function errorObjectSchema(code: z.ZodType<string>, withTool: boolean) {
  return z.strictObject({
    code,
    category: z.enum(ERROR_CATEGORIES),
    message: z.string(),
    retryable: z.boolean(),
    ...(withTool ? { tool: z.string() } : {}),
    details: detailsSchema,
  });
}

const nextStepsSchema = z.array(z.string().min(1)).min(1);

/**
 * The isError body. Without extension codes the code is any well-formed code (what a
 * consumer validates against); with them it is exactly core + those (what a tool validates
 * its own output against).
 */
export function errorBodySchema<const E extends readonly string[] = readonly []>(extensionCodes?: E) {
  const code = extensionCodes ? z.enum([...TOOLBOX_CORE_ERROR_CODES, ...extensionCodes] as [string, ...string[]]) : z.string().regex(ERROR_CODE_PATTERN);
  return z.strictObject({ error: errorObjectSchema(code, true), nextSteps: nextStepsSchema });
}
export const ErrorBodySchema = errorBodySchema();
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/** The `--json` stdout of a CLI: data on success, error (with nextSteps) on failure. */
export function cliEnvelopeSchema<D extends z.ZodType = z.ZodUnknown>(data?: D) {
  const error = errorObjectSchema(z.string().regex(ERROR_CODE_PATTERN), false).extend({ nextSteps: nextStepsSchema });
  const base = { schemaVersion: z.literal(SCHEMA_VERSION), warnings: z.array(z.string()) };
  return z.discriminatedUnion("status", [
    z.strictObject({ ...base, status: z.literal("ok"), data: (data ?? z.unknown()) as D }),
    z.strictObject({ ...base, status: z.literal("error"), error }),
  ]);
}
export const CliEnvelopeSchema = cliEnvelopeSchema();
export type CliEnvelope<D = unknown> =
  | { schemaVersion: typeof SCHEMA_VERSION; status: "ok"; data: D; warnings: string[] }
  | { schemaVersion: typeof SCHEMA_VERSION; status: "error"; warnings: string[]; error: CliError };
export type CliError = Omit<ErrorBody["error"], "tool"> & { nextSteps: string[] };

/** A typed, expected failure. `C` is the tool's code union (core + extensions). */
export class ToolboxError<C extends string = ToolboxCoreErrorCode> extends Error {
  constructor(
    public readonly code: C,
    message: string,
    public readonly category: ErrorCategory,
    public readonly retryable = false,
    public readonly details: ErrorDetails = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ToolboxError";
  }
}

/** The MCP isError body for `error` raised by `tool`. Throws if nextSteps is empty. */
export function errorBody(tool: string, error: ToolboxError<string>, nextSteps: string[]): ErrorBody {
  return ErrorBodySchema.parse({
    error: { code: error.code, category: error.category, message: error.message, retryable: error.retryable, tool, details: error.details },
    nextSteps,
  });
}

export function cliOk<D>(data: D, warnings: string[] = []): CliEnvelope<D> {
  return { schemaVersion: SCHEMA_VERSION, status: "ok", data, warnings };
}

export function cliError(error: ToolboxError<string>, nextSteps: string[], warnings: string[] = []): CliEnvelope<never> {
  const body = errorBody("cli", error, nextSteps);
  const { tool: _tool, ...rest } = body.error;
  return { schemaVersion: SCHEMA_VERSION, status: "error", warnings, error: { ...rest, nextSteps: body.nextSteps } };
}

/** JSON Schemas (draft 2020-12) for consumers outside TypeScript; committed under schema/. */
export function jsonSchemas(): Record<"error-body" | "cli-envelope", Record<string, unknown>> {
  return {
    "error-body": z.toJSONSchema(ErrorBodySchema) as Record<string, unknown>,
    "cli-envelope": z.toJSONSchema(CliEnvelopeSchema) as Record<string, unknown>,
  };
}
