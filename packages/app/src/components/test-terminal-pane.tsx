import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useAppVisible } from "@/hooks/use-app-visible";
import { useKeyboardShiftStyle } from "@/hooks/use-keyboard-shift-style";
import { useHostRuntimeSnapshot, type ActiveConnection } from "@/runtime/host-runtime";
import { buildDaemonWebSocketUrl } from "@/utils/daemon-endpoints";
import { buildTestTerminalWebSocketUrl } from "@/utils/test-terminal-url";
import { toXtermTheme } from "@/utils/to-xterm-theme";
import { useIsCompactFormFactor } from "@/constants/layout";
import TestTerminalEmulator from "@/components/test-terminal-emulator";

interface TestTerminalPaneProps {
  serverId: string;
  testTerminalId: string;
  isWorkspaceFocused: boolean;
  isPaneFocused: boolean;
}

function resolveDirectTestTerminalUrl(input: {
  activeConnection: ActiveConnection | null;
}): string | null {
  const { activeConnection } = input;
  if (activeConnection?.type !== "directTcp") {
    return null;
  }
  return buildTestTerminalWebSocketUrl(buildDaemonWebSocketUrl(activeConnection.endpoint));
}

export function TestTerminalPane({
  serverId,
  testTerminalId,
  isWorkspaceFocused,
  isPaneFocused,
}: TestTerminalPaneProps) {
  const isAppVisible = useAppVisible();
  const { theme } = useUnistyles();
  const xtermTheme = useMemo(() => toXtermTheme(theme.colors.terminal), [theme]);
  const isMobile = useIsCompactFormFactor();
  const { style: keyboardPaddingStyle } = useKeyboardShiftStyle({
    mode: "padding",
    enabled: isMobile,
  });
  const hostSnapshot = useHostRuntimeSnapshot(serverId);
  const webSocketUrl = useMemo(
    () =>
      resolveDirectTestTerminalUrl({
        activeConnection: hostSnapshot?.activeConnection ?? null,
      }),
    [hostSnapshot?.activeConnection],
  );
  const [focusRequestToken, setFocusRequestToken] = useState(0);
  const [resizeRequestToken, setResizeRequestToken] = useState(0);

  useEffect(() => {
    if (!isWorkspaceFocused || !isPaneFocused || !isAppVisible || !webSocketUrl) {
      return;
    }
    setResizeRequestToken((current) => current + 1);
    if (!isMobile) {
      setFocusRequestToken((current) => current + 1);
    }
  }, [isAppVisible, isMobile, isPaneFocused, isWorkspaceFocused, webSocketUrl]);

  return (
    <Animated.View style={[styles.container, keyboardPaddingStyle]}>
      <View style={styles.debugBar}>
        <Text style={styles.debugTitle}>Test terminal</Text>
        <Text style={styles.debugSubtitle}>Direct PTY</Text>
      </View>
      <View style={styles.outputContainer}>
        {webSocketUrl ? (
          <TestTerminalEmulator
            dom={{
              style: { flex: 1 },
              matchContents: false,
              scrollEnabled: true,
              nestedScrollEnabled: true,
              overScrollMode: "never",
              bounces: false,
              automaticallyAdjustContentInsets: false,
              contentInsetAdjustmentBehavior: "never",
            }}
            streamKey={`${serverId}:${testTerminalId}`}
            webSocketUrl={webSocketUrl}
            xtermTheme={xtermTheme}
            focusRequestToken={focusRequestToken}
            resizeRequestToken={resizeRequestToken}
          />
        ) : (
          <View style={styles.centerState}>
            <Text style={styles.stateText}>Direct TCP connection required for Test terminal</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  debugBar: {
    minHeight: 34,
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  debugTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  debugSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  outputContainer: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.background,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
  },
  stateText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
