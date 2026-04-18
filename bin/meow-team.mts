#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON

import { Cli } from "clipanion";
import { createCli } from "../lib/cli/create-cli.ts";

async function main() {
  await createCli().runExit(process.argv.slice(2), Cli.defaultContext);
}

void main();
