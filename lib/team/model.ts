import "server-only";

import { openai } from "@inngest/agent-kit";
import { teamConfig } from "@/team.config";
import { missingOpenAiConfigMessage, teamRuntimeConfig } from "@/lib/team/runtime-config";

export const ensureOpenAiApiKey = (): void => {
  if (!teamRuntimeConfig.apiKey) {
    throw new Error(missingOpenAiConfigMessage);
  }
};

export const createTeamModel = () => {
  // AgentKit 0.13.2 does not understand the newer "openai-responses" adapter
  // format yet, so use the compatible OpenAI chat adapter until upstream
  // support lands.
  return openai({
    model: teamConfig.model.model,
    apiKey: teamRuntimeConfig.apiKey ?? undefined,
    baseUrl: teamRuntimeConfig.baseUrl,
    defaultParameters: {
      store: false,
      max_completion_tokens: teamConfig.model.maxOutputTokens,
    },
  });
};
