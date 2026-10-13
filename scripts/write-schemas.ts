// Regenerates schema/*.schema.json from src/index.ts (a drift test fails when they are stale).
import { mkdirSync, writeFileSync } from "node:fs";
import { jsonSchemas } from "../src/index";

mkdirSync("schema", { recursive: true });
for (const [name, schema] of Object.entries(jsonSchemas())) {
  writeFileSync(`schema/${name}.schema.json`, `${JSON.stringify(schema, null, 2)}\n`);
}
console.log("wrote schema/error-body.schema.json, schema/cli-envelope.schema.json");
