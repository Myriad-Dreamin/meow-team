import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const versionPattern = /^v?(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/;

const defaultOptions = {
  baseRef: "origin/main",
  dryRun: false,
  mode: process.env.PASEO_MERGE_AGENT_MODE ?? "full-access",
  noAgents: false,
  originRemote: process.env.PASEO_MERGE_ORIGIN ?? "origin",
  paseoBin: process.env.PASEO_BIN ?? "paseo",
  previousVersion: null,
  provider: process.env.PASEO_MERGE_AGENT_PROVIDER ?? "codex/gpt-5.4",
  resetExisting: false,
  skipFetch: false,
  upstreamRemote: process.env.PASEO_MERGE_UPSTREAM ?? "paseo",
};

const valueOptionHandlers = new Map([
  ["--provider", (options, value) => (options.provider = value)],
  ["--mode", (options, value) => (options.mode = value)],
  ["--origin", (options, value) => (options.originRemote = value)],
  ["--upstream", (options, value) => (options.upstreamRemote = value)],
  ["--base", (options, value) => (options.baseRef = value)],
  ["--previous", (options, value) => (options.previousVersion = value)],
  ["--paseo-bin", (options, value) => (options.paseoBin = value)],
]);

const flagOptionHandlers = new Map([
  ["--no-provider", (options) => (options.provider = null)],
  ["--no-mode", (options) => (options.mode = null)],
  ["--reset-existing", (options) => (options.resetExisting = true)],
  ["--skip-fetch", (options) => (options.skipFetch = true)],
  ["--no-agents", (options) => (options.noAgents = true)],
  ["--dry-run", (options) => (options.dryRun = true)],
]);

function usage() {
  return `Usage: node scripts/prepare-upstream-merge-pr.mjs <0.1.72|v0.1.72> [options]

Prepare an upstream Paseo release merge branch and launch the three detached agents
that resolve conflicts, create the PR, and fix CI failures.

Options:
  --provider <provider>     Agent provider/model. Default: ${defaultOptions.provider}
  --no-provider             Use the daemon's default provider.
  --mode <mode>             Provider mode. Default: ${defaultOptions.mode}
  --no-mode                 Do not pass a provider mode.
  --origin <remote>         Fork remote. Default: ${defaultOptions.originRemote}
  --upstream <remote>       Upstream Paseo remote. Default: ${defaultOptions.upstreamRemote}
  --base <ref>              Branch base ref. Default: ${defaultOptions.baseRef}
  --previous <version>      Previous upstream release tag. Default: target patch - 1
  --paseo-bin <command>     Paseo executable. Default: ${defaultOptions.paseoBin}
  --reset-existing          Reset an existing local merge branch to --base.
  --skip-fetch              Do not fetch remotes before preparing the branch.
  --no-agents               Prepare the branch but do not launch agents.
  --dry-run                 Print the plan without changing git state or launching agents.
  -h, --help                Show this help.
`;
}

export function parseStableVersion(rawVersion) {
  const trimmed = rawVersion.trim();
  const match = trimmed.match(versionPattern);
  if (!match?.groups) {
    throw new Error(`Invalid version "${rawVersion}". Expected 0.1.72 or v0.1.72.`);
  }

  const major = Number.parseInt(match.groups.major, 10);
  const minor = Number.parseInt(match.groups.minor, 10);
  const patch = Number.parseInt(match.groups.patch, 10);

  return {
    major,
    minor,
    patch,
    version: `${major}.${minor}.${patch}`,
    tag: `v${major}.${minor}.${patch}`,
  };
}

export function computePreviousPatchVersion(parsedVersion) {
  if (parsedVersion.patch <= 0) {
    throw new Error(
      `Cannot infer the previous patch release for ${parsedVersion.tag}. Pass --previous explicitly.`,
    );
  }

  return `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch - 1}`;
}

export function buildMergePlan(rawVersion, options = {}) {
  const parsed = parseStableVersion(rawVersion);
  const previousVersion =
    options.previousVersion === null || options.previousVersion === undefined
      ? computePreviousPatchVersion(parsed)
      : parseStableVersion(options.previousVersion).version;
  const previous = parseStableVersion(previousVersion);

  return {
    branchName: `merge-${parsed.tag}`,
    previousTag: previous.tag,
    targetTag: parsed.tag,
    targetVersion: parsed.version,
    title: `build: merge ${previous.tag}..${parsed.tag}`,
    upstreamCompareUrl: `https://github.com/getpaseo/paseo/compare/${previous.tag}...${parsed.tag}`,
  };
}

export function parseArgs(argv) {
  const options = { ...defaultOptions };
  let version = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = splitOption(arg);

    if (flag === "-h" || flag === "--help") {
      return { help: true, options, version };
    }

    const valueOptionHandler = valueOptionHandlers.get(flag);
    if (valueOptionHandler) {
      valueOptionHandler(options, readOptionValue(argv, index, inlineValue, flag));
      index += inlineValue === null ? 1 : 0;
      continue;
    }

    const flagOptionHandler = flagOptionHandlers.get(flag);
    if (flagOptionHandler) {
      flagOptionHandler(options);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (version) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    version = arg;
  }

  if (!version) {
    throw new Error("Version argument is required.");
  }

  return { help: false, options, version };
}

function splitOption(arg) {
  const equalsIndex = arg.indexOf("=");
  if (!arg.startsWith("--") || equalsIndex === -1) {
    return [arg, null];
  }

  return [arg.slice(0, equalsIndex), arg.slice(equalsIndex + 1)];
}

function readOptionValue(argv, index, inlineValue, flag) {
  const value = inlineValue ?? argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function prepareBranch(plan, options) {
  if (options.dryRun) {
    printDryRun(plan, options);
    return;
  }

  ensureCleanWorktree();

  if (!options.skipFetch) {
    runGit(["fetch", options.originRemote]);
    runGit(["fetch", "--tags", options.upstreamRemote]);
  }

  verifyGitRef(`${options.baseRef}^{commit}`, `base ref ${options.baseRef}`);
  verifyGitRef(`${plan.previousTag}^{commit}`, `previous upstream tag ${plan.previousTag}`);
  verifyGitRef(`${plan.targetTag}^{commit}`, `target upstream tag ${plan.targetTag}`);

  const branchRef = `refs/heads/${plan.branchName}`;
  const remoteBranch = `${options.originRemote}/${plan.branchName}`;

  if (gitRefExists(branchRef)) {
    runGit(["switch", plan.branchName]);
    if (options.resetExisting) {
      runGit(["reset", "--hard", options.baseRef]);
    }
    return;
  }

  if (gitRefExists(`refs/remotes/${remoteBranch}`)) {
    runGit(["switch", "--track", remoteBranch]);
    if (options.resetExisting) {
      runGit(["reset", "--hard", options.baseRef]);
    }
    return;
  }

  runGit(["switch", "-c", plan.branchName, options.baseRef]);
}

function printDryRun(plan, options) {
  process.stdout.write(
    [
      `Target version: ${plan.targetTag}`,
      `Previous version: ${plan.previousTag}`,
      `Branch: ${plan.branchName}`,
      `Base: ${options.baseRef}`,
      `Upstream compare: ${plan.upstreamCompareUrl}`,
      "",
      "Git commands:",
      options.skipFetch ? "  (fetch skipped)" : `  git fetch ${options.originRemote}`,
      options.skipFetch ? "" : `  git fetch --tags ${options.upstreamRemote}`,
      `  git switch ${plan.branchName} || git switch -c ${plan.branchName} ${options.baseRef}`,
      options.resetExisting ? `  git reset --hard ${options.baseRef}` : "",
      "",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  );
  process.stdout.write("\n\n");

  if (options.noAgents) {
    process.stdout.write("Agent launch skipped by --no-agents.\n");
    return;
  }

  for (const launch of buildAgentLaunches(plan, options)) {
    const command = formatCommand([
      options.paseoBin,
      ...buildPaseoRunArgs(launch, options, "<prompt>"),
    ]);
    process.stdout.write(`${launch.outputLabel} command:\n  ${command}\n\n`);
  }
}

function formatCommand(args) {
  return args.map(shellQuote).join(" ");
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function ensureCleanWorktree() {
  const status = runGitCapture(["status", "--porcelain"]);
  if (status.trim().length > 0) {
    throw new Error(
      `Working tree is not clean. Commit, stash, or discard changes before preparing a merge branch.\n${status}`,
    );
  }
}

function verifyGitRef(ref, label) {
  if (!gitRefExists(ref)) {
    throw new Error(`Missing ${label}. Fetch the relevant remote or pass a different option.`);
  }
}

function gitRefExists(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  return result.status === 0;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function runGitCapture(args) {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function buildAgentLaunches(plan, options = defaultOptions) {
  return [
    {
      labels: [
        `upstream-merge-version=${plan.targetTag}`,
        `upstream-merge-branch=${plan.branchName}`,
      ],
      outputLabel: "Resolve conflict agent",
      role: "resolve-conflicts",
      title: `Resolve conflict: ${plan.previousTag}..${plan.targetTag}`,
      prompt: composeResolvePrompt(plan, options),
    },
    {
      labels: [
        `upstream-merge-version=${plan.targetTag}`,
        `upstream-merge-branch=${plan.branchName}`,
      ],
      outputLabel: "Make PR agent",
      role: "make-pr",
      title: `Make PR: ${plan.previousTag}..${plan.targetTag}`,
      prompt: composeMakePrPrompt(plan, options),
    },
    {
      labels: [
        `upstream-merge-version=${plan.targetTag}`,
        `upstream-merge-branch=${plan.branchName}`,
      ],
      outputLabel: "Fix CI failures agent",
      role: "fix-ci",
      title: `Fix CI failures: ${plan.previousTag}..${plan.targetTag}`,
      prompt: composeFixCiPrompt(plan, options),
    },
  ];
}

export function buildPaseoRunArgs(launch, options, prompt = launch.prompt) {
  const args = [
    "run",
    "--json",
    "--detach",
    "--cwd",
    rootDir,
    "--title",
    launch.title,
    "--label",
    `upstream-merge-role=${launch.role}`,
  ];

  for (const label of launch.labels ?? []) {
    args.push("--label", label);
  }

  if (options.provider) {
    args.push("--provider", options.provider);
  }
  if (options.mode) {
    args.push("--mode", options.mode);
  }

  args.push(prompt);
  return args;
}

function composeCommonContext(plan, options) {
  return [
    `Repository: ${rootDir}`,
    `Branch: ${plan.branchName}`,
    `Base ref: ${options.baseRef}`,
    `Fork remote: ${options.originRemote}`,
    `Upstream remote: ${options.upstreamRemote}`,
    `Previous upstream tag: ${plan.previousTag}`,
    `Target upstream tag: ${plan.targetTag}`,
    `Upstream compare: ${plan.upstreamCompareUrl}`,
    "",
    "Hard rules:",
    "- Do not merge the pull request.",
    "- Do not restart the main Paseo daemon.",
    "- Work with any changes made by the other merge agents; do not revert them blindly.",
    "- Follow AGENTS.md/CLAUDE.md and the docs in docs/ before making non-trivial changes.",
  ].join("\n");
}

function composeResolvePrompt(plan, options) {
  return [
    `You are the Resolve conflict agent for ${plan.title}.`,
    "",
    composeCommonContext(plan, options),
    "",
    "Your job:",
    "1. Switch to the merge branch and fetch the fork plus upstream tags if needed.",
    `2. Merge ${plan.targetTag} into ${plan.branchName} with a real merge commit, preserving the release range ${plan.previousTag}..${plan.targetTag}.`,
    "3. Resolve conflicts carefully. Preserve this fork's MeowFlow-specific workflow, skills, and docs unless the upstream change clearly supersedes the local code.",
    "4. Run `npm run format`, `npm run lint`, and `npm run typecheck` after resolving conflicts. Run focused tests for files you materially change.",
    `5. Commit the result if needed. Preferred commit title: ${plan.title}`,
    `6. Push the branch with: git push -u ${options.originRemote} ${plan.branchName}`,
    "",
    "Useful checks:",
    `- git merge-base --is-ancestor ${plan.previousTag} ${options.baseRef}`,
    `- git merge-base --is-ancestor ${plan.targetTag} HEAD`,
    `- git log --oneline --decorate --graph --max-count=20`,
    "",
    "Finish by reporting the final commit SHA, pushed branch, verification commands, and any unresolved risks.",
  ].join("\n");
}

function composeMakePrPrompt(plan, options) {
  return [
    `You are the Make PR agent for ${plan.title}.`,
    "",
    composeCommonContext(plan, options),
    "",
    "Your job:",
    "1. Wait until the resolve-conflicts agent has produced a branch with no unmerged paths and the target upstream tag is an ancestor of HEAD.",
    `2. Push ${plan.branchName} to ${options.originRemote} if it is not already pushed.`,
    "3. Create or update the GitHub pull request against `main`.",
    "4. Keep the PR open and ready for review; do not merge it.",
    "",
    "Use this title:",
    plan.title,
    "",
    "Use a PR body based on the previous upstream-merge PR style. Include:",
    `- Summary: merge upstream release range \`${plan.previousTag}..${plan.targetTag}\` into \`main\`.`,
    "- Previous and target release commit SHAs.",
    `- Upstream compare link: ${plan.upstreamCompareUrl}`,
    "- Commit counts for the upstream range and for commits newly introduced by this PR.",
    "- A Merged Commits section generated from the upstream range, preserving commit subjects.",
    "- Verification with only commands that actually ran.",
    "",
    "Useful commands:",
    `- gh pr list --head ${plan.branchName} --base main --json number,url,state,isDraft`,
    `- gh pr create --base main --head ${plan.branchName} --title "${plan.title}" --body-file <body-file>`,
    "- gh pr edit <number> --title ... --body-file <body-file>",
    `- git log --reverse --format='- [%h](https://github.com/getpaseo/paseo/commit/%H) %s' ${plan.previousTag}..${plan.targetTag}`,
    "",
    "Finish by reporting the PR number, PR URL, whether it is draft or ready, and any missing verification.",
  ].join("\n");
}

function composeFixCiPrompt(plan, options) {
  return [
    `You are the Fix CI failures agent for ${plan.title}.`,
    "",
    composeCommonContext(plan, options),
    "",
    "Your job:",
    "1. Wait until the PR exists and the resolve-conflicts agent is no longer in the middle of a merge.",
    "2. Monitor PR checks. If checks are pending, wait and re-check instead of restarting local services.",
    "3. When a check fails, inspect the failing logs, make the smallest correct fix, and coordinate with the other agents' branch changes.",
    "4. Run the focused failing test or command, then `npm run format`, `npm run lint`, and `npm run typecheck` before pushing fixes.",
    `5. Push fixes to ${options.originRemote}/${plan.branchName}. Do not merge the PR.`,
    "",
    "Useful commands:",
    `- gh pr list --head ${plan.branchName} --base main --json number,url,state,isDraft,statusCheckRollup`,
    "- gh pr checks <number>",
    "- gh run view <run-id> --log-failed",
    "- git pull --ff-only",
    "- git status --short",
    "",
    "Finish by reporting the PR URL, check state, fixes pushed, verification commands, and any failures that still need human input.",
  ].join("\n");
}

function launchAgents(plan, options) {
  if (options.noAgents) {
    process.stdout.write("Agent launch skipped by --no-agents.\n");
    return;
  }

  for (const launch of buildAgentLaunches(plan, options)) {
    const result = spawnSync(options.paseoBin, buildPaseoRunArgs(launch, options), {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.stderr.length > 0) {
      process.stderr.write(result.stderr);
    }
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `${options.paseoBin} run failed for ${launch.outputLabel} with exit code ${result.status}.`,
      );
    }

    const parsed = parsePaseoRunOutput(result.stdout);
    if (!parsed) {
      throw new Error(
        `${options.paseoBin} run succeeded for ${launch.outputLabel}, but the agent id could not be parsed.\n${result.stdout}`,
      );
    }

    process.stdout.write(`${launch.outputLabel}: ${parsed.agentId}\n`);
  }
}

export function parsePaseoRunOutput(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.agentId === "string" &&
      parsed.agentId.trim().length > 0
    ) {
      return { agentId: parsed.agentId };
    }
  } catch {
    const match = /\bagent(?:-id|Id)?\s*[:=]\s*([A-Za-z0-9_-]+)/.exec(stdout);
    if (match?.[1]) {
      return { agentId: match[1] };
    }
  }

  return null;
}

export function main(argv = process.argv.slice(2)) {
  const parsedArgs = parseArgs(argv);
  if (parsedArgs.help) {
    process.stdout.write(usage());
    return;
  }

  const plan = buildMergePlan(parsedArgs.version, parsedArgs.options);
  prepareBranch(plan, parsedArgs.options);

  if (!parsedArgs.options.dryRun) {
    process.stdout.write(
      [
        `Prepared branch: ${plan.branchName}`,
        `Target: ${plan.previousTag}..${plan.targetTag}`,
        "",
      ].join("\n"),
    );
    launchAgents(plan, parsedArgs.options);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
