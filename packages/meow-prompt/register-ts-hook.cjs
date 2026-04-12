/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("node:fs");
const ts = require("typescript");

let isRegistered = false;

const packageRoot = __dirname;

const createCompilerOptions = () => ({
  esModuleInterop: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  target: ts.ScriptTarget.ES2022,
});

const rewriteCommonJsIncompatibleSource = (source) => {
  return source.replace(/fileURLToPath\(import\.meta\.url\)/g, "__filename");
};

const registerTypeScriptHook = () => {
  if (isRegistered) {
    return;
  }

  const previousTypeScriptLoader = require.extensions[".ts"];

  require.extensions[".ts"] = (module, filename) => {
    if (!filename.startsWith(packageRoot)) {
      if (previousTypeScriptLoader) {
        previousTypeScriptLoader(module, filename);
        return;
      }

      module._compile(fs.readFileSync(filename, "utf8"), filename);
      return;
    }

    const source = rewriteCommonJsIncompatibleSource(fs.readFileSync(filename, "utf8"));
    const transpiledModule = ts.transpileModule(source, {
      compilerOptions: createCompilerOptions(),
      fileName: filename,
      reportDiagnostics: false,
    });

    module._compile(transpiledModule.outputText, filename);
  };

  isRegistered = true;
};

module.exports = {
  packageRoot,
  registerTypeScriptHook,
};
