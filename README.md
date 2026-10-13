# bc-toolbox-envelope

One machine-readable result shape for every tool in the bc-toolbox (bc-dev-mcp, al-perf,
business-central-mcp, al-sem, LethAL, bc-mdc-converter, al-comment-audit), so an agent can
branch on a result without parsing prose.

- **MCP:** an `isError` tool result's text is an **error body**.
- **CLI:** `--json` stdout is a **CLI envelope**; logs go to stderr.

```ts
import { ToolboxError, errorBody, cliOk, cliError } from "@sshadows/bc-toolbox-envelope";

errorBody("bcdev_status", new ToolboxError("TIMEOUT", "dev endpoint timed out", "network", true), ["Retry bcdev_status."]);
// { error: { code, category, message, retryable, tool, details }, nextSteps: [...] }

cliOk({ mutants: 12 });                       // { schemaVersion: "1", status: "ok", data, warnings: [] }
cliError(new ToolboxError("NOT_FOUND", "no app.json", "validation"), ["Run inside an AL project."]);
// { schemaVersion: "1", status: "error", warnings: [], error: { code, category, message, retryable, details, nextSteps } }
```

## Error codes

`TOOLBOX_CORE_ERROR_CODES` mean the same thing for every tool: `INVALID_ARGUMENT`,
`CONFIGURATION_ERROR`, `AUTHENTICATION_FAILED`, `ENDPOINT_UNREACHABLE`, `UNSUPPORTED_SERVER`,
`NOT_FOUND`, `TOOL_DISABLED`, `TIMEOUT`, `SERVER_REJECTED`, `PROTOCOL_ERROR`, `INTERNAL_ERROR`.
A tool adds `UPPER_SNAKE` extension codes for state only it has.

- A code is core only if it means the same for any tool.
- An extension code never reuses a core name, and codes are never renamed.
- A consumer that does not know a code falls back to `error.category` and `error.retryable`.

`errorBodySchema()` accepts any well-formed code (validate what you receive);
`errorBodySchema(["MY_CODE"])` accepts exactly core plus your extensions (validate what you emit).

## Outside TypeScript

`schema/error-body.schema.json` and `schema/cli-envelope.schema.json` (JSON Schema 2020-12) are
generated from the code (`bun run schemas`; a test fails when they are stale) and ship in the
package, for tools written in Rust or shipped as executables.

## Develop

```bash
bun install && bun test && bun run typecheck && bun run build
```

Peer dependency: `zod` 4. Node 22+.
