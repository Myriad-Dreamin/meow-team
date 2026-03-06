import { useGlobalSearchParams, usePathname } from 'expo-router'
import { WorkspaceScreen } from '@/screens/workspace/workspace-screen'
import {
  parseHostWorkspaceRouteFromPathname,
  parseWorkspaceOpenIntent,
} from '@/utils/host-routes'

export default function HostWorkspaceLayout() {
  const expoPathname = usePathname()
  const params = useGlobalSearchParams<{ open?: string | string[] }>()
  const activeRoute = parseHostWorkspaceRouteFromPathname(expoPathname)
  const serverId = activeRoute?.serverId ?? ''
  const workspaceId = activeRoute?.workspaceId ?? ''
  const openValue = Array.isArray(params.open) ? params.open[0] : params.open
  const openIntent = parseWorkspaceOpenIntent(openValue)

  return (
    <WorkspaceScreen
      key={`${serverId}:${workspaceId}`}
      serverId={serverId}
      workspaceId={workspaceId}
      openIntent={openIntent}
    />
  )
}
