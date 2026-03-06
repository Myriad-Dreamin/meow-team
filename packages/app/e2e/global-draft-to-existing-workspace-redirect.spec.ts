import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { ensureHostSelected, gotoHome, setWorkingDirectory } from './helpers/app'
import { createTempGitRepo } from './helpers/workspace'
import { getWorkspaceTabTestIds } from './helpers/workspace-tabs'

function parseWorkspaceContextFromUrl(rawUrl: string): { workspaceToken: string | null; agentId: string | null } {
  const url = new URL(rawUrl)
  const pathMatch = url.pathname.match(/\/workspace\/([^/?#]+)(?:\/agent\/([^/?#]+))?/) ?? null
  const workspaceToken = pathMatch?.[1] ?? null
  let agentId = pathMatch?.[2] ?? null

  if (!agentId) {
    const open = url.searchParams.get('open')
    const openMatch = open?.match(/^agent:(.+)$/) ?? null
    if (openMatch?.[1]) {
      agentId = openMatch[1]
    }
  }

  return { workspaceToken, agentId }
}

function getOpenAgentIdFromUrl(rawUrl: string): string | null {
  const url = new URL(rawUrl)
  const open = url.searchParams.get('open')
  const openMatch = open?.match(/^agent:(.+)$/) ?? null
  return openMatch?.[1] ?? null
}

async function preferSlowerThinkingOption(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined)
  const thinkingTrigger = page.getByTestId('agent-thinking-selector').first()
  if (!(await thinkingTrigger.isVisible().catch(() => false))) {
    return
  }
  await thinkingTrigger.click({ force: true })
  const menu = page.getByTestId('agent-thinking-menu').first()
  if (!(await menu.isVisible().catch(() => false))) {
    return
  }

  const preferred = ['high', 'max', 'deep', 'long', 'medium']
  for (const label of preferred) {
    const option = menu.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first()
    if (await option.isVisible().catch(() => false)) {
      await option.click({ force: true })
      await expect(menu).not.toBeVisible({ timeout: 5_000 })
      return
    }
  }

  const options = menu.getByRole('button')
  const count = await options.count()
  if (count > 0) {
    await options.last().click({ force: true })
  }
  await expect(menu).not.toBeVisible({ timeout: 5_000 })
}

async function isAnyStopVisible(page: Page): Promise<boolean> {
  const candidates = page.getByRole('button', { name: /stop|cancel/i })
  const count = await candidates.count()
  for (let index = 0; index < count; index += 1) {
    if (await candidates.nth(index).isVisible().catch(() => false)) {
      return true
    }
  }
  return false
}

async function isRunningControlVisible(page: Page): Promise<boolean> {
  if (await isAnyStopVisible(page)) {
    return true
  }
  const interruptSendButton = page.getByRole('button', { name: /interrupt agent|send and interrupt/i })
  const count = await interruptSendButton.count()
  for (let index = 0; index < count; index += 1) {
    if (await interruptSendButton.nth(index).isVisible().catch(() => false)) {
      return true
    }
  }
  return false
}

async function hasVisibleText(page: Page, matcher: RegExp | string): Promise<boolean> {
  const locator = page.getByText(matcher).first()
  const matches = page.getByText(matcher)
  const count = await matches.count()
  for (let index = 0; index < count; index += 1) {
    if (await matches.nth(index).isVisible().catch(() => false)) {
      return true
    }
  }
  return await locator.isVisible().catch(() => false)
}

test('global draft create in existing workspace redirects to that workspace with created agent tab and settles to idle', async ({
  page,
}) => {
  test.setTimeout(360_000)
  const serverId = process.env.E2E_SERVER_ID
  if (!serverId) {
    throw new Error('E2E_SERVER_ID is not set.')
  }

  const repo = await createTempGitRepo('paseo-e2e-global-existing-workspace-')
  const id = `${Date.now()}`
  const seedPrompt = `hello seed-${id}. please reply exactly: ACK_SEED_${id}`
  const secondPrompt = `hello second-${id}. please reply exactly: ACK_SECOND_${id}`
  const lifecyclePrompt = `hello lifecycle-${id}. wait 8 seconds, then reply exactly: ACK_LIFECYCLE_${id}`
  const seedToken = `ACK_SEED_${id}`
  const secondToken = `ACK_SECOND_${id}`
  expect(seedPrompt).not.toBe(secondPrompt)
  expect(seedToken).not.toBe(secondToken)

  try {
    await gotoHome(page)
    await ensureHostSelected(page)
    await page.goto(`/h/${serverId}/new-agent`)
    await expect(page.locator('[data-testid="working-directory-select"]:visible').first()).toBeVisible({
      timeout: 30_000,
    })

    // 1) Seed workspace with an existing agent.
    await setWorkingDirectory(page, repo.path)
    const seedComposer = page.getByRole('textbox', { name: 'Message agent...' }).first()
    await seedComposer.fill(seedPrompt)
    await seedComposer.press('Enter')

    await expect(page.getByText(seedPrompt, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page).toHaveURL(/\/workspace\//, { timeout: 60_000 })
    const seededContext = parseWorkspaceContextFromUrl(page.url())
    if (!seededContext.workspaceToken || !seededContext.agentId) {
      throw new Error(`Expected seeded workspace token and agent id in URL, got: ${page.url()}`)
    }
    const seededAgentId = seededContext.agentId
    expect(getOpenAgentIdFromUrl(page.url())).toBe(seededAgentId)
    await expect(page.getByText(new RegExp(seedToken)).first()).toBeVisible({ timeout: 180_000 })

    // 2) Use global New Agent entry and 3) select same workspace.
    await page.getByText('New agent', { exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`/h/${serverId}/new-agent`), { timeout: 30_000 })
    await expect(page.locator('[data-testid="working-directory-select"]:visible').first()).toBeVisible({
      timeout: 30_000,
    })

    await setWorkingDirectory(page, repo.path)
    await preferSlowerThinkingOption(page)
    await page.keyboard.press('Escape').catch(() => undefined)

    // 4) Create second agent from global draft.
    const composer = page.getByRole('textbox', { name: 'Message agent...' }).first()
    await composer.fill(secondPrompt)
    await composer.press('Enter')
    await page.waitForTimeout(500)
    if (page.url().includes('/new-agent')) {
      const sendButton = page.getByRole('button', { name: /send message/i }).first()
      await expect(sendButton).toBeVisible({ timeout: 10_000 })
      await expect(sendButton).toBeEnabled({ timeout: 10_000 })
      await sendButton.click({ force: true })
    }

    // 5) Assert redirect workspace context + created agent tab is active/open.
    await expect(page).toHaveURL(/\/workspace\//, { timeout: 60_000 })
    const createdContext = parseWorkspaceContextFromUrl(page.url())
    expect(createdContext.workspaceToken).toBe(seededContext.workspaceToken)
    if (!createdContext.agentId) {
      throw new Error(`Expected created agent id in URL, got: ${page.url()}`)
    }
    const createdAgentId = createdContext.agentId
    expect(createdAgentId).toBeTruthy()
    expect(createdAgentId).not.toBe(seededAgentId)
    expect(getOpenAgentIdFromUrl(page.url())).toBe(createdAgentId)
    expect(getOpenAgentIdFromUrl(page.url())).not.toBe(seededAgentId)

    const createdTabTestId = `workspace-tab-agent_${createdAgentId}`
    await expect
      .poll(async () => {
        const finalTabIds = await getWorkspaceTabTestIds(page)
        return finalTabIds.includes(createdTabTestId)
      })
      .toBe(true)
    expect(getOpenAgentIdFromUrl(page.url())).toBe(createdAgentId)

    // 6) Response assertions are scoped to created-agent active context.
    await expect
      .poll(async () => hasVisibleText(page, new RegExp(secondToken)), { timeout: 240_000 })
      .toBe(true)
    await expect(page.getByText(seedToken, { exact: true }).first()).not.toBeVisible({ timeout: 30_000 })

    // 7) Lifecycle assertions on created agent only: running first, then idle.
    const lifecycleComposer = page.getByRole('textbox', { name: 'Message agent...' }).first()
    await lifecycleComposer.fill(lifecyclePrompt)
    await lifecycleComposer.press('Enter')
    await expect
      .poll(async () => hasVisibleText(page, lifecyclePrompt), { timeout: 30_000 })
      .toBe(true)

    let sawRunning = false
    for (let attempt = 0; attempt < 1200; attempt += 1) {
      if (await isRunningControlVisible(page)) {
        sawRunning = true
        break
      }
      await page.waitForTimeout(50)
    }
    expect(sawRunning).toBe(true)

    await expect
      .poll(async () => (await isRunningControlVisible(page)) === false, { timeout: 240_000 })
      .toBe(true)
    const idleComposer = page.getByRole('textbox', { name: 'Message agent...' }).first()
    await expect(idleComposer).toBeVisible({ timeout: 30_000 })
    await expect(idleComposer).toBeEditable({ timeout: 30_000 })
  } finally {
    await repo.cleanup()
  }
})
