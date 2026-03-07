import {
  View,
  Text,
  Pressable,
  Image,
  Platform,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  type GestureResponderEvent,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useQueries } from '@tanstack/react-query'
import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactElement,
  type MutableRefObject,
} from 'react'
import { router, usePathname } from 'expo-router'
import { StyleSheet, UnistylesRuntime, useUnistyles } from 'react-native-unistyles'
import { type GestureType } from 'react-native-gesture-handler'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { NestableScrollContainer } from 'react-native-draggable-flatlist'
import { DraggableList, type DraggableRenderItemInfo } from './draggable-list'
import type { DraggableListDragHandleProps } from './draggable-list.types'
import { getHostRuntimeStore, isHostRuntimeConnected } from '@/runtime/host-runtime'
import { getIsTauri } from '@/constants/layout'
import { projectIconQueryKey } from '@/hooks/use-project-icon-query'
import {
  buildHostWorkspaceRoute,
  parseHostWorkspaceRouteFromPathname,
} from '@/utils/host-routes'
import {
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  type SidebarStateBucket,
} from '@/hooks/use-sidebar-workspaces-list'
import { useSidebarOrderStore } from '@/stores/sidebar-order-store'
import { useKeyboardShortcutsStore } from '@/stores/keyboard-shortcuts-store'
import { formatTimeAgo } from '@/utils/time'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  useContextMenu,
} from '@/components/ui/context-menu'
import { SyncedLoader } from '@/components/synced-loader'
import { useToast } from '@/contexts/toast-context'
import { useCheckoutGitActionsStore } from '@/stores/checkout-git-actions-store'
import { buildSidebarShortcutModel } from '@/utils/sidebar-shortcuts'
import { hasVisibleOrderChanged, mergeWithRemainder } from '@/utils/sidebar-reorder'
import { decideLongPressMove } from '@/utils/sidebar-gesture-arbitration'
import { confirmDialog } from '@/utils/confirm-dialog'
import { projectIconPlaceholderLabelFromDisplayName } from '@/utils/project-display-name'
import { shouldRenderSyncedStatusLoader } from '@/utils/status-loader'

const PASEO_WORKTREE_PATH_MARKER = '/.paseo/worktrees'

function toProjectIconDataUri(icon: { mimeType: string; data: string } | null): string | null {
  if (!icon) {
    return null
  }
  return `data:${icon.mimeType};base64,${icon.data}`
}

interface SidebarWorkspaceListProps {
  isOpen?: boolean
  projects: SidebarProjectEntry[]
  serverId: string | null
  isRefreshing?: boolean
  onRefresh?: () => void
  onWorkspacePress?: () => void
  listFooterComponent?: ReactElement | null
  /** Gesture ref for coordinating with parent gestures (e.g., sidebar close) */
  parentGestureRef?: MutableRefObject<GestureType | undefined>
}

interface ProjectHeaderRowProps {
  project: SidebarProjectEntry
  displayName: string
  iconDataUri: string | null
  collapsed: boolean
  onToggle: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}

interface WorkspaceRowInnerProps {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  isArchiving: boolean
  dragHandleProps?: DraggableListDragHandleProps
  menuController: ReturnType<typeof useContextMenu> | null
}

function resolveWorkspaceCreatedAtLabel(workspace: SidebarWorkspaceEntry): string | null {
  if (!workspace.activityAt) {
    return null
  }
  return formatTimeAgo(workspace.activityAt)
}

function resolveStatusDotColor(input: {
  theme: ReturnType<typeof useUnistyles>['theme']
  bucket: SidebarStateBucket
}) {
  const { theme, bucket } = input
  return bucket === 'needs_input'
    ? theme.colors.palette.amber[500]
    : bucket === 'failed'
      ? theme.colors.palette.red[500]
      : bucket === 'running'
        ? theme.colors.palette.blue[500]
        : bucket === 'attention'
          ? theme.colors.palette.green[500]
          : theme.colors.border
}

function isPaseoOwnedWorktreePath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/')
  const markerIndex = normalizedPath.indexOf(PASEO_WORKTREE_PATH_MARKER)
  if (markerIndex <= 0) {
    return false
  }
  const nextChar = normalizedPath[markerIndex + PASEO_WORKTREE_PATH_MARKER.length]
  return !nextChar || nextChar === '/'
}

function WorkspaceStatusIndicator({
  bucket,
  loading = false,
}: {
  bucket: SidebarWorkspaceEntry['statusBucket']
  loading?: boolean
}) {
  const { theme } = useUnistyles()
  const color = resolveStatusDotColor({ theme, bucket })
  const shouldShowSyncedLoader = shouldRenderSyncedStatusLoader({ bucket })

  return (
    <View style={styles.workspaceStatusDot}>
      {loading ? (
        <ActivityIndicator size={8} color={theme.colors.foregroundMuted} />
      ) : shouldShowSyncedLoader ? (
        <SyncedLoader size={11} color={theme.colors.palette.amber[500]} />
      ) : (
        <View style={[styles.workspaceStatusDotFill, { backgroundColor: color }]} />
      )}
    </View>
  )
}

function useLongPressDragInteraction(input: {
  drag: () => void
  menuController: ReturnType<typeof useContextMenu> | null
  debugId: string
}) {
  const didLongPressRef = useRef(false)
  const dragArmedRef = useRef(false)
  const dragActivatedRef = useRef(false)
  const didStartDragRef = useRef(false)
  const scrollIntentRef = useRef(false)
  const menuOpenedRef = useRef(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchCurrentRef = useRef<{ x: number; y: number } | null>(null)
  const dragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (dragArmTimerRef.current) {
      clearTimeout(dragArmTimerRef.current)
      dragArmTimerRef.current = null
    }
    if (contextMenuTimerRef.current) {
      clearTimeout(contextMenuTimerRef.current)
      contextMenuTimerRef.current = null
    }
  }, [])

  const openContextMenuAtStartPoint = useCallback(() => {
    if (!input.menuController || !touchStartRef.current) {
      return
    }
    const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0
    input.menuController.setAnchorRect({
      x: touchStartRef.current.x,
      y: touchStartRef.current.y + statusBarHeight,
      width: 0,
      height: 0,
    })
    input.menuController.setOpen(true)
    menuOpenedRef.current = true
    didLongPressRef.current = true
    console.log('[sidebar-dnd-debug] context menu opened', { id: input.debugId })
  }, [input.debugId, input.menuController])

  const handleLongPress = useCallback(() => {
    // Manual timers own long-press behavior on mobile.
    console.log('[sidebar-dnd-debug] native onLongPress ignored (manual state machine active)', {
      id: input.debugId,
    })
  }, [input.debugId])

  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  const armTimers = useCallback(() => {
    clearTimers()

    const DRAG_ARM_DELAY_MS = 180
    const DRAG_ARM_STATIONARY_SLOP_PX = 4
    const CONTEXT_MENU_DELAY_MS = 450
    const CONTEXT_MENU_STATIONARY_SLOP_PX = 6

    dragArmTimerRef.current = setTimeout(() => {
      if (scrollIntentRef.current || didStartDragRef.current || menuOpenedRef.current) {
        return
      }
      const start = touchStartRef.current
      const current = touchCurrentRef.current ?? start
      if (!start || !current) {
        return
      }
      const dx = current.x - start.x
      const dy = current.y - start.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > DRAG_ARM_STATIONARY_SLOP_PX) {
        console.log('[sidebar-dnd-debug] drag arm cancelled (movement)', {
          id: input.debugId,
          distance,
        })
        return
      }
      dragArmedRef.current = true
      dragActivatedRef.current = true
      didLongPressRef.current = true
      console.log('[sidebar-dnd-debug] drag armed', { id: input.debugId })
      void Haptics.selectionAsync().catch(() => {})
      input.drag()
    }, DRAG_ARM_DELAY_MS)

    if (!input.menuController || Platform.OS === 'web') {
      return
    }

    contextMenuTimerRef.current = setTimeout(() => {
      if (scrollIntentRef.current || didStartDragRef.current || menuOpenedRef.current) {
        return
      }
      const start = touchStartRef.current
      const current = touchCurrentRef.current ?? start
      if (!start || !current) {
        return
      }
      const dx = current.x - start.x
      const dy = current.y - start.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > CONTEXT_MENU_STATIONARY_SLOP_PX) {
        console.log('[sidebar-dnd-debug] context menu cancelled (movement)', {
          id: input.debugId,
          distance,
        })
        return
      }
      console.log('[sidebar-dnd-debug] long-press armed', { id: input.debugId })
      void Haptics.selectionAsync().catch(() => {})
      openContextMenuAtStartPoint()
    }, CONTEXT_MENU_DELAY_MS)
  }, [clearTimers, input.debugId, input.menuController, openContextMenuAtStartPoint])

  const handleDragIntent = useCallback(
    (details: { dx: number; dy: number; distance: number }) => {
      if (!dragActivatedRef.current) {
        return
      }
      didStartDragRef.current = true
      didLongPressRef.current = true
      clearTimers()
      console.log('[sidebar-dnd-debug] drag movement detected', { id: input.debugId, ...details })
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    },
    [clearTimers, input.debugId]
  )

  const handleScrollIntent = useCallback(
    (details: { dx: number; dy: number; distance: number }) => {
      scrollIntentRef.current = true
      didLongPressRef.current = true
      clearTimers()
      console.log('[sidebar-dnd-debug] scroll intent detected', { id: input.debugId, ...details })
    },
    [clearTimers, input.debugId]
  )

  const handleSwipeIntent = useCallback(
    (details: { dx: number; dy: number; distance: number }) => {
      didLongPressRef.current = true
      clearTimers()
      console.log('[sidebar-dnd-debug] swipe intent detected', { id: input.debugId, ...details })
    },
    [clearTimers, input.debugId]
  )

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    didLongPressRef.current = false
    dragArmedRef.current = false
    dragActivatedRef.current = false
    didStartDragRef.current = false
    scrollIntentRef.current = false
    menuOpenedRef.current = false
    touchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    }
    touchCurrentRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    }
    console.log('[sidebar-dnd-debug] press-in', {
      id: input.debugId,
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    })
    armTimers()
  }, [armTimers, input.debugId])

  const handleTouchMove = useCallback(
    (event: any) => {
      const start = touchStartRef.current
      if (!start || didStartDragRef.current || menuOpenedRef.current) {
        return
      }

      const touch = event?.nativeEvent?.touches?.[0] ?? event?.nativeEvent
      const x = touch?.pageX
      const y = touch?.pageY
      if (typeof x !== 'number' || typeof y !== 'number') {
        return
      }

      const current = { x, y }
      touchCurrentRef.current = current
      const dx = current.x - start.x
      const dy = current.y - start.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const decision = decideLongPressMove({
        dragArmed: dragArmedRef.current,
        didStartDrag: didStartDragRef.current,
        startPoint: start,
        currentPoint: current,
      })

      if (decision === 'vertical_scroll') {
        handleScrollIntent({ dx, dy, distance })
        return
      }

      if (decision === 'horizontal_swipe' || decision === 'cancel_long_press') {
        handleSwipeIntent({ dx, dy, distance })
        return
      }

      if (decision === 'start_drag') {
        handleDragIntent({ dx, dy, distance })
      }
    },
    [handleDragIntent, handleScrollIntent, handleSwipeIntent]
  )

  const handlePressOut = useCallback(() => {
    clearTimers()
    console.log('[sidebar-dnd-debug] press-out no context-menu', {
      id: input.debugId,
      didLongPress: didLongPressRef.current,
      didStartDrag: didStartDragRef.current,
      dragActivated: dragActivatedRef.current,
      scrollIntent: scrollIntentRef.current,
      dragArmed: dragArmedRef.current,
      menuOpened: menuOpenedRef.current,
    })
    dragArmedRef.current = false
    dragActivatedRef.current = false
    touchStartRef.current = null
    touchCurrentRef.current = null
  }, [clearTimers, input.debugId])

  return {
    didLongPressRef,
    handleLongPress,
    handlePressIn,
    handleTouchMove,
    handlePressOut,
  }
}

function ProjectHeaderRow({
  project,
  displayName,
  iconDataUri,
  collapsed,
  onToggle,
  drag,
  isDragging,
  dragHandleProps,
}: ProjectHeaderRowProps) {
  const interaction = useLongPressDragInteraction({
    drag,
    menuController: null,
    debugId: `project:${project.projectKey}`,
  })
  const placeholderLabel = projectIconPlaceholderLabelFromDisplayName(displayName)
  const placeholderInitial = placeholderLabel.charAt(0).toUpperCase()

  const handlePress = useCallback(() => {
    if (interaction.didLongPressRef.current) {
      interaction.didLongPressRef.current = false
      return
    }
    onToggle()
  }, [interaction.didLongPressRef, onToggle])

  const trigger = (
    <Pressable
      style={({ pressed, hovered = false }) => [
        styles.projectRow,
        isDragging && styles.projectRowDragging,
        hovered && styles.projectRowHovered,
        pressed && styles.projectRowPressed,
      ]}
      onPressIn={interaction.handlePressIn}
      onTouchMove={interaction.handleTouchMove}
      onPressOut={interaction.handlePressOut}
      onPress={handlePress}
      testID={`sidebar-project-row-${project.projectKey}`}
    >
      <View
        {...(dragHandleProps?.attributes as any)}
        {...(dragHandleProps?.listeners as any)}
        ref={dragHandleProps?.setActivatorNodeRef as any}
        style={styles.projectRowLeft}
      >
        {iconDataUri ? (
          <Image source={{ uri: iconDataUri }} style={styles.projectIcon} />
        ) : (
          <View style={styles.projectIconFallback}>
            <Text style={styles.projectIconFallbackText}>{placeholderInitial}</Text>
          </View>
        )}

        <Text style={styles.projectTitle} numberOfLines={1}>
          {displayName}
        </Text>

        {collapsed ? (
          <ChevronRight size={14} color="#9ca3af" />
        ) : (
          <ChevronDown size={14} color="#9ca3af" />
        )}
      </View>
    </Pressable>
  )

  return trigger
}

function WorkspaceRowInner({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  isArchiving,
  dragHandleProps,
  menuController,
}: WorkspaceRowInnerProps) {
  const createdAtLabel = resolveWorkspaceCreatedAtLabel(workspace)
  const interaction = useLongPressDragInteraction({
    drag,
    menuController,
    debugId: `workspace:${workspace.workspaceKey}`,
  })

  const handlePress = useCallback(() => {
    if (interaction.didLongPressRef.current) {
      interaction.didLongPressRef.current = false
      return
    }
    onPress()
  }, [interaction.didLongPressRef, onPress])

  const rowChildren = (
    <>
      <View
        {...(dragHandleProps?.attributes as any)}
        {...(dragHandleProps?.listeners as any)}
        ref={dragHandleProps?.setActivatorNodeRef as any}
        style={styles.workspaceRowLeft}
      >
        <WorkspaceStatusIndicator bucket={workspace.statusBucket} loading={isArchiving} />
        <Text style={styles.workspaceBranchText} numberOfLines={1}>
          {workspace.name}
        </Text>
      </View>
      <View style={styles.workspaceRowRight}>
        {createdAtLabel ? (
          <Text style={styles.workspaceCreatedAtText} numberOfLines={1}>
            {createdAtLabel}
          </Text>
        ) : null}
        {showShortcutBadge && shortcutNumber !== null ? (
          <View style={styles.shortcutBadge}>
            <Text style={styles.shortcutBadgeText}>{shortcutNumber}</Text>
          </View>
        ) : null}
      </View>
    </>
  )

  const trigger = menuController ? (
    <ContextMenuTrigger
      enabledOnMobile={false}
      disabled={isArchiving}
      style={({ pressed, hovered = false }) => [
        styles.workspaceRow,
        isDragging && styles.workspaceRowDragging,
        selected && styles.workspaceRowSelected,
        hovered && styles.workspaceRowHovered,
        pressed && styles.workspaceRowPressed,
      ]}
      onPressIn={interaction.handlePressIn}
      onTouchMove={interaction.handleTouchMove}
      onPressOut={interaction.handlePressOut}
      onPress={handlePress}
      testID={`sidebar-workspace-row-${workspace.workspaceKey}`}
    >
      {rowChildren}
    </ContextMenuTrigger>
  ) : (
    <Pressable
      disabled={isArchiving}
      style={({ pressed, hovered = false }) => [
        styles.workspaceRow,
        isDragging && styles.workspaceRowDragging,
        selected && styles.workspaceRowSelected,
        hovered && styles.workspaceRowHovered,
        pressed && styles.workspaceRowPressed,
      ]}
      onPressIn={interaction.handlePressIn}
      onTouchMove={interaction.handleTouchMove}
      onPressOut={interaction.handlePressOut}
      onPress={handlePress}
      testID={`sidebar-workspace-row-${workspace.workspaceKey}`}
    >
      {rowChildren}
    </Pressable>
  )

  const content = trigger

  return (
    <View style={styles.workspaceRowContainer}>
      {content}
    </View>
  )
}

function WorkspaceRowWithMenuContent({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
}: {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}) {
  const toast = useToast()
  const contextMenu = useContextMenu()
  const archiveWorktree = useCheckoutGitActionsStore((state) => state.archiveWorktree)
  const archiveStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({
      serverId: workspace.serverId,
      cwd: workspace.workspaceId,
      actionId: 'archive-worktree',
    })
  )
  const isArchiving = archiveStatus === 'pending'

  const handleArchiveWorktree = useCallback(() => {
    if (isArchiving) {
      return
    }

    void (async () => {
      const confirmed = await confirmDialog({
        title: 'Archive worktree?',
        message: `Archive "${workspace.name}"?\n\nThis removes the worktree from the sidebar.`,
        confirmLabel: 'Archive',
        cancelLabel: 'Cancel',
        destructive: true,
      })

      if (!confirmed) {
        return
      }

      void archiveWorktree({
        serverId: workspace.serverId,
        cwd: workspace.workspaceId,
        worktreePath: workspace.workspaceId,
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to archive worktree'
        toast.error(message)
      })
    })()
  }, [archiveWorktree, isArchiving, toast, workspace.name, workspace.serverId, workspace.workspaceId])

  return (
    <>
      <WorkspaceRowInner
        workspace={workspace}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        onPress={onPress}
        drag={drag}
        isDragging={isDragging}
        isArchiving={isArchiving}
        dragHandleProps={dragHandleProps}
        menuController={contextMenu}
      />
      <ContextMenuContent
        align="start"
        width={220}
        mobileMode="sheet"
        testID={`sidebar-workspace-context-${workspace.workspaceKey}`}
      >
        <ContextMenuItem
          testID={`sidebar-workspace-context-${workspace.workspaceKey}-archive`}
          status={archiveStatus}
          pendingLabel="Archiving..."
          destructive
          onSelect={handleArchiveWorktree}
        >
          Archive worktree
        </ContextMenuItem>
      </ContextMenuContent>
    </>
  )
}

function WorkspaceRowWithMenu({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
}: {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}) {
  return (
    <ContextMenu>
      <WorkspaceRowWithMenuContent
        workspace={workspace}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        onPress={onPress}
        drag={drag}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
      />
    </ContextMenu>
  )
}

function WorkspaceRowPlain({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
}: {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}) {
  return (
    <WorkspaceRowInner
      workspace={workspace}
      selected={selected}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      onPress={onPress}
      drag={drag}
      isDragging={isDragging}
      isArchiving={false}
      dragHandleProps={dragHandleProps}
      menuController={null}
    />
  )
}

function WorkspaceRow({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
}: {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}) {
  if (!isPaseoOwnedWorktreePath(workspace.workspaceId)) {
    return (
      <WorkspaceRowPlain
        workspace={workspace}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        onPress={onPress}
        drag={drag}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
      />
    )
  }

  return (
    <WorkspaceRowWithMenu
      workspace={workspace}
      selected={selected}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      onPress={onPress}
      drag={drag}
      isDragging={isDragging}
      dragHandleProps={dragHandleProps}
    />
  )
}

function ProjectBlock({
  project,
  collapsed,
  displayName,
  iconDataUri,
  serverId,
  activeWorkspaceSelection,
  showShortcutBadges,
  shortcutIndexByWorkspaceKey,
  parentGestureRef,
  onToggleCollapsed,
  onWorkspacePress,
  onWorkspaceReorder,
  drag,
  isDragging,
  dragHandleProps,
  useNestable,
}: {
  project: SidebarProjectEntry
  collapsed: boolean
  displayName: string
  iconDataUri: string | null
  serverId: string | null
  activeWorkspaceSelection: { serverId: string; workspaceId: string } | null
  showShortcutBadges: boolean
  shortcutIndexByWorkspaceKey: Map<string, number>
  parentGestureRef?: MutableRefObject<GestureType | undefined>
  onToggleCollapsed: () => void
  onWorkspacePress?: () => void
  onWorkspaceReorder: (projectKey: string, workspaces: SidebarWorkspaceEntry[]) => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
  useNestable: boolean
}) {
  const renderWorkspace = useCallback(
    ({
      item,
      drag: workspaceDrag,
      isActive,
      dragHandleProps: workspaceDragHandleProps,
    }: DraggableRenderItemInfo<SidebarWorkspaceEntry>) => {
      const workspaceRoute = buildHostWorkspaceRoute(serverId ?? '', item.workspaceId)
      const isSelected =
        Boolean(serverId) &&
        activeWorkspaceSelection?.serverId === serverId &&
        activeWorkspaceSelection.workspaceId === item.workspaceId

      return (
        <WorkspaceRow
          workspace={item}
          selected={isSelected}
          shortcutNumber={shortcutIndexByWorkspaceKey.get(item.workspaceKey) ?? null}
          showShortcutBadge={showShortcutBadges}
          onPress={() => {
            if (!serverId) {
              return
            }
            onWorkspacePress?.()
            router.replace(workspaceRoute as any)
          }}
          drag={workspaceDrag}
          isDragging={isActive}
          dragHandleProps={workspaceDragHandleProps}
        />
      )
    },
    [
      activeWorkspaceSelection,
      onWorkspacePress,
      serverId,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
    ]
  )

  return (
    <View style={styles.projectBlock}>
      <ProjectHeaderRow
        project={project}
        displayName={displayName}
        iconDataUri={iconDataUri}
        collapsed={collapsed}
        onToggle={onToggleCollapsed}
        drag={drag}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
      />

      {!collapsed ? (
        <DraggableList
          testID={`sidebar-workspace-list-${project.projectKey}`}
          data={project.workspaces}
          keyExtractor={(workspace) => workspace.workspaceKey}
          renderItem={renderWorkspace}
          onDragEnd={(workspaces) => onWorkspaceReorder(project.projectKey, workspaces)}
          scrollEnabled={false}
          useDragHandle
          nestable={useNestable}
          simultaneousGestureRef={parentGestureRef}
          containerStyle={styles.workspaceListContainer}
        />
      ) : null}
    </View>
  )
}

export function SidebarWorkspaceList({
  isOpen = true,
  projects,
  serverId,
  isRefreshing = false,
  onRefresh,
  onWorkspacePress,
  listFooterComponent,
  parentGestureRef,
}: SidebarWorkspaceListProps) {
  const isMobile = UnistylesRuntime.breakpoint === 'xs' || UnistylesRuntime.breakpoint === 'sm'
  const isNative = Platform.OS !== 'web'
  const pathname = usePathname()
  const [collapsedProjectKeys, setCollapsedProjectKeys] = useState<Set<string>>(new Set())
  const isTauri = getIsTauri()
  const altDown = useKeyboardShortcutsStore((state) => state.altDown)
  const cmdOrCtrlDown = useKeyboardShortcutsStore((state) => state.cmdOrCtrlDown)
  const setSidebarShortcutWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setSidebarShortcutWorkspaceTargets
  )
  const setVisibleWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setVisibleWorkspaceTargets
  )
  const showShortcutBadges = altDown || (isTauri && cmdOrCtrlDown)

  const getProjectOrder = useSidebarOrderStore((state) => state.getProjectOrder)
  const setProjectOrder = useSidebarOrderStore((state) => state.setProjectOrder)
  const getWorkspaceOrder = useSidebarOrderStore((state) => state.getWorkspaceOrder)
  const setWorkspaceOrder = useSidebarOrderStore((state) => state.setWorkspaceOrder)

  const activeWorkspaceSelection = useMemo(() => {
    if (!pathname) {
      return null
    }
    const parsed = parseHostWorkspaceRouteFromPathname(pathname)
    if (!parsed) {
      return null
    }
    return {
      serverId: parsed.serverId,
      workspaceId: parsed.workspaceId,
    }
  }, [pathname])

  useEffect(() => {
    setCollapsedProjectKeys((prev) => {
      const validProjectKeys = new Set(projects.map((project) => project.projectKey))
      const next = new Set<string>()
      for (const key of prev) {
        if (validProjectKeys.has(key)) {
          next.add(key)
        }
      }
      return next
    })
  }, [projects])

  const projectIconRequests = useMemo(() => {
    if (!isOpen || !serverId) {
      return []
    }
    const unique = new Map<string, { serverId: string; cwd: string }>()
    for (const project of projects) {
      const cwd = project.iconWorkingDir.trim()
      if (!cwd) {
        continue
      }
      unique.set(`${serverId}:${cwd}`, { serverId, cwd })
    }
    return Array.from(unique.values())
  }, [isOpen, projects, serverId])

  const projectIconQueries = useQueries({
    queries: projectIconRequests.map((request) => ({
      queryKey: projectIconQueryKey(request.serverId, request.cwd),
      queryFn: async () => {
        const client = getHostRuntimeStore().getClient(request.serverId)
        if (!client) {
          return null
        }
        const result = await client.requestProjectIcon(request.cwd)
        return result.icon
      },
      select: toProjectIconDataUri,
      enabled: Boolean(
        isOpen &&
        getHostRuntimeStore().getClient(request.serverId) &&
        isHostRuntimeConnected(getHostRuntimeStore().getSnapshot(request.serverId)) &&
        request.cwd
      ),
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  })

  const projectIconByProjectKey = useMemo(() => {
    const iconByServerAndCwd = new Map<string, string | null>()
    for (let index = 0; index < projectIconRequests.length; index += 1) {
      const request = projectIconRequests[index]
      if (!request) {
        continue
      }
      iconByServerAndCwd.set(
        `${request.serverId}:${request.cwd}`,
        projectIconQueries[index]?.data ?? null
      )
    }

    const byProject = new Map<string, string | null>()
    for (const project of projects) {
      const cwd = project.iconWorkingDir.trim()
      if (!cwd || !serverId) {
        byProject.set(project.projectKey, null)
        continue
      }
      byProject.set(project.projectKey, iconByServerAndCwd.get(`${serverId}:${cwd}`) ?? null)
    }

    return byProject
  }, [projectIconQueries, projectIconRequests, projects, serverId])

  const shortcutModel = useMemo(
    () =>
      buildSidebarShortcutModel({
        projects,
        collapsedProjectKeys,
      }),
    [collapsedProjectKeys, projects]
  )

  useEffect(() => {
    setSidebarShortcutWorkspaceTargets(shortcutModel.shortcutTargets)
    setVisibleWorkspaceTargets(shortcutModel.visibleTargets)
  }, [
    setSidebarShortcutWorkspaceTargets,
    setVisibleWorkspaceTargets,
    shortcutModel.shortcutTargets,
    shortcutModel.visibleTargets,
  ])

  useEffect(() => {
    return () => {
      setSidebarShortcutWorkspaceTargets([])
      setVisibleWorkspaceTargets([])
    }
  }, [setSidebarShortcutWorkspaceTargets, setVisibleWorkspaceTargets])

  const toggleProjectCollapsed = useCallback((projectKey: string) => {
    setCollapsedProjectKeys((prev) => {
      const next = new Set(prev)
      if (next.has(projectKey)) {
        next.delete(projectKey)
      } else {
        next.add(projectKey)
      }
      return next
    })
  }, [])

  const handleProjectDragEnd = useCallback(
    (reorderedProjects: SidebarProjectEntry[]) => {
      if (!serverId) {
        return
      }

      const reorderedProjectKeys = reorderedProjects.map((project) => project.projectKey)
      const currentProjectOrder = getProjectOrder(serverId)
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        })
      ) {
        return
      }

      setProjectOrder(
        serverId,
        mergeWithRemainder({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        })
      )
    },
    [getProjectOrder, serverId, setProjectOrder]
  )

  const handleWorkspaceReorder = useCallback(
    (projectKey: string, reorderedWorkspaces: SidebarWorkspaceEntry[]) => {
      if (!serverId) {
        return
      }

      const reorderedWorkspaceKeys = reorderedWorkspaces.map((workspace) => workspace.workspaceKey)
      const currentWorkspaceOrder = getWorkspaceOrder(serverId, projectKey)
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentWorkspaceOrder,
          reorderedVisibleKeys: reorderedWorkspaceKeys,
        })
      ) {
        return
      }

      setWorkspaceOrder(
        serverId,
        projectKey,
        mergeWithRemainder({
          currentOrder: currentWorkspaceOrder,
          reorderedVisibleKeys: reorderedWorkspaceKeys,
        })
      )
    },
    [getWorkspaceOrder, serverId, setWorkspaceOrder]
  )

  const renderProject = useCallback(
    ({ item, drag, isActive, dragHandleProps }: DraggableRenderItemInfo<SidebarProjectEntry>) => {
      return (
        <ProjectBlock
          project={item}
          collapsed={collapsedProjectKeys.has(item.projectKey)}
          displayName={item.projectName}
          iconDataUri={projectIconByProjectKey.get(item.projectKey) ?? null}
          serverId={serverId}
          activeWorkspaceSelection={activeWorkspaceSelection}
          showShortcutBadges={showShortcutBadges}
          shortcutIndexByWorkspaceKey={shortcutModel.shortcutIndexByWorkspaceKey}
          parentGestureRef={parentGestureRef}
          onToggleCollapsed={() => toggleProjectCollapsed(item.projectKey)}
          onWorkspacePress={onWorkspacePress}
          onWorkspaceReorder={handleWorkspaceReorder}
          drag={drag}
          isDragging={isActive}
          dragHandleProps={dragHandleProps}
          useNestable={isNative}
        />
      )
    },
    [
      activeWorkspaceSelection,
      collapsedProjectKeys,
      handleWorkspaceReorder,
      onWorkspacePress,
      parentGestureRef,
      projectIconByProjectKey,
      serverId,
      shortcutModel.shortcutIndexByWorkspaceKey,
      showShortcutBadges,
      toggleProjectCollapsed,
      isNative,
    ]
  )

  const content = (
    <>
      {projects.length === 0 ? (
        <Text style={styles.emptyText}>No projects yet</Text>
      ) : (
        <DraggableList
          testID="sidebar-project-list"
          data={projects}
          keyExtractor={(project) => project.projectKey}
          renderItem={renderProject}
          onDragEnd={handleProjectDragEnd}
          scrollEnabled={false}
          useDragHandle
          nestable={isNative}
          simultaneousGestureRef={parentGestureRef}
          containerStyle={styles.projectListContainer}
        />
      )}
      {listFooterComponent}
    </>
  )

  return (
    <View style={styles.container}>
      {isNative ? (
        <NestableScrollContainer
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() =>
            console.log('[sidebar-dnd-debug] outer scroll begin')
          }
          testID="sidebar-project-workspace-list-scroll"
        >
          {content}
        </NestableScrollContainer>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() =>
            console.log('[sidebar-dnd-debug] outer scroll begin')
          }
          testID="sidebar-project-workspace-list-scroll"
        >
          {content}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  projectListContainer: {
    width: '100%',
  },
  projectBlock: {
    marginBottom: theme.spacing[1],
  },
  workspaceListContainer: {
    marginLeft: 0,
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    textAlign: 'center',
    marginTop: theme.spacing[8],
    marginHorizontal: theme.spacing[2],
  },
  projectRow: {
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[1],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  projectRowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  projectRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  projectRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  projectRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  projectIcon: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    borderRadius: theme.borderRadius.sm,
  },
  projectIconFallback: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectIconFallbackText: {
    color: theme.colors.foregroundMuted,
    fontSize: 9,
  },
  projectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    flex: 1,
    minWidth: 0,
  },
  workspaceRow: {
    minHeight: 36,
    marginBottom: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  workspaceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  workspaceRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  workspaceRowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  workspaceRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  workspaceRowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceRowContainer: {
    position: 'relative',
  },
  workspaceStatusDot: {
    width: 16,
    height: 16,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceStatusDotFill: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
  },
  workspaceArchivingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: `${theme.colors.surface0}cc`,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing[2],
    zIndex: 1,
  },
  workspaceArchivingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  workspaceBranchText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    opacity: 0.76,
    flex: 1,
    minWidth: 0,
  },
  workspaceCreatedAtText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flexShrink: 0,
  },
  shortcutBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBadgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    lineHeight: 14,
  },
}))
