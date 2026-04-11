import {
  frontmatter as rawJsonFrontmatter,
  prompt as rawJsonPrompt,
  type Args as RawJsonArgs,
  type FrontMatter as RawJsonFrontMatter,
} from "./fixtures/raw-json.template.md";
import {
  prompt as simpleParameterPrompt,
  type Args as SimpleParameterArgs,
  type FrontMatter as SimpleParameterFrontMatter,
} from "./fixtures/simple-parameter.prompt.md";

const simpleParameterArgs: SimpleParameterArgs = { name: "lane" };
const simpleParameterFrontmatter: SimpleParameterFrontMatter = {};
const simpleParameterOutput: string = simpleParameterPrompt(simpleParameterArgs);

const rawJsonArgs: RawJsonArgs = { payload: { ready: true } };
const rawJsonFrontmatterShape: RawJsonFrontMatter = rawJsonFrontmatter;
const rawJsonOutput: string = rawJsonPrompt((frontmatter) => {
  const typedFrontmatter: RawJsonFrontMatter = frontmatter;

  return {
    payload: {
      ready: typedFrontmatter.title === "Render JSON",
    },
  };
});

void rawJsonArgs;
void rawJsonFrontmatterShape;
void rawJsonOutput;
void simpleParameterFrontmatter;
void simpleParameterOutput;
