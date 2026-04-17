import { useEffect } from "react";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { useSessionStore } from "@/stores/session-store";
import { useFormPreferences } from "@/hooks/use-form-preferences";
import {
  buildHostAgentDetailRoute,
  buildHostOpenProjectRoute,
  buildHostRootRoute,
  buildHostWorkspaceOpenRoute,
} from "@/utils/host-routes";
import { resolveWorkspaceIdByExecutionDirectory } from "@/utils/workspace-execution";
import { prepareWorkspaceTab } from "@/utils/workspace-navigation";

const HOST_ROOT_REDIRECT_DELAY_MS = 300;

export default function HostIndexRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <HostIndexRouteContent />
    </HostRouteBootstrapBoundary>
  );
}

function HostIndexRouteContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const { isLoading: preferencesLoading } = useFormPreferences();
  const sessionAgents = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.agents : undefined,
  );
  const sessionWorkspaces = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.workspaces : undefined,
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
        ? Array.from(sessionAgents.values()).filter((agent) => !agent.archivedAt)
        : [];
      visibleAgents.sort(
        (left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime(),
      );

      const visibleWorkspaces = sessionWorkspaces ? Array.from(sessionWorkspaces.values()) : [];

      const primaryAgent = visibleAgents[0];
      const primaryAgentWorkspaceId = resolveWorkspaceIdByExecutionDirectory({
        workspaces: sessionWorkspaces?.values(),
        workspaceDirectory: primaryAgent?.cwd,
      });
      if (primaryAgent && primaryAgentWorkspaceId) {
        router.replace(
          prepareWorkspaceTab({
            serverId,
            workspaceId: primaryAgentWorkspaceId,
            target: { kind: "agent", agentId: primaryAgent.id },
          }) as any,
        );
        return;
      }
      if (primaryAgent) {
        router.replace(buildHostAgentDetailRoute(serverId, primaryAgent.id) as any);
        return;
      }

      const primaryWorkspace = visibleWorkspaces[0];
      if (primaryWorkspace?.id?.trim()) {
        router.replace(
          buildHostWorkspaceOpenRoute(serverId, primaryWorkspace.id.trim(), "draft:new") as any,
        );
        return;
      }

      router.replace(buildHostOpenProjectRoute(serverId));
    }, HOST_ROOT_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [pathname, preferencesLoading, router, serverId, sessionAgents, sessionWorkspaces]);

  return null;
}
