import { test, expect, type Page } from "./fixtures";
import { createAgentInRepo } from "./helpers/app";
import { createTempGitRepo } from "./helpers/workspace";
import { switchWorkspaceViaSidebar } from "./helpers/workspace-ui";

async function openWorkspaceWithAgent(page: Page, workspacePath: string): Promise<void> {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set.");
  }

  await createAgentInRepo(page, {
    directory: workspacePath,
    prompt: `workspace header restore ${Date.now()}`,
  });
  await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: workspacePath });
  await expect(page.getByTestId("workspace-new-agent-tab").first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByTestId("workspace-new-terminal-tab").first()).toBeVisible({
    timeout: 30000,
  });
}

test("workspace new-tab buttons stay on-screen during horizontal scroll", async ({ page }) => {
  const repo = await createTempGitRepo("paseo-e2e-workspace-new-tab-");

  try {
    await openWorkspaceWithAgent(page, repo.path);

    const agentButton = page.getByTestId("workspace-new-agent-tab").first();
    const terminalButton = page.getByTestId("workspace-new-terminal-tab").first();
    const tabsScroll = page.getByTestId("workspace-tabs-scroll").first();
    await expect(agentButton).toBeVisible({ timeout: 30000 });
    await expect(terminalButton).toBeVisible({ timeout: 30000 });
    await expect(tabsScroll).toBeVisible({ timeout: 30000 });

    // Create enough terminal tabs to ensure the tabs row has overflow to scroll.
    const workspaceTabs = page.locator(
      '[data-testid^="workspace-tab-"]:not([data-testid^="workspace-tab-context-"])'
    );
    const initialTabCount = await workspaceTabs.count();
    const targetTabCount = initialTabCount + 8;

    for (let attempt = initialTabCount; attempt < targetTabCount; attempt += 1) {
      await expect(terminalButton).toBeEnabled({ timeout: 30000 });
      await terminalButton.click();
      await expect
        .poll(async () => await workspaceTabs.count(), { timeout: 30000 })
        .toBeGreaterThanOrEqual(attempt + 1);
    }

    const agentBoundsBefore = await agentButton.boundingBox();
    const terminalBoundsBefore = await terminalButton.boundingBox();
    const viewport = page.viewportSize();

    expect(agentBoundsBefore).not.toBeNull();
    expect(terminalBoundsBefore).not.toBeNull();
    expect(viewport).not.toBeNull();

    if (!agentBoundsBefore || !terminalBoundsBefore || !viewport) {
      return;
    }

    expect(agentBoundsBefore.x).toBeGreaterThanOrEqual(0);
    expect(agentBoundsBefore.y).toBeGreaterThanOrEqual(0);
    expect(agentBoundsBefore.x + agentBoundsBefore.width).toBeLessThanOrEqual(viewport.width);
    expect(agentBoundsBefore.y + agentBoundsBefore.height).toBeLessThanOrEqual(viewport.height);

    expect(terminalBoundsBefore.x).toBeGreaterThanOrEqual(0);
    expect(terminalBoundsBefore.y).toBeGreaterThanOrEqual(0);
    expect(terminalBoundsBefore.x + terminalBoundsBefore.width).toBeLessThanOrEqual(viewport.width);
    expect(terminalBoundsBefore.y + terminalBoundsBefore.height).toBeLessThanOrEqual(viewport.height);

    // Scroll tabs horizontally; the new-tab buttons should remain fixed on the right edge.
    await tabsScroll.evaluate((el) => {
      (el as HTMLElement).scrollLeft = (el as HTMLElement).scrollWidth;
    });
    await page.waitForTimeout(200);

    const agentBoundsAfter = await agentButton.boundingBox();
    const terminalBoundsAfter = await terminalButton.boundingBox();

    expect(agentBoundsAfter).not.toBeNull();
    expect(terminalBoundsAfter).not.toBeNull();

    if (!agentBoundsAfter || !terminalBoundsAfter) {
      return;
    }

    expect(agentBoundsAfter.x).toBeGreaterThanOrEqual(0);
    expect(agentBoundsAfter.y).toBeGreaterThanOrEqual(0);
    expect(agentBoundsAfter.x + agentBoundsAfter.width).toBeLessThanOrEqual(viewport.width);
    expect(agentBoundsAfter.y + agentBoundsAfter.height).toBeLessThanOrEqual(viewport.height);

    expect(terminalBoundsAfter.x).toBeGreaterThanOrEqual(0);
    expect(terminalBoundsAfter.y).toBeGreaterThanOrEqual(0);
    expect(terminalBoundsAfter.x + terminalBoundsAfter.width).toBeLessThanOrEqual(viewport.width);
    expect(terminalBoundsAfter.y + terminalBoundsAfter.height).toBeLessThanOrEqual(viewport.height);
  } finally {
    await repo.cleanup();
  }
});

test("workspace new-tab buttons sit immediately after tabs before overflow", async ({ page }) => {
  const repo = await createTempGitRepo("paseo-e2e-workspace-new-tab-adjacent-");

  try {
    await openWorkspaceWithAgent(page, repo.path);

    const agentButton = page.getByTestId("workspace-new-agent-tab").first();
    const workspaceTabs = page.locator(
      '[data-testid^="workspace-tab-"]:not([data-testid^="workspace-tab-context-"])'
    );

    await expect(agentButton).toBeVisible({ timeout: 30000 });
    await expect(workspaceTabs).toHaveCount(1, { timeout: 30000 });

    const lastTabBounds = await workspaceTabs.last().boundingBox();
    const agentBounds = await agentButton.boundingBox();

    expect(lastTabBounds).not.toBeNull();
    expect(agentBounds).not.toBeNull();

    if (!lastTabBounds || !agentBounds) {
      return;
    }

    const horizontalGap = agentBounds.x - (lastTabBounds.x + lastTabBounds.width);

    expect(horizontalGap).toBeGreaterThanOrEqual(0);
    expect(horizontalGap).toBeLessThanOrEqual(24);
  } finally {
    await repo.cleanup();
  }
});

test("workspace explorer toggle opens and closes explorer", async ({ page }) => {
  const repo = await createTempGitRepo("paseo-e2e-workspace-explorer-toggle-");

  try {
    await openWorkspaceWithAgent(page, repo.path);

    const toggle = page.getByTestId("workspace-explorer-toggle").first();
    const explorerHeader = page.locator('[data-testid="explorer-header"]:visible').first();
    await expect(toggle).toBeVisible({ timeout: 30000 });

    const initiallyExpanded = (await toggle.getAttribute("aria-expanded")) === "true";
    if (initiallyExpanded) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(explorerHeader).not.toBeVisible({ timeout: 10000 });
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(explorerHeader).toBeVisible({ timeout: 10000 });

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(explorerHeader).not.toBeVisible({ timeout: 10000 });
  } finally {
    await repo.cleanup();
  }
});
