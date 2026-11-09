import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { LANGUAGE_NAMES, type Locale, SUPPORTED_LOCALES } from '../lib/locales';
import { useSubmit } from '../lib/use-submit';
import type { NameAt } from './name-rows';
import type { ProductDetail } from './product-detail-page';

/** One language's names, as typed. Blank means "no name in it". */
interface Entry {
  name: string;
  description: string;
  /** By variant id, for the variants that have a name of their own. */
  variants: Record<string, string>;
}

type Form = Record<Locale, Entry>;

function formFrom(product: ProductDetail): Form {
  const entry = (locale: Locale): Entry => {
    const own = product.translations.find((row) => row.locale === locale);
    return {
      name: own?.name ?? '',
      description: own?.description ?? '',
      variants: Object.fromEntries(
        product.variants
          .filter((variant) => variant.name)
          .map((variant) => [
            variant.id,
            variant.translations?.find((row) => row.locale === locale)?.name ??
              '',
          ]),
      ),
    };
  };

  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, entry(locale)]),
  ) as Form;
}

/**
 * A product's name, description and variant names in each language
 * (ADR-054). The product's own name stays the base text and the fallback:
 * a language left blank prints the base name, unless the organization
 * requires that language, in which case a document in it is refused until
 * the name is here. The required languages are marked so, and the intro
 * says a blank prints the base name only of the others (ADR-092, #306's
 * 18). Opened from a missing name's Add, its field has focus.
 *
 * Saved whole, as the routes take it: a language cleared here is removed.
 * The product first, then each named variant, so a refusal on one leaves
 * the others as they were saved.
 */
export function TranslationsDialog({
  open,
  product,
  required = [],
  at = null,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: ProductDetail;
  /** The languages the organization's documents require. */
  required?: readonly Locale[];
  /** The name to start at, from its Add; null for the first field. */
  at?: NameAt | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [form, setForm] = useState<Form>(() => formFrom(product));
  const [loadedFor, setLoadedFor] = useState<ProductDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Fresh from the product each time the dialog opens on it.
  if (open && loadedFor !== product) {
    setLoadedFor(product);
    setForm(formFrom(product));
    setProblem(null);
  }

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'products.translations.saved',
        defaultMessage: 'Names saved',
      }),
    },
  );

  const named = product.variants.filter((variant) => variant.name);

  function close() {
    setLoadedFor(null);
    reset();
    onClose();
  }

  const others = SUPPORTED_LOCALES.filter(
    (locale) => !required.includes(locale),
  );
  const startsAt = (row: 'product' | string, locale: Locale) =>
    at !== null && at.row === row && at.locale === locale;

  function set(locale: Locale, change: Partial<Entry>) {
    setForm((current) => ({
      ...current,
      [locale]: { ...current[locale], ...change },
    }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // A description is what a name in that language says more about; on
    // its own it would be refused by the server as a row with no name.
    const orphan = SUPPORTED_LOCALES.find(
      (locale) =>
        form[locale].description.trim() !== '' &&
        form[locale].name.trim() === '',
    );
    if (orphan) {
      setProblem(
        intl.formatMessage(
          {
            id: 'products.translations.descriptionNeedsName',
            defaultMessage:
              'A description in {language} needs a name in {language} too.',
          },
          { language: LANGUAGE_NAMES[orphan] },
        ),
      );
      return;
    }
    setProblem(null);

    void submit(async () => {
      await api(`/products/${product.id}/translations`, {
        method: 'PUT',
        body: JSON.stringify({
          translations: SUPPORTED_LOCALES.filter(
            (locale) => form[locale].name.trim() !== '',
          ).map((locale) => ({
            locale,
            name: form[locale].name,
            description: form[locale].description || null,
          })),
        }),
      });

      for (const variant of named) {
        await api(
          `/products/${product.id}/variants/${variant.id}/translations`,
          {
            method: 'PUT',
            body: JSON.stringify({
              translations: SUPPORTED_LOCALES.filter((locale) =>
                form[locale].variants[variant.id]?.trim(),
              ).map((locale) => ({
                locale,
                name: form[locale].variants[variant.id],
              })),
            }),
          },
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'products.translations.title',
            defaultMessage: 'Names in other languages',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            {required.length > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {intl.formatMessage(
                  {
                    id: 'products.translations.introRequired',
                    defaultMessage:
                      'Documents require names in {languages}: while one is blank, orders and invoices holding this item cannot print.',
                  },
                  {
                    languages: intl.formatList(
                      required.map((locale) => LANGUAGE_NAMES[locale]),
                      { type: 'conjunction' },
                    ),
                  },
                )}
              </Typography>
            )}
            {others.length > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {required.length > 0
                  ? intl.formatMessage(
                      {
                        id: 'products.translations.introOthers',
                        defaultMessage:
                          'Where another language is left blank, documents in it print the base name, {name}.',
                      },
                      { name: product.name },
                    )
                  : intl.formatMessage(
                      {
                        id: 'products.translations.intro',
                        defaultMessage:
                          'Where a language is left blank, documents in it print the base name, {name}.',
                      },
                      { name: product.name },
                    )}
              </Typography>
            )}

            {(problem ?? error) && <FormError message={(problem ?? error)!} />}

            {SUPPORTED_LOCALES.map((locale) => (
              <Stack key={locale} spacing={1.5}>
                <Typography variant="subtitle2" component="h3">
                  <span lang={locale}>{LANGUAGE_NAMES[locale]}</span>
                  {required.includes(locale) && (
                    <Typography
                      variant="caption"
                      component="span"
                      sx={{ display: 'block', color: 'text.secondary' }}
                    >
                      {intl.formatMessage({
                        id: 'products.names.required',
                        defaultMessage: 'Required on documents',
                      })}
                    </Typography>
                  )}
                </Typography>

                <TextField
                  label={intl.formatMessage(
                    {
                      id: 'products.translations.name',
                      defaultMessage: 'Name in {language}',
                    },
                    { language: LANGUAGE_NAMES[locale] },
                  )}
                  value={form[locale].name}
                  onChange={(event) =>
                    set(locale, { name: event.target.value })
                  }
                  autoFocus={startsAt('product', locale)}
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 200, lang: locale } }}
                />

                <TextField
                  label={intl.formatMessage(
                    {
                      id: 'products.translations.description',
                      defaultMessage: 'Description in {language}',
                    },
                    { language: LANGUAGE_NAMES[locale] },
                  )}
                  value={form[locale].description}
                  onChange={(event) =>
                    set(locale, { description: event.target.value })
                  }
                  multiline
                  rows={2}
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 2000, lang: locale } }}
                />

                {named.map((variant) => (
                  <TextField
                    key={variant.id}
                    label={intl.formatMessage(
                      {
                        id: 'products.translations.variantName',
                        defaultMessage: '{sku}: {name}, in {language}',
                      },
                      {
                        sku: variant.sku,
                        name: variant.name,
                        language: LANGUAGE_NAMES[locale],
                      },
                    )}
                    value={form[locale].variants[variant.id] ?? ''}
                    autoFocus={startsAt(variant.id, locale)}
                    onChange={(event) =>
                      set(locale, {
                        variants: {
                          ...form[locale].variants,
                          [variant.id]: event.target.value,
                        },
                      })
                    }
                    fullWidth
                    slotProps={{ htmlInput: { maxLength: 100, lang: locale } }}
                  />
                ))}
              </Stack>
            ))}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'common.save',
            defaultMessage: 'Save',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
        />
      </form>
    </Dialog>
  );
}
