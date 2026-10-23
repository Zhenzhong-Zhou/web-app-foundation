import { useIntl } from 'react-intl';

import { type ApiError, hasCode } from '../lib/api';
import { useWhileVisible } from '../lib/use-while-visible';
import { reloadPage } from '../version/reload-page';
import { useNewVersion } from '../version/version-check';
import { NewVersionPage } from './new-version-page';
import { StatusPage } from './status-page';

/** How long the page waits before reading again, as the 503's words say. */
const AGAIN_AFTER_MS = 60_000;

/**
 * A page whose read the API refused for this tab's revision (ADR-081),
 * where the page would be, from `isRevisionRefusal`:
 *
 * - outdated, with the new version out: the new version page, with Reload;
 * - outdated while the version file still names this tab's build, since
 *   the API deploys first, or the API itself not yet deployed or rolled
 *   back (`api_updating`): "A new version is being installed", and the page
 *   reads again by itself every minute. The file is read every 30 seconds
 *   meanwhile, so once the new version is out this becomes its page.
 *
 * `onRetry` reads the page again, a load in full where it has no read of
 * its own. At start, before the app has drawn, `standalone`.
 */
export function RevisionRefusalPage({
  failure,
  onRetry = reloadPage,
  standalone,
}: {
  failure: ApiError;
  onRetry?: () => void;
  standalone?: boolean;
}) {
  const { newer } = useNewVersion();
  if (hasCode(failure.code ?? null, 'client_outdated') && newer) {
    return <NewVersionPage standalone={standalone} />;
  }
  return <InstallingPage onRetry={onRetry} standalone={standalone} />;
}

function InstallingPage({
  onRetry,
  standalone,
}: {
  onRetry: () => void;
  standalone?: boolean;
}) {
  const intl = useIntl();
  // Every minute while the tab is in front, and at once when it comes back
  // to the front; a hidden tab asks nothing, which after a rollback could
  // otherwise go on for as long as the tab stays open.
  useWhileVisible(onRetry, AGAIN_AFTER_MS, false);

  return (
    <StatusPage
      kind="installing"
      title={intl.formatMessage({
        id: 'version.installingTitle',
        defaultMessage: 'A new version is being installed',
      })}
      message={intl.formatMessage({
        id: 'version.installingPage',
        defaultMessage: 'This page tries again by itself in a minute.',
      })}
      standalone={standalone}
    />
  );
}
