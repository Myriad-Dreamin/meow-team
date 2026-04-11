/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { registerTypeScriptHook } = require("./register-ts-hook.cjs");

registerTypeScriptHook();

module.exports = require("./src/turbopack-loader.ts").default;
