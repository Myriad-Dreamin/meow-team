import { FlaskConical } from "lucide-react-native";
import invariant from "tiny-invariant";
import { TestTerminalPane } from "@/components/test-terminal-pane";
import { usePaneContext, usePaneFocus } from "@/panels/pane-context";
import type { PanelDescriptor, PanelRegistration } from "@/panels/panel-registry";

function useTestTerminalPanelDescriptor(): PanelDescriptor {
  return {
    label: "Test terminal",
    subtitle: "Direct terminal",
    titleState: "ready",
    icon: FlaskConical,
    statusBucket: null,
  };
}

function TestTerminalPanel() {
  const { serverId, target } = usePaneContext();
  const { isWorkspaceFocused, isPaneFocused } = usePaneFocus();
  invariant(target.kind === "testTerminal", "TestTerminalPanel requires test terminal target");

  if (!isWorkspaceFocused) {
    return null;
  }

  return (
    <TestTerminalPane
      serverId={serverId}
      testTerminalId={target.testTerminalId}
      isWorkspaceFocused={isWorkspaceFocused}
      isPaneFocused={isPaneFocused}
    />
  );
}

export const testTerminalPanelRegistration: PanelRegistration<"testTerminal"> = {
  kind: "testTerminal",
  component: TestTerminalPanel,
  useDescriptor: useTestTerminalPanelDescriptor,
};
