import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Link,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import type { ProductCategory, ProductEnvelope } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api, hasCode } from '../lib/api';
import type { ProductType } from '../lib/api-names';
import { useSubmit } from '../lib/use-submit';
import { CategorySelect } from './category-select';
import {
  PRODUCT_TYPES,
  productTypeLabel,
  productTypeLine,
} from './product-types';
import { unitLabel, UNITS } from './units';

/** What a field still needs before Add item sends anything. */
type Missing = 'type' | 'name' | 'sku';

/**
 * Add item (ADR-092): what it is first, the six types with a line each in
 * everyday words, chosen already from a type's tab and none from All, so
 * no default can be wrong (the design language's principle 8). Then its
 * name, category, code and unit; lot tracking for every type but
 * equipment, which is never offered it, a line saying how equipment counts
 * in its place.
 *
 * One form, two rows. ADR-023 requires every product to have at least one
 * variant, and this is where that meets a UI that should not mention
 * variants when there is only one: the Code field is the variant, and the
 * person never learns the word. A second size is added from the item's
 * page, where the concept becomes visible because it has become real.
 *
 * Once added, the new item's page opens in the list's place, so Back
 * returns to Items, and the message names what was added. A code in use is
 * refused under Code, opening the item that has it (#306's 35).
 *
 * Rendered only while open, so each opening starts afresh from the tab.
 */
export function CreateProductDialog({
  type: fromTab,
  categories,
  onClose,
}: {
  /** The open tab's type; null from All. */
  type: ProductType | null;
  categories: readonly ProductCategory[];
  onClose: () => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [type, setType] = useState<ProductType | ''>(fromTab ?? '');
  const [form, setForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    sku: '',
    variantName: '',
    unitOfMeasure: 'each',
  });
  const [tracksLots, setTracksLots] = useState(false);
  const [missing, setMissing] = useState<ReadonlySet<Missing>>(new Set());
  const typesRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const skuRef = useRef<HTMLInputElement>(null);

  const { submitting, error, errorCode, errorDetails, submit } =
    useSubmit<ProductEnvelope>(
      ({ product }) =>
        // The item's page in the list's place: Back returns to Items.
        void navigate(`/items/${product.id}`),
      {
        success: ({ product }) =>
          intl.formatMessage(
            { id: 'products.added', defaultMessage: 'Added “{name}”.' },
            { name: product.name },
          ),
      },
    );
  const codeInUse = hasCode(errorCode, 'code_in_use');
  const equipment = type === 'equipment';

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      if (field === 'name' || field === 'sku') forget(field);
    };
  }

  function forget(field: Missing) {
    setMissing((was) => {
      if (!was.has(field)) return was;
      const next = new Set(was);
      next.delete(field);
      return next;
    });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // Each field says what it needs under it, focus on the first.
    const needs = new Set<Missing>();
    if (!type) needs.add('type');
    if (!form.name.trim()) needs.add('name');
    if (!form.sku.trim()) needs.add('sku');
    setMissing(needs);
    if (needs.has('type')) typesRef.current?.querySelector('input')?.focus();
    else if (needs.has('name')) nameRef.current?.focus();
    else if (needs.has('sku')) skuRef.current?.focus();
    if (needs.size > 0 || !type) return;

    void submit(() =>
      api<ProductEnvelope>('/products', {
        method: 'POST',
        body: JSON.stringify({
          type,
          name: form.name,
          description: form.description || undefined,
          categoryId: form.categoryId || undefined,
          variant: {
            sku: form.sku,
            name: form.variantName || undefined,
            unitOfMeasure: form.unitOfMeasure,
            // Never offered for equipment, whatever was ticked before.
            tracksLots: !equipment && tracksLots,
          },
        }),
      }),
    );
  }

  return (
    <Dialog open onClose={submitting ? undefined : onClose} fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>
          {intl.formatMessage({
            id: 'products.create.title',
            defaultMessage: 'Add an item',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && !codeInUse && <FormError message={error} />}

            <FormControl error={missing.has('type')} component="fieldset">
              <FormLabel component="legend" sx={{ mb: 1 }}>
                {intl.formatMessage({
                  id: 'products.create.whatIsIt',
                  defaultMessage: 'What is it?',
                })}
              </FormLabel>
              <RadioGroup
                ref={typesRef}
                value={type}
                onChange={(event) => {
                  setType(event.target.value as ProductType);
                  forget('type');
                }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  columnGap: 2,
                  rowGap: 1,
                }}
              >
                {PRODUCT_TYPES.map((each) => (
                  <FormControlLabel
                    key={each}
                    value={each}
                    control={<Radio />}
                    sx={{ alignItems: 'flex-start', mr: 0 }}
                    label={
                      <Box sx={{ pt: 1 }}>
                        <Typography variant="body1" component="span">
                          {productTypeLabel(each, intl)}
                        </Typography>
                        <Typography
                          variant="body2"
                          component="span"
                          sx={{ display: 'block', color: 'text.secondary' }}
                        >
                          {productTypeLine(each, intl)}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
              {missing.has('type') && (
                <FormHelperText>
                  {intl.formatMessage({
                    id: 'products.create.chooseType',
                    defaultMessage: 'Choose what it is.',
                  })}
                </FormHelperText>
              )}
            </FormControl>

            <TextField
              id="product-name"
              inputRef={nameRef}
              label={intl.formatMessage({
                id: 'common.name',
                defaultMessage: 'Name',
              })}
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              error={missing.has('name')}
              helperText={
                missing.has('name')
                  ? intl.formatMessage({
                      id: 'products.create.needsName',
                      defaultMessage: 'Give it a name.',
                    })
                  : undefined
              }
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <CategorySelect
              id="product-category"
              label={intl.formatMessage({
                id: 'products.category',
                defaultMessage: 'Category',
              })}
              emptyLabel={intl.formatMessage({
                id: 'products.category.noneChoice',
                defaultMessage: 'None (Uncategorised)',
              })}
              value={form.categoryId}
              onChange={update('categoryId')}
              fullWidth
              categories={categories}
            />

            <TextField
              id="product-sku"
              inputRef={skuRef}
              label={intl.formatMessage({
                id: 'products.sku',
                defaultMessage: 'Code',
              })}
              required
              fullWidth
              value={form.sku}
              onChange={update('sku')}
              error={missing.has('sku') || codeInUse}
              helperText={
                codeInUse && error ? (
                  <>
                    {error}
                    {errorDetails?.productId && (
                      <Link
                        component={RouterLink}
                        to={`/items/${errorDetails.productId}`}
                        underline="always"
                        color="inherit"
                        sx={{ display: 'block' }}
                      >
                        {intl.formatMessage({
                          id: 'products.codeInUse.open',
                          defaultMessage: 'Open the item that has it',
                        })}
                      </Link>
                    )}
                  </>
                ) : missing.has('sku') ? (
                  intl.formatMessage({
                    id: 'products.create.needsCode',
                    defaultMessage:
                      'Give it a code, such as the one on its label.',
                  })
                ) : (
                  intl.formatMessage({
                    id: 'products.sku.help',
                    defaultMessage:
                      'Typed, not generated — this is the code on the label.',
                  })
                )
              }
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="product-unit"
              label={intl.formatMessage({
                id: 'products.unitOfMeasure',
                defaultMessage: 'Unit of measure',
              })}
              select
              fullWidth
              value={form.unitOfMeasure}
              onChange={update('unitOfMeasure')}
              helperText={intl.formatMessage({
                id: 'products.unitOfMeasure.help',
                defaultMessage: 'What stock is counted in.',
              })}
            >
              {UNITS.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unitLabel(unit, intl)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="variant-name"
              label={intl.formatMessage({
                id: 'products.variation',
                defaultMessage: 'Size or variation',
              })}
              fullWidth
              value={form.variantName}
              onChange={update('variantName')}
              helperText={intl.formatMessage({
                id: 'products.variation.helpOptional',
                defaultMessage:
                  'Optional. 60ct, Large, Blue — leave blank if there is only one.',
              })}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="product-description"
              label={intl.formatMessage({
                id: 'products.description',
                defaultMessage: 'Description',
              })}
              multiline
              rows={2}
              fullWidth
              value={form.description}
              onChange={update('description')}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />

            {equipment ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {intl.formatMessage({
                  id: 'products.create.equipmentLine',
                  defaultMessage:
                    'Equipment is not tracked by lot. It has a place, and is moved and counted, but is not stock value.',
                })}
              </Typography>
            ) : (
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={tracksLots}
                      onChange={(event) => setTracksLots(event.target.checked)}
                      slotProps={{
                        input: { 'aria-describedby': 'product-lots-help' },
                      }}
                    />
                  }
                  label={intl.formatMessage({
                    id: 'products.tracksLots',
                    defaultMessage: 'Track lot numbers and expiry',
                  })}
                />
                {/* What it means, and that it is set once: flipping it on a
                    variant with stock leaves every row violating the
                    invariant in one direction or the other (ADR-023). */}
                <FormHelperText id="product-lots-help" sx={{ mt: 0 }}>
                  {intl.formatMessage({
                    id: 'products.tracksLots.help',
                    defaultMessage:
                      'Each delivery and each run then records its lot number and expiry, so a lot can be traced. It cannot be changed later.',
                  })}
                </FormHelperText>
              </Box>
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={onClose}
          label={intl.formatMessage({
            id: 'products.add',
            defaultMessage: 'Add item',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.adding',
            defaultMessage: 'Adding…',
          })}
        />
      </form>
    </Dialog>
  );
}
