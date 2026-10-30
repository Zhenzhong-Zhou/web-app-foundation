import { HELP, reportAddress, testReport } from './error-tracker-report';
import { UsageError } from './org-invite-options';

/**
 * `npm run error-tracker:test -- <site>` (ADR-084): one test report, posted
 * through the site's /api/errors as the browser posts one, so the whole
 * path is tried: the site's rewrite, the route, the relay and the project.
 * The envelope names a stand-in project and the server puts its own on, so
 * the command needs no secret, and reads no .env. It prints the answer's
 * status and the report's id; 204 says the site took it, not that the
 * tracker did, which the route never tells.
 */

/** Long enough for a free web service to wake (render.md). */
const WAIT_MS = 90_000;

const out = (text: string): void => {
  process.stdout.write(`${text}\n`);
};
const fail = (text: string): void => {
  process.stderr.write(`${text}\n`);
};

async function main(): Promise<number> {
  let address: URL;
  try {
    address = reportAddress(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    fail(`${error.message}\n\n${HELP}`);
    return 2;
  }

  const report = testReport();
  out(`Sending report ${report.id} to ${address.href}`);
  let response: Response;
  try {
    response = await fetch(address, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: report.body,
      signal: AbortSignal.timeout(WAIT_MS),
    });
  } catch (error) {
    fail(`No answer from ${address.host}: ${(error as Error).message}`);
    return 1;
  }

  out(`${response.status} ${response.statusText}`);
  if (response.status !== 204) {
    fail(await response.text());
    return 1;
  }
  out(
    `Find report ${report.id} in the tracker. Not there within a minute: the API's ERROR_TRACKER_DSN is unset or wrong, or its log says why the relay failed.`,
  );
  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});
