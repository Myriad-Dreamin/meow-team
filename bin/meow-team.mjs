#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON

import { runMeowTeamCliExit } from "../lib/cli/app.ts";

await runMeowTeamCliExit(process.argv.slice(2));
