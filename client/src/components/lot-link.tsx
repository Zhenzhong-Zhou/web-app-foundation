import { Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { OFFER_BACK } from '../lib/offer-back';
import { Reference } from './reference';

/**
 * A lot's code, a link to its trace wherever it appears (ADR-093; the
 * design language's Rows: a code with a page of its own is a link). Kept
 * whole as a Reference, so it never breaks at its hyphen; the trace
 * offers Back to where the link was (#341). Inside a sentence it is
 * underlined always, as a sentence's link is (review 46).
 */
export function LotLink({
  id,
  code,
  underline,
}: {
  id: string;
  code: string;
  underline?: 'always';
}) {
  return (
    <Link
      component={RouterLink}
      to={`/lots/${id}`}
      state={OFFER_BACK}
      underline={underline}
    >
      <Reference>{code}</Reference>
    </Link>
  );
}
