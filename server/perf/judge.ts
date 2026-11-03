import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { judgementMarkdown, judgeRounds, type PlansReport } from './median';
import { PLANS_SUFFIX, type Report } from './report';

/**
 * A timed run's rounds judged by their median (ADR-051, amended November
 * 2026): the Performance workflow's last job.
 *
 * Usage, from `server/`, with each round's reports anywhere under one
 * folder, as the workflow's download or `gh run download <id> --dir
 * <folder>` leaves them:
 *
 *     npm run perf:judge -- <folder>
 *
 * Fails when a median misses where budgets are enforced, and refuses rounds
 * it cannot judge, a missing one first. Writes its summary to the CI step
 * summary when there is one.
 */
function main(): number {
  const folder = process.argv[2];

  if (!folder || !existsSync(folder)) {
    console.error(
      "Name the folder holding the rounds' reports: npm run perf:judge -- <folder>",
    );
    return 1;
  }

  const files = readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.json'))
    .sort();
  const read = (name: string): unknown =>
    JSON.parse(readFileSync(join(folder, name), 'utf8'));

  const reports = files
    .filter((name) => !name.endsWith(PLANS_SUFFIX))
    .map((name) => read(name) as Report);
  // The plan check runs in the first round only.
  const plans =
    files
      .filter((name) => name.endsWith(PLANS_SUFFIX))
      .map((name) => read(name) as PlansReport)
      .at(-1) ?? null;

  const judgement = judgeRounds(reports);
  const markdown =
    typeof judgement === 'string'
      ? `## Perf: the median of the rounds\n\n**Refused:** ${judgement}`
      : judgementMarkdown(judgement, plans);

  console.log(markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }

  return typeof judgement === 'string' || judgement.failed ? 1 : 0;
}

process.exitCode = main();
