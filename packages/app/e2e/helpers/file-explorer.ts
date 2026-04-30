import { expect, type Page } from "@playwright/test";
import { buildDeterministicWorkspaceTabId } from "../../src/utils/workspace-tab-identity";

function fileExplorerTree(page: Page) {
  return page.getByTestId("file-explorer-tree-scroll");
}

function fileExplorerEntry(page: Page, name: string) {
  return fileExplorerTree(page).getByText(name, { exact: true }).first();
}

export async function openFileExplorer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open explorer" }).first().click();
  await page.getByTestId("explorer-tab-files").click();
  await expect(fileExplorerTree(page)).toBeVisible({ timeout: 30_000 });
}

export async function expandFolder(page: Page, folderName: string): Promise<void> {
  await fileExplorerEntry(page, folderName).click();
}

export async function collapseFolder(page: Page, folderName: string): Promise<void> {
  await fileExplorerEntry(page, folderName).click();
}

export async function openFileFromExplorer(page: Page, fileName: string): Promise<void> {
  await fileExplorerEntry(page, fileName).click();
}

export async function expectExplorerEntryVisible(page: Page, name: string): Promise<void> {
  await expect(fileExplorerEntry(page, name)).toBeVisible({ timeout: 30_000 });
}

export async function expectExplorerEntryHidden(page: Page, name: string): Promise<void> {
  await expect(fileExplorerEntry(page, name)).toBeHidden({ timeout: 30_000 });
}

export async function expectFileTabOpen(
  page: Page,
  input: { filePath: string; directory?: string },
): Promise<void> {
  const tabId = buildDeterministicWorkspaceTabId({
    kind: "file",
    directory: input.directory,
    path: input.filePath,
  });
  await expect(page.getByTestId(`workspace-tab-${tabId}`).first()).toBeVisible({
    timeout: 30_000,
  });
}
