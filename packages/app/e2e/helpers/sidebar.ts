import { expect, type Page } from "@playwright/test";

export function requireServerId(): string {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error("E2E_SERVER_ID is not set (expected from Playwright globalSetup).");
  }
  return serverId;
}

export async function selectWorkspaceInSidebar(page: Page, workspaceId: string): Promise<void> {
  const row = page.getByTestId(`sidebar-workspace-row-${requireServerId()}:${workspaceId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
}

export async function expectWorkspaceListed(page: Page, name: string): Promise<void> {
  await expect(
    page.locator('[data-testid^="sidebar-workspace-row-"]').filter({ hasText: name }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function openMobileAgentSidebar(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open menu" }).click();
}

export async function closeMobileAgentSidebar(page: Page): Promise<void> {
  const sidebar = page.getByTestId("sidebar-sessions");
  const box = await sidebar.boundingBox();
  if (!box) {
    throw new Error("Mobile sidebar is not visible");
  }

  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 8, y, { steps: 10 });
  await page.mouse.up();
}

// The mobile sidebar panel animates via translateX; toBeInViewport reflects the rendered position.
export async function expectMobileAgentSidebarVisible(page: Page): Promise<void> {
  await expect(page.getByTestId("sidebar-sessions")).toBeInViewport({ timeout: 5_000 });
}

export async function expectMobileAgentSidebarHidden(page: Page): Promise<void> {
  await expect(page.getByTestId("sidebar-sessions")).not.toBeInViewport({ timeout: 5_000 });
}
