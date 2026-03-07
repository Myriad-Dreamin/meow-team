import type { ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { Bot, Check, FileText, Pencil, Terminal } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { CodexIcon } from "@/components/icons/codex-icon";
import { SyncedLoader } from "@/components/synced-loader";
import type { Agent } from "@/stores/session-store";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  deriveSidebarStateBucket,
  type SidebarStateBucket,
} from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";
import { shouldRenderSyncedStatusLoader } from "@/utils/status-loader";

export type WorkspaceTabPresentation = {
  key: string;
  kind: WorkspaceTabDescriptor["kind"];
  label: string;
  subtitle: string;
  titleState: "ready" | "loading";
  provider: Agent["provider"] | null;
  statusBucket: SidebarStateBucket | null;
};

export function deriveWorkspaceTabPresentation(input: {
  tab: WorkspaceTabDescriptor;
  agent?: Agent | null;
}): WorkspaceTabPresentation {
  const { tab, agent = null } = input;
  return {
    key: tab.key,
    kind: tab.kind,
    label: tab.label,
    subtitle: tab.subtitle,
    titleState: tab.kind === "agent" ? tab.titleState : "ready",
    provider: tab.kind === "agent" ? tab.provider : null,
    statusBucket:
      tab.kind === "agent" && agent
        ? deriveSidebarStateBucket({
            status: agent.status,
            pendingPermissionCount: agent.pendingPermissions.length,
            requiresAttention: agent.requiresAttention,
            attentionReason: agent.attentionReason,
          })
        : null,
  };
}

type WorkspaceTabIconProps = {
  presentation: WorkspaceTabPresentation;
  active?: boolean;
  size?: number;
  statusDotBorderColor?: string;
};

export function WorkspaceTabIcon({
  presentation,
  active = false,
  size = 14,
  statusDotBorderColor,
}: WorkspaceTabIconProps): ReactElement {
  const { theme } = useUnistyles();
  const iconColor = active ? theme.colors.foreground : theme.colors.foregroundMuted;
  const statusDotColor =
    presentation.statusBucket === null
      ? null
      : getStatusDotColor({
          theme,
          bucket: presentation.statusBucket,
          showDoneAsInactive: false,
        });
  const shouldShowLoader = shouldRenderSyncedStatusLoader({
    bucket: presentation.statusBucket,
  });

  if (presentation.kind === "agent") {
    if (shouldShowLoader) {
      return (
        <View style={[styles.agentIconWrapper, { width: size, height: size }]}>
          <SyncedLoader size={size - 1} color={theme.colors.palette.amber[500]} />
        </View>
      );
    }

    return (
      <View style={[styles.agentIconWrapper, { width: size, height: size }]}>
        {presentation.provider === "claude" ? (
          <ClaudeIcon size={size} color={iconColor} />
        ) : presentation.provider === "codex" ? (
          <CodexIcon size={size} color={iconColor} />
        ) : (
          <Bot size={size} color={iconColor} />
        )}
        {statusDotColor ? (
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: statusDotColor,
                borderColor: statusDotBorderColor ?? theme.colors.surface0,
              },
            ]}
          />
        ) : null}
      </View>
    );
  }

  if (presentation.kind === "draft") {
    return <Pencil size={size} color={iconColor} />;
  }

  if (presentation.kind === "file") {
    return <FileText size={size} color={iconColor} />;
  }

  return <Terminal size={size} color={iconColor} />;
}

type WorkspaceTabOptionRowProps = {
  presentation: WorkspaceTabPresentation;
  selected: boolean;
  active: boolean;
  onPress: () => void;
};

export function WorkspaceTabOptionRow({
  presentation,
  selected,
  active,
  onPress,
}: WorkspaceTabOptionRowProps): ReactElement {
  const { theme } = useUnistyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered = false, pressed }) => [
        styles.optionRow,
        (hovered || pressed || active) && styles.optionRowActive,
      ]}
    >
      <View style={styles.optionLeadingSlot}>
        <WorkspaceTabIcon presentation={presentation} active={selected || active} />
      </View>
      <View style={styles.optionContent}>
        <Text numberOfLines={1} style={styles.optionLabel}>
          {presentation.titleState === "loading" ? "Loading..." : presentation.label}
        </Text>
      </View>
      {selected ? (
        <View style={styles.optionTrailingSlot}>
          <Check size={16} color={theme.colors.foregroundMuted} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  agentIconWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: 0,
    marginHorizontal: theme.spacing[1],
    marginBottom: theme.spacing[1],
  },
  optionRowActive: {
    backgroundColor: theme.colors.surface1,
  },
  optionLeadingSlot: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: {
    flex: 1,
    flexShrink: 1,
  },
  optionLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  optionTrailingSlot: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
}));
