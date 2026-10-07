import path from 'node:path';
import { test, expect } from '@playwright/test';
import { appendEvent } from '../../lib/events.mjs';
import { FIXTURE_NOW } from '../fixtures/projects/fixture-clock.mjs';
import { startOffice, type Office } from './helpers';

let office: Office;

test.beforeEach(async () => {
  office = await startOffice('busy');
});

test.afterEach(async () => {
  await office.close();
});

const details = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Details' });
const office$ = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Office' });

test('renders one room per agent with the project on the roof', async ({ page }) => {
  await page.goto(office.url);
  await expect(page.getByText('CookNeighbour team', { exact: true })).toBeVisible();
  await expect(office$(page).getByRole('button')).toHaveCount(6);
});

test('room label uses the plain state wording', async ({ page }) => {
  await page.goto(office.url);
  await expect(page.getByRole('button', { name: /Reviewer: Stuck/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Backend: Working, T-004' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tester: On a break, nothing assigned' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Jimmy: Waiting for approval, 1 decision waiting/ })).toBeVisible();
});

test('approver gets the top-right room with one sheet per pending approval', async ({ page }) => {
  await page.goto(office.url);
  const rooms = office$(page).getByRole('button');
  const jimmy = page.getByRole('button', { name: /^Jimmy:/ });
  const jimmyBox = (await jimmy.boundingBox())!;
  for (const room of await rooms.all()) {
    const box = (await room.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(jimmyBox.y - 1);
    expect(box.x).toBeLessThanOrEqual(jimmyBox.x + 1);
  }
  await expect(jimmy.getByTestId('tray-sheet')).toHaveCount(1);
});

test('hovering a room shows a preview card', async ({ page }) => {
  await page.goto(office.url);
  await page.getByRole('button', { name: /^Backend:/ }).hover();
  const card = page.getByRole('tooltip');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Backend');
  await expect(card).toContainText('Working');
  await expect(card).toContainText('T-004');
  await expect(card).toContainText('40%');
});

test('clicking a room pins its clipboard', async ({ page }) => {
  await page.goto(office.url);
  await expect(details(page)).not.toContainText('Write the free-trial tests');
  await page.getByRole('button', { name: /^Backend:/ }).click();
  await expect(details(page)).toContainText('Backend');
  await expect(details(page)).toContainText('Database, APIs and business rules');
  await expect(details(page)).toContainText('Write the free-trial tests');
  await expect(details(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  await expect(details(page)).toContainText('Updated 2 min ago');
  await expect(page.getByRole('button', { name: /^Backend:/ })).toHaveAttribute('aria-pressed', 'true');
});

test('clipboard shows the reason when an agent is stuck', async ({ page }) => {
  await page.goto(office.url);
  await page.getByRole('button', { name: /^Reviewer:/ }).click();
  await expect(details(page)).toContainText('Why it is stuck');
  await expect(details(page)).toContainText('Checks failing');
  await expect(details(page).getByRole('listitem').first()).toContainText('Stuck: Checks failing');
});

test('keyboard: Tab to a room and press Enter pins it', async ({ page }) => {
  await page.goto(office.url);
  await expect(page.getByRole('button', { name: /^Planner:/ })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Planner:/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(details(page)).toContainText('Draft the next Work Order');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Backend:/ })).toBeFocused();
  await page.keyboard.press(' ');
  await expect(details(page)).toContainText('Write the free-trial tests');
});

test('updates within one poll after a new event is appended', async ({ page }) => {
  await page.goto(office.url);
  await expect(page.getByRole('button', { name: /^Tester: On a break/ })).toBeVisible();
  appendEvent(path.join(office.projectDir, '.team', 'events.jsonl'), {
    source: 'cli', type: 'status', agent: 'tester', status: 'working', task: 'T-011', progress: 5,
    nextStep: 'Test the pricing rules', time: new Date(Date.parse(FIXTURE_NOW) + 1000).toISOString(),
  });
  await expect(page.getByRole('button', { name: 'Tester: Working, T-011' })).toBeVisible({ timeout: 4000 });
});

test('stale agent shows last update warning', async ({ page }) => {
  await page.goto(office.url);
  await page.getByRole('button', { name: /^Frontend:/ }).click();
  await expect(details(page)).toContainText('Last update 10 min ago');
  await page.getByRole('button', { name: /^Backend:/ }).click();
  await expect(details(page)).not.toContainText('Last update');
});

// Refreshes the pull request screenshot: UPDATE_SCREENSHOT=1 npx playwright test -g "screenshot"
test('screenshot of the busy office', async ({ page }) => {
  test.skip(!process.env.UPDATE_SCREENSHOT, 'set UPDATE_SCREENSHOT=1 to refresh docs/screenshots/office-busy.png');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(office.url);
  await page.getByRole('button', { name: /^Backend:/ }).click();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join('docs', 'screenshots', 'office-busy.png'), fullPage: true });
});
