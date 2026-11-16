import { Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { OFFER_BACK } from '../lib/offer-back';
import { Reference } from './reference';

/**
 * A lot's code, a link to its trace wherever it appears (ADR-093; the
 * design language's Rows: a code with a page of its own is a link). Kept
 * whole as a Reference, so it never breaks at its hyphen; the trace
 * offers Back to where the link was (#341).
 */
export function LotLink({ id, code }: { id: string; code: string }) {
  return (
    <Link component={RouterLink} to={`/lots/${id}`} state={OFFER_BACK}>
      <Reference>{code}</Reference>
    </Link>
  );
}
