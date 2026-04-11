/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const path = require("node:path");
const { registerTypeScriptHook } = require("../register-ts-hook.cjs");

registerTypeScriptHook();

const { syncPromptTemplateDeclarations } = require("../src/cli/sync-template-types.ts");

syncPromptTemplateDeclarations({
  rootDirectory: path.resolve(__dirname, "..", "..", ".."),
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
