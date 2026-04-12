import "server-only";

import { teamConfig } from "@/team.config";
import {
  getTeamThreadStorageState,
  resetTeamThreadStorageStateCacheForTests,
  type TeamThreadStorageState,
} from "@/lib/team/storage";

export type TeamServerState = {
  threadFile: string;
  threadStorage: TeamThreadStorageState;
};

type TeamServerStateRegistry = {
  threadFile: string | null;
  statePromise: Promise<TeamServerState> | null;
};

const getTeamServerStateRegistry = (): TeamServerStateRegistry => {
  const globalRegistry = globalThis as typeof globalThis & {
    __teamServerStateRegistry?: TeamServerStateRegistry;
  };

  globalRegistry.__teamServerStateRegistry ??= {
    threadFile: null,
    statePromise: null,
  };

  return globalRegistry.__teamServerStateRegistry;
};

export const getTeamServerState = async (): Promise<TeamServerState> => {
  const registry = getTeamServerStateRegistry();
  const threadFile = teamConfig.storage.threadFile;

  if (!registry.statePromise || registry.threadFile !== threadFile) {
    registry.threadFile = threadFile;
    registry.statePromise = (async () => {
      return {
        threadFile,
        threadStorage: await getTeamThreadStorageState(threadFile),
      };
    })();
  }

  try {
    return await registry.statePromise;
  } catch (error) {
    if (registry.threadFile === threadFile) {
      registry.threadFile = null;
      registry.statePromise = null;
    }

    throw error;
  }
};

export const resetTeamServerStateForTests = async (): Promise<void> => {
  const registry = getTeamServerStateRegistry();
  registry.threadFile = null;
  registry.statePromise = null;
  await resetTeamThreadStorageStateCacheForTests();
};
