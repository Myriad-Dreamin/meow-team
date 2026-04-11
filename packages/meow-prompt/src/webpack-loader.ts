import path from "node:path";
import { compilePromptModule } from "./compiler";

const runtimeModulePath = path.resolve(__dirname, "runtime");

type LoaderContext = {
  cacheable?: (flag?: boolean) => void;
  resourcePath: string;
};

export default function meowPromptWebpackLoader(this: LoaderContext, source: string): string {
  this.cacheable?.(true);

  return compilePromptModule(source, {
    resourcePath: this.resourcePath,
    runtimeModulePath,
  }).code;
}
