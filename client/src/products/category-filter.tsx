import { Box, MenuItem } from '@mui/material';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import { SelectField } from '../components/select-field';
import { OFFER_BACK } from '../lib/offer-back';
import { rem } from '../theme/rem';
import { type CategoryOption, UNCATEGORISED } from './item-list';

/**
 * Items' category filter (ADR-092): All categories, the tree with each
 * one's count on the open tab, Uncategorised with its own, and Manage
 * categories at its foot, which opens Settings › Categories with Back to
 * Items.
 *
 * The box shows the chosen category's name alone, not its count beside
 * it; each option is named by its path and its count, as CategorySelect's
 * are by their path (WCAG 1.3.1).
 */
export function CategoryFilter({
  options,
  uncategorisedCount,
  value,
  onChange,
  fullWidth,
}: {
  options: CategoryOption[];
  /** The items in no category the open tab shows, once the tree is read. */
  uncategorisedCount?: number;
  value: string;
  onChange: (category: string) => void;
  fullWidth?: boolean;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const uncategorised = intl.formatMessage({
    id: 'products.category.none',
    defaultMessage: 'Uncategorised',
  });

  return (
    <SelectField
      id="items-category"
      size="small"
      label={intl.formatMessage({
        id: 'products.category',
        defaultMessage: 'Category',
      })}
      emptyLabel={intl.formatMessage({
        id: 'products.category.all',
        defaultMessage: 'All categories',
      })}
      value={value}
      renderValue={(chosen) =>
        chosen === UNCATEGORISED
          ? uncategorised
          : (options.find((option) => option.id === chosen)?.name ?? '')
      }
      // Manage categories has no value: it opens a page, not a choice.
      onChange={(event) => {
        const next: unknown = event.target.value;
        if (typeof next === 'string') onChange(next);
      }}
      fullWidth={fullWidth}
      sx={fullWidth ? undefined : { minWidth: rem(200) }}
    >
      {options.map((option) => (
        <MenuItem
          key={option.id}
          value={option.id}
          aria-label={intl.formatMessage(
            {
              id: 'products.category.option',
              defaultMessage:
                '{path}, {count, plural, one {# item} other {# items}}',
            },
            { path: option.path.join(' › '), count: option.count },
          )}
          sx={{ pl: 2 + option.depth * 2, gap: 2 }}
        >
          <Box component="span" sx={{ flex: 1 }}>
            {option.name}
          </Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {option.count}
          </Box>
        </MenuItem>
      ))}
      <MenuItem
        value={UNCATEGORISED}
        aria-label={
          uncategorisedCount === undefined
            ? uncategorised
            : intl.formatMessage(
                {
                  id: 'products.category.option',
                  defaultMessage:
                    '{path}, {count, plural, one {# item} other {# items}}',
                },
                { path: uncategorised, count: uncategorisedCount },
              )
        }
        sx={{ gap: 2 }}
      >
        <Box component="span" sx={{ flex: 1 }}>
          {uncategorised}
        </Box>
        {uncategorisedCount !== undefined && (
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {uncategorisedCount}
          </Box>
        )}
      </MenuItem>
      <MenuItem
        onClick={() =>
          void navigate('/settings/categories', { state: OFFER_BACK })
        }
        sx={{ borderTop: 1, borderColor: 'divider' }}
      >
        {intl.formatMessage({
          id: 'products.category.manage',
          defaultMessage: 'Manage categories',
        })}
      </MenuItem>
    </SelectField>
  );
}
