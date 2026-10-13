import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CliEnvelopeSchema,
  ErrorBodySchema,
  TOOLBOX_CORE_ERROR_CODES,
  ToolboxError,
  cliEnvelopeSchema,
  cliError,
  cliOk,
  errorBody,
  errorBodySchema,
  jsonSchemas,
} from "../src/index";
import { z } from "zod";

describe("error body", () => {
  test("builds a body that validates, with a core or an extension code", () => {
    const body = errorBody("bcdev_status", new ToolboxError("TIMEOUT", "slow", "network", true, { ms: 5 }), ["retry"]);
    expect(body).toEqual({
      error: { code: "TIMEOUT", category: "network", message: "slow", retryable: true, tool: "bcdev_status", details: { ms: 5 } },
      nextSteps: ["retry"],
    });
    expect(ErrorBodySchema.safeParse(errorBody("t", new ToolboxError("PROFILE_ACTIVE", "x", "state"), ["finish"])).success).toBe(true);
  });

  test("rejects empty nextSteps, unknown fields and malformed codes", () => {
    expect(() => errorBody("t", new ToolboxError("TIMEOUT", "x", "network"), [])).toThrow();
    const ok = errorBody("t", new ToolboxError("TIMEOUT", "x", "network"), ["s"]);
    expect(ErrorBodySchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(ErrorBodySchema.safeParse({ ...ok, error: { ...ok.error, code: "not-a-code" } }).success).toBe(false);
  });

  test("a tool's strict schema accepts core + its extensions only", () => {
    const strict = errorBodySchema(["PROFILE_ACTIVE"] as const);
    const make = (code: string) => ({ error: { code, category: "state", message: "m", retryable: false, tool: "t", details: {} }, nextSteps: ["s"] });
    expect(strict.safeParse(make("PROFILE_ACTIVE")).success).toBe(true);
    expect(strict.safeParse(make(TOOLBOX_CORE_ERROR_CODES[0])).success).toBe(true);
    expect(strict.safeParse(make("OTHER_TOOL_CODE")).success).toBe(false);
  });
});

describe("CLI envelope", () => {
  test("ok and error envelopes validate; error carries nextSteps and no tool", () => {
    expect(CliEnvelopeSchema.parse(cliOk({ n: 1 }, ["w"]))).toEqual({ schemaVersion: "1", status: "ok", data: { n: 1 }, warnings: ["w"] });
    const err = cliError(new ToolboxError("NOT_FOUND", "no file", "validation", false, { path: "a.al" }), ["check the path"]);
    expect(CliEnvelopeSchema.parse(err)).toEqual({
      schemaVersion: "1",
      status: "error",
      warnings: [],
      error: { code: "NOT_FOUND", category: "validation", message: "no file", retryable: false, details: { path: "a.al" }, nextSteps: ["check the path"] },
    });
  });

  test("a typed data schema is enforced", () => {
    const typed = cliEnvelopeSchema(z.object({ n: z.number() }));
    expect(typed.safeParse(cliOk({ n: 1 })).success).toBe(true);
    expect(typed.safeParse(cliOk({ n: "x" })).success).toBe(false);
  });
});

test("committed JSON Schemas match the code (run bun run schemas)", () => {
  for (const [name, schema] of Object.entries(jsonSchemas())) {
    expect(JSON.parse(readFileSync(`schema/${name}.schema.json`, "utf8"))).toEqual(schema);
  }
});
