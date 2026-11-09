import { Box, MenuItem } from '@mui/material';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import { SelectField } from '../components/select-field';
import { OFFER_BACK } from '../lib/offer-back';
import { rem } from '../theme/rem';
import { type CategoryOption, UNCATEGORISED } from './item-list';

/**
 * Items' category filter (ADR-092): All categories, the tree with each
 * one's count on the open tab, Uncategorised, and Manage categories at
 * its foot, which opens Settings › Categories with Back to Items.
 */
export function CategoryFilter({
  options,
  value,
  onChange,
  fullWidth,
}: {
  options: CategoryOption[];
  value: string;
  onChange: (category: string) => void;
  fullWidth?: boolean;
}) {
  const intl = useIntl();
  const navigate = useNavigate();

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
      <MenuItem value={UNCATEGORISED}>
        {intl.formatMessage({
          id: 'products.category.none',
          defaultMessage: 'Uncategorised',
        })}
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
