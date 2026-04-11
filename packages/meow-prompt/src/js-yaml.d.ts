declare module "js-yaml" {
  export type LoadOptions = {
    schema?: unknown;
  };

  export function load(source: string, options?: LoadOptions): unknown;
  export const JSON_SCHEMA: unknown;

  const yaml: {
    load: typeof load;
    JSON_SCHEMA: typeof JSON_SCHEMA;
  };

  export default yaml;
}
