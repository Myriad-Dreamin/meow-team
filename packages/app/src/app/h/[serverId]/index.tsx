import { useEffect } from "react";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useSessionStore } from "@/stores/session-store";
import { useFormPreferences } from "@/hooks/use-form-preferences";
import {
  buildHostRootRoute,
  buildHostWorkspaceAgentRoute,
  buildHostWorkspaceRoute,
} from "@/utils/host-routes";

const HOST_ROOT_REDIRECT_DELAY_MS = 300;

export default function HostIndexRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const { preferences, isLoading: preferencesLoading } = useFormPreferences();
  const sessionAgents = useSessionStore(
    (state) => (serverId ? state.sessions[serverId]?.agents : undefined)
  );

  useEffect(() => {
    if (preferencesLoading) {
      return;
    }
    if (!serverId) {
      return;
    }
    const rootRoute = buildHostRootRoute(serverId);
    if (pathname !== rootRoute && pathname !== `${rootRoute}/`) {
      return;
    }
    const timer = setTimeout(() => {
      if (pathname !== rootRoute && pathname !== `${rootRoute}/`) {
        return;
      }

      const visibleAgents = sessionAgents
        ? Array.from(sessionAgents.values()).filter(
            (agent) => !agent.archivedAt
          )
        : [];
      visibleAgents.sort(
        (left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime()
      );

      const primaryAgent = visibleAgents[0];
      if (primaryAgent?.cwd?.trim()) {
        router.replace(
          buildHostWorkspaceAgentRoute(
            serverId,
            primaryAgent.cwd.trim(),
            primaryAgent.id
          ) as any
        );
        return;
      }

      const preferredWorkingDir =
        preferences.serverId === serverId ? preferences.workingDir?.trim() : "";
      const workspaceId = preferredWorkingDir || ".";
      router.replace(buildHostWorkspaceRoute(serverId, workspaceId) as any);
    }, HOST_ROOT_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    pathname,
    preferences.serverId,
    preferences.workingDir,
    preferencesLoading,
    router,
    serverId,
    sessionAgents,
  ]);

  return null;
}
