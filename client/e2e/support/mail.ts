import type { APIRequestContext } from '@playwright/test';

/**
 * The mail the server sent, read back from Mailpit, the inbox the dev stack
 * and CI both run (docker-compose.yml, ci.yml): its HTTP API beside the
 * SMTP port the server sends to.
 */
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

export interface ReceivedMail {
  subject: string;
  text: string;
  html: string;
}

interface Summary {
  ID: string;
  Subject: string;
  Created: string;
}

/**
 * The newest email to an address, waited for: mail lands a moment after
 * the request that sends it, so this asks again for a few seconds before
 * giving up. Searched by recipient, and every test that follows an email
 * sends to an address of its own, so tests running side by side never read
 * each other's mail. `since` skips what came before an action, such as the
 * first email when a test waits for the one Resend sends.
 */
export async function latestEmailTo(
  address: string,
  {
    subject,
    since,
    timeoutMs = 10_000,
  }: { subject?: RegExp; since?: Date; timeoutMs?: number } = {},
): Promise<ReceivedMail> {
  const deadline = Date.now() + timeoutMs;
  const query = encodeURIComponent(`to:"${address}"`);

  for (;;) {
    const listed = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${query}&limit=20`,
    );
    if (listed.ok) {
      const { messages } = (await listed.json()) as { messages: Summary[] };
      const found = messages.find(
        (message) =>
          (!subject || subject.test(message.Subject)) &&
          (!since || new Date(message.Created) >= since),
      );
      if (found) {
        const message = await fetch(
          `${MAILPIT_URL}/api/v1/message/${found.ID}`,
        );
        const body = (await message.json()) as {
          Subject: string;
          Text: string;
          HTML: string;
        };
        return { subject: body.Subject, text: body.Text, html: body.HTML };
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`No email to ${address} within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** The token in a link an email carries to a page of the app. */
export function tokenIn(mail: ReceivedMail, path: string): string {
  const token = new RegExp(`${path}\\?token=([\\w-]+)`).exec(mail.text)?.[1];
  if (!token) throw new Error(`No ${path} link in "${mail.subject}"`);
  return token;
}

/**
 * Verifies an account's address through the link its registration email
 * carried, as the person would. Inviting needs it (ADR-077).
 */
export async function verifyEmail(
  api: APIRequestContext,
  address: string,
): Promise<void> {
  const mail = await latestEmailTo(address, {
    subject: /confirm your email/i,
  });
  const response = await api.post('/v1/auth/verify-email', {
    data: { token: tokenIn(mail, '/verify-email') },
  });
  if (!response.ok()) {
    throw new Error(`Verification failed: ${await response.text()}`);
  }
}
