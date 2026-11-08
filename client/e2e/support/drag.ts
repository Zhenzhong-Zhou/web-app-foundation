import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Drags by the keyboard as a person does (ADR-089's amendment): the handle
 * focused, Space, each key in `keys`, then Space to drop it, or Escape to
 * put it back when the last key is Escape. Each key waits until the screen
 * has answered the one before, by the drag library's own signs: after Space,
 * the dragged element marked `data-dnd-dragging` and the library's live
 * region saying something new; after each move, its words changing; after
 * the drop, nothing marked. The library starts a drag a render after Space
 * and ignores an arrow before then, and Linux WebKit, as CI runs it, had
 * the arrow sooner (5631d0d8). So each key must move the item, or the wait
 * for new words fails.
 *
 * Returns what the live region said after the pick-up and after each move,
 * in order: what a screen reader heard.
 */
export async function dragByKeyboard(
  page: Page,
  handle: Locator,
  keys: readonly string[],
): Promise<string[]> {
  const said = page.locator('[id^="dnd-kit-announcement-"]');
  const dragging = page.locator('[data-dnd-dragging]');
  const cancel = keys.at(-1) === 'Escape';
  const moves = cancel ? keys.slice(0, -1) : keys;
  const heard: string[] = [];

  /** A key pressed, then the live region's words changed, kept. */
  const answered = async (key: string) => {
    const before = (await said.textContent()) ?? '';
    await page.keyboard.press(key);
    await expect(said).not.toHaveText(before);
    heard.push((await said.textContent()) ?? '');
  };

  await handle.focus();
  await answered('Space');
  await expect(dragging).toHaveCount(1);
  for (const key of moves) await answered(key);
  await page.keyboard.press(cancel ? 'Escape' : 'Space');
  await expect(dragging).toHaveCount(0);
  return heard;
}
