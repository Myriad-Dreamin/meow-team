import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Harness form styling contract", () => {
  it("keeps the structural field wrapper free of broad descendant styling", () => {
    const globalsCss = readFileSync(path.join(rootDirectory, "app", "globals.css"), "utf8");

    expect(globalsCss).not.toMatch(/\.harness-form-field\s+span\b/);
    expect(globalsCss).not.toMatch(/\.harness-form-field\s+input\b/);
    expect(globalsCss).not.toMatch(/\.harness-form-field\s+select\b/);
    expect(globalsCss).not.toMatch(/\.harness-form-field\s+textarea\b/);
    expect(globalsCss).toContain(".harness-form-label");
    expect(globalsCss).toContain("input.harness-native-control");
    expect(globalsCss).toContain("select.harness-native-control");
    expect(globalsCss).toContain("textarea.harness-native-control");
    expect(globalsCss).toContain("textarea.harness-native-control::-webkit-scrollbar");
  });

  it("keeps timeline feedback controls on the explicit native-field path", () => {
    const detailTimelineSource = readFileSync(
      path.join(rootDirectory, "components", "thread-detail-timeline.tsx"),
      "utf8",
    );

    expect(detailTimelineSource).toContain(
      '<span className="harness-form-label">Proposal Feedback</span>',
    );
    expect(detailTimelineSource).toContain(
      '<span className="harness-form-label">Request-Group Feedback</span>',
    );
    expect(detailTimelineSource).toContain('className="harness-native-control"');
  });

  it("keeps CodeMirror editors isolated from harness native-field hooks", () => {
    const requestEditorSource = readFileSync(
      path.join(rootDirectory, "components", "team-request-editor.tsx"),
      "utf8",
    );
    const commandEditorSource = readFileSync(
      path.join(rootDirectory, "components", "thread-command-editor.tsx"),
      "utf8",
    );
    const commandComposerSource = readFileSync(
      path.join(rootDirectory, "components", "thread-command-composer.tsx"),
      "utf8",
    );

    for (const source of [requestEditorSource, commandEditorSource, commandComposerSource]) {
      expect(source).not.toContain("harness-native-control");
      expect(source).not.toContain("harness-form-label");
    }

    expect(requestEditorSource).toContain('editorClassName={styles["team-request-editor"]}');
    expect(requestEditorSource).toContain('shellClassName={styles["team-request-editor-shell"]}');
    expect(commandEditorSource).toContain('editorClassName={styles["thread-command-editor"]}');
    expect(commandEditorSource).toContain('shellClassName={styles["thread-command-editor-shell"]}');
  });
});
