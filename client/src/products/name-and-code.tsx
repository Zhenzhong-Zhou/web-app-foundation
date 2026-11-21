import { Link, Stack, Typography } from '@mui/material';
import type { ReactNode, Ref } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { CutName } from '../components/cut-name';
import { CUT_NAME } from '../components/name-column';
import { ProductCover } from '../components/product-cover';
import type { ProductType } from '../lib/api-names';
import { TOUCH } from '../theme/media';
import { rem } from '../theme/rem';
import { productTypeIcon, typeAfter } from './product-types';

/**
 * An item's name and code, the one cell every list of items draws them
 * in (ADR-093; the design language's Rows): the cover, or the type's icon
 * where there is none; the name first, in bold; the code under it in
 * grey. Items' rows and cards first; Stock, Where it stands, Reorder and
 * the pickers as each is built.
 *
 * With `to`, the name is the row's one link, which a keyboard reaches,
 * as a row with controls of its own has; without it, the name is text,
 * for a card that is one link whole. Pinned in a list too wide for its
 * box, the link is at most two lines, its whole name in a tooltip
 * (`CutName`, 83a).
 *
 * With `withType`, the type is a word at the end of the grey line, beside
 * its icon: on Items' All, where rows of every type sit together, an icon
 * that tells a kind is never alone (#548; the design language's Rows). On
 * a type's tab every row is that type, so nothing.
 *
 * `under`, a line under the grey one, as Movements' "was VITC-90" under a
 * code changed since the row was recorded (ADR-093, R9).
 */
export function NameAndCode({
  name,
  code,
  type,
  coverFileId,
  to,
  linkRef,
  withType,
  under,
}: {
  name: string;
  /** The grey line under the name: the code, or what the list says there. */
  code: ReactNode;
  type: ProductType;
  coverFileId: string | null;
  to?: string;
  /** The name's link, for a list that moves focus to it. */
  linkRef?: Ref<HTMLAnchorElement>;
  withType?: boolean;
  under?: ReactNode;
}) {
  const intl = useIntl();

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}
    >
      <ProductCover
        fileId={coverFileId}
        name={name}
        icon={productTypeIcon(type)}
      />
      <Stack sx={to ? { minWidth: 0 } : { flex: 1, minWidth: 0 }}>
        {to ? (
          <CutName name={name}>
            <Link
              {...CUT_NAME}
              component={RouterLink}
              to={to}
              ref={linkRef}
              underline="hover"
              color="inherit"
              // The row's one way in, a fingertip tall on a touch screen
              // (Text and targets).
              sx={{
                fontWeight: 600,
                [TOUCH]: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: rem(44),
                },
              }}
            >
              {name}
            </Link>
          </CutName>
        ) : (
          <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {code}
          {withType && typeAfter(type, intl)}
        </Typography>
        {under && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {under}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
