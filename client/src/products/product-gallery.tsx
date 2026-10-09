import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Close from '@mui/icons-material/Close';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import {
  Alert,
  Box,
  Button,
  Dialog,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';

import { api, messageFor } from '../lib/api';
import type { ProductImage } from '../lib/types';
import { uploadProductImage, type UploadState } from './upload-image';

/** ADR-062's limit, as the server holds it. */
const MAX_IMAGES = 8;
/** How long a removal can be undone before it is sent. */
const UNDO_MS = 5000;

interface Upload {
  key: string;
  name: string;
  state: UploadState | { stage: 'failed'; message: string };
}

const src = (fileId: string, size: 'thumb' | 'display' | 'full') =>
  `/api/v1/files/${fileId}?size=${size}`;

/**
 * A product's gallery (ADR-062): the cover large, the rest as thumbnails,
 * and for whoever may change the product, adding (chosen, dropped or
 * pasted, several at once, each with its progress), a menu on each image
 * (Make cover, Move left, Move right, Remove), dragging to reorder, and
 * Remove that can be undone. Clicking an image opens it at full size.
 */
export function ProductGallery({
  productId,
  productName,
  images: saved,
  canEdit,
}: {
  productId: string;
  productName: string;
  images: ProductImage[];
  canEdit: boolean;
}) {
  const intl = useIntl();
  const [images, setImages] = useState(saved);
  const [selected, setSelected] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; index: number }>();
  const [viewing, setViewing] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  const [pending, setPending] = useState<ProductImage | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // The removal waiting out its undo, for leaving the page to send.
  const waiting = useRef<ProductImage | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const active = uploads.filter((upload) => upload.state.stage !== 'failed');
  const room = MAX_IMAGES - images.length - active.length;

  const describe = (index: number, total = images.length) =>
    intl.formatMessage(
      {
        id: 'products.gallery.alt',
        defaultMessage:
          '{name}, image {position} of {total}{cover, select, true {, the cover} other {}}',
      },
      {
        name: productName,
        position: index + 1,
        total,
        cover: index === 0 ? 'true' : 'false',
      },
    );

  /** One file: uploaded, then added; its own row says how it is going. */
  const addOne = useCallback(
    async (file: File) => {
      const key = `${file.name}-${crypto.randomUUID()}`;
      const update = (state: Upload['state']) =>
        setUploads((all) =>
          all.map((upload) =>
            upload.key === key ? { ...upload, state } : upload,
          ),
        );
      setUploads((all) => [
        ...all,
        { key, name: file.name, state: { stage: 'uploading', percent: 0 } },
      ]);

      try {
        const fileId = await uploadProductImage(file, update);
        const { images: next } = await api<{ images: ProductImage[] }>(
          `/products/${productId}/images`,
          { method: 'POST', body: JSON.stringify({ fileId }) },
        );
        setImages(next);
        setUploads((all) => all.filter((upload) => upload.key !== key));
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message
            ? caught.message
            : messageFor(caught);
        update({ stage: 'failed', message });
      }
    },
    [productId],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      // Never more than the gallery has room for; the rest are not sent.
      for (const file of files.slice(0, Math.max(room, 0))) {
        void addOne(file);
      }
    },
    [addOne, room],
  );

  // Paste adds whatever image the clipboard holds (ADR-062).
  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const pasted = [...(event.clipboardData?.files ?? [])].filter((file) =>
        file.type.startsWith('image/'),
      );
      if (pasted.length > 0) {
        event.preventDefault();
        addFiles(pasted);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [canEdit, addFiles]);

  /** Sends a removal the undo window has passed. */
  const commitRemoval = useCallback(
    (image: ProductImage) => {
      void api(`/products/${productId}/images/${image.fileId}`, {
        method: 'DELETE',
      }).catch((caught: unknown) => setError(messageFor(caught)));
    },
    [productId],
  );

  // Leaving the page sends a removal still waiting out its undo.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (waiting.current) commitRemoval(waiting.current);
    },
    [commitRemoval],
  );

  function remove(index: number) {
    const image = images[index];
    // One undo at a time: an earlier removal is sent now.
    if (waiting.current) commitRemoval(waiting.current);
    window.clearTimeout(timer.current);
    setImages((all) => all.filter((_, at) => at !== index));
    setSelected(0);
    setPending(image);
    waiting.current = image;
    timer.current = window.setTimeout(() => {
      commitRemoval(image);
      waiting.current = null;
      setPending(null);
    }, UNDO_MS);
  }

  function undo() {
    window.clearTimeout(timer.current);
    const image = waiting.current;
    if (image) setImages((all) => [...all, image].sort(byPosition));
    waiting.current = null;
    setPending(null);
  }

  async function reorder(next: ProductImage[]) {
    const previous = images;
    setImages(next);
    try {
      const { images: stored } = await api<{ images: ProductImage[] }>(
        `/products/${productId}/images`,
        {
          method: 'PUT',
          body: JSON.stringify({ fileIds: next.map((image) => image.fileId) }),
        },
      );
      setImages(stored);
    } catch (caught) {
      setImages(previous);
      setError(messageFor(caught));
    }
  }

  const moved = (from: number, to: number) => {
    const next = [...images];
    const [image] = next.splice(from, 1);
    next.splice(to, 0, image);
    return next;
  };

  function onChoose(event: ChangeEvent<HTMLInputElement>) {
    addFiles([...(event.target.files ?? [])]);
    event.target.value = '';
  }

  function onDropFiles(event: DragEvent) {
    event.preventDefault();
    setDropping(false);
    if (dragging !== null) return;
    addFiles(
      [...event.dataTransfer.files].filter((file) =>
        file.type.startsWith('image/'),
      ),
    );
  }

  const chooser = (
    <input
      ref={input}
      hidden
      type="file"
      multiple
      accept="image/png,image/jpeg,image/webp"
      onChange={onChoose}
    />
  );

  const addButton = canEdit && (
    <Button
      variant="contained"
      startIcon={<ImageOutlined />}
      onClick={() => input.current?.click()}
      disabled={room <= 0}
    >
      {intl.formatMessage({
        id: 'products.gallery.add',
        defaultMessage: 'Add images',
      })}
    </Button>
  );

  const uploadRows = uploads.length > 0 && (
    <Stack spacing={1}>
      {uploads.map((upload) => (
        <Paper key={upload.key} variant="outlined" sx={{ p: 1.5 }}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ justifyContent: 'space-between' }}
          >
            <Typography noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
              {upload.name}
            </Typography>
            <Typography
              color={upload.state.stage === 'failed' ? 'error' : 'primary'}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {upload.state.stage === 'uploading'
                ? intl.formatMessage(
                    {
                      id: 'products.gallery.uploading',
                      defaultMessage: 'Uploading {percent}%',
                    },
                    { percent: upload.state.percent },
                  )
                : upload.state.stage === 'sizing'
                  ? intl.formatMessage({
                      id: 'products.gallery.sizing',
                      defaultMessage: 'Making sizes…',
                    })
                  : intl.formatMessage({
                      id: 'products.gallery.failed',
                      defaultMessage: 'Not added',
                    })}
            </Typography>
          </Stack>
          {upload.state.stage === 'failed' ? (
            <Typography variant="body2" color="error">
              {upload.state.message ||
                intl.formatMessage({
                  id: 'products.gallery.failedUnknown',
                  defaultMessage: 'It could not be uploaded. Try again.',
                })}
            </Typography>
          ) : (
            <LinearProgress
              variant={
                upload.state.stage === 'uploading'
                  ? 'determinate'
                  : 'indeterminate'
              }
              value={
                upload.state.stage === 'uploading'
                  ? upload.state.percent
                  : undefined
              }
              sx={{ mt: 1 }}
            />
          )}
        </Paper>
      ))}
    </Stack>
  );

  const limitNote = canEdit && (
    <Typography variant="body2" color="text.secondary">
      {room <= 0
        ? intl.formatMessage(
            {
              id: 'products.gallery.full',
              defaultMessage: '{count} of {max}. Remove one to add another.',
            },
            { count: images.length, max: MAX_IMAGES },
          )
        : intl.formatMessage(
            {
              id: 'products.gallery.hint',
              defaultMessage:
                'PNG, JPEG or WebP, up to 20 MB each, up to {max}. Drag photos here, paste one, or on a phone use the camera. Drag a thumbnail, or use its menu, to change the order.',
            },
            { max: MAX_IMAGES },
          )}
    </Typography>
  );

  const heading = (
    <Typography variant="h6" component="h2">
      {intl.formatMessage({
        id: 'products.gallery.title',
        defaultMessage: 'Images',
      })}
      <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
        {intl.formatMessage(
          {
            id: 'products.gallery.count',
            defaultMessage: '{count} of {max}',
          },
          { count: images.length, max: MAX_IMAGES },
        )}
      </Typography>
    </Typography>
  );

  // Nothing to show anyone who cannot add.
  if (images.length === 0 && !canEdit) return null;
  const currentIndex = Math.min(selected, images.length - 1);
  const current = images[currentIndex];

  return (
    <Paper
      variant="outlined"
      component="section"
      onDragOver={(event) => {
        if (!canEdit || dragging !== null) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={canEdit ? onDropFiles : undefined}
      sx={{
        p: { xs: 2, sm: 3 },
        ...(dropping
          ? { borderColor: 'primary.main', borderStyle: 'dashed' }
          : {}),
      }}
    >
      {chooser}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {images.length === 0 ? (
        <Stack spacing={2}>
          {heading}
          <Stack
            spacing={1.5}
            sx={{
              alignItems: 'center',
              textAlign: 'center',
              py: 5,
              px: 2,
              border: 2,
              borderStyle: 'dashed',
              borderColor: 'primary.light',
              borderRadius: 2,
            }}
          >
            <ImageOutlined color="primary" sx={{ fontSize: 44 }} />
            <Typography sx={{ fontWeight: 600 }}>
              {intl.formatMessage({
                id: 'products.gallery.empty',
                defaultMessage: 'Drag photos here',
              })}
            </Typography>
            {addButton}
            {limitNote}
          </Stack>
          {uploadRows}
        </Stack>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              md: '420px minmax(0, 1fr)',
            },
            gap: 3,
            alignItems: 'start',
          }}
        >
          <Stack spacing={1.5}>
            <Box
              component="button"
              type="button"
              onClick={() => setViewing(currentIndex)}
              aria-label={intl.formatMessage(
                {
                  id: 'products.gallery.open',
                  defaultMessage: 'Open {image} at full size',
                },
                { image: describe(currentIndex) },
              )}
              sx={{
                p: 0,
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                overflow: 'hidden',
                cursor: 'zoom-in',
                bgcolor: 'background.default',
              }}
            >
              <Box
                component="img"
                src={src(current.fileId, 'display')}
                alt={describe(currentIndex)}
                sx={{
                  display: 'block',
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'contain',
                }}
              />
            </Box>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: 'wrap' }}
            >
              {images.map((image, index) => (
                <Box key={image.fileId} sx={{ position: 'relative' }}>
                  <Box
                    component="button"
                    type="button"
                    draggable={canEdit}
                    onDragStart={() => setDragging(index)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(event: DragEvent) => {
                      if (dragging !== null) event.preventDefault();
                    }}
                    onDrop={(event: DragEvent) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (dragging !== null && dragging !== index) {
                        void reorder(moved(dragging, index));
                      }
                      setDragging(null);
                    }}
                    onClick={() => setSelected(index)}
                    aria-label={describe(index)}
                    aria-pressed={index === currentIndex}
                    sx={{
                      p: 0,
                      width: 76,
                      height: 76,
                      borderRadius: 1.5,
                      overflow: 'hidden',
                      border: index === currentIndex ? 2 : 1,
                      borderColor:
                        index === currentIndex ? 'primary.main' : 'divider',
                      cursor: canEdit ? 'grab' : 'pointer',
                      bgcolor: 'background.default',
                    }}
                  >
                    <Box
                      component="img"
                      src={src(image.fileId, 'thumb')}
                      alt=""
                      loading="lazy"
                      sx={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  </Box>
                  {canEdit && (
                    <IconButton
                      size="small"
                      aria-label={intl.formatMessage(
                        {
                          id: 'products.gallery.menu',
                          defaultMessage: 'Options for {image}',
                        },
                        { image: describe(index) },
                      )}
                      onClick={(event) =>
                        setMenu({ anchor: event.currentTarget, index })
                      }
                      sx={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        bgcolor: 'background.paper',
                        '&:hover': { bgcolor: 'background.paper' },
                      }}
                    >
                      <MoreVert fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Stack>
          </Stack>

          <Stack spacing={1.5}>
            {heading}
            <Typography color="text.secondary">
              {intl.formatMessage({
                id: 'products.gallery.about',
                defaultMessage:
                  'The first is the cover, shown beside the name in lists. Click any image to see it at full size and zoom in.',
              })}
            </Typography>
            {canEdit && <Box>{addButton}</Box>}
            {limitNote}
            {uploadRows}
          </Stack>
        </Box>
      )}

      {menu && (
        <Menu open anchorEl={menu.anchor} onClose={() => setMenu(undefined)}>
          <MenuItem
            disabled={menu.index === 0}
            onClick={() => {
              void reorder(moved(menu.index, 0));
              setMenu(undefined);
            }}
          >
            {intl.formatMessage({
              id: 'products.gallery.makeCover',
              defaultMessage: 'Make cover',
            })}
          </MenuItem>
          <MenuItem
            disabled={menu.index === 0}
            onClick={() => {
              void reorder(moved(menu.index, menu.index - 1));
              setMenu(undefined);
            }}
          >
            {intl.formatMessage({
              id: 'products.gallery.moveLeft',
              defaultMessage: 'Move left',
            })}
          </MenuItem>
          <MenuItem
            disabled={menu.index === images.length - 1}
            onClick={() => {
              void reorder(moved(menu.index, menu.index + 1));
              setMenu(undefined);
            }}
          >
            {intl.formatMessage({
              id: 'products.gallery.moveRight',
              defaultMessage: 'Move right',
            })}
          </MenuItem>
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              remove(menu.index);
              setMenu(undefined);
            }}
          >
            {intl.formatMessage({
              id: 'products.gallery.remove',
              defaultMessage: 'Remove',
            })}
          </MenuItem>
        </Menu>
      )}

      <Snackbar
        open={pending !== null}
        message={intl.formatMessage({
          id: 'products.gallery.removed',
          defaultMessage: 'Image removed',
        })}
        action={
          <Button color="inherit" onClick={undo}>
            {intl.formatMessage({
              id: 'products.gallery.undo',
              defaultMessage: 'Undo',
            })}
          </Button>
        }
      />

      {viewing !== null && images[viewing] && (
        <Viewer
          images={images}
          index={viewing}
          describe={describe}
          onMove={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </Paper>
  );
}

function byPosition(a: ProductImage, b: ProductImage): number {
  return a.position - b.position;
}

/**
 * One image at full size (ADR-062): Esc closes, ← → move between images,
 * a swipe does on a phone, a double-click or double-tap zooms in and out.
 */
function Viewer({
  images,
  index,
  describe,
  onMove,
  onClose,
}: {
  images: ProductImage[];
  index: number;
  describe: (index: number) => string;
  onMove: (index: number) => void;
  onClose: () => void;
}) {
  const intl = useIntl();
  const [zoomed, setZoomed] = useState(false);
  const start = useRef<number | null>(null);
  const image = images[index];

  const go = useCallback(
    (step: number) => {
      setZoomed(false);
      onMove((index + step + images.length) % images.length);
    },
    [index, images.length, onMove],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  return (
    <Dialog
      open
      fullScreen
      onClose={onClose}
      aria-label={describe(index)}
      slotProps={{
        paper: { sx: { bgcolor: 'rgba(12, 15, 20, 0.96)', color: '#FFFFFF' } },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ p: 2, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography>{describe(index)}</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            color="inherit"
            variant="outlined"
            href={src(image.fileId, 'full')}
            download
          >
            {intl.formatMessage({
              id: 'products.gallery.download',
              defaultMessage: 'Download',
            })}
          </Button>
          <IconButton
            color="inherit"
            onClick={onClose}
            aria-label={intl.formatMessage({
              id: 'common.close',
              defaultMessage: 'Close',
            })}
          >
            <Close />
          </IconButton>
        </Stack>
      </Stack>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 1,
          px: 1,
        }}
      >
        <IconButton
          color="inherit"
          onClick={() => go(-1)}
          disabled={images.length < 2}
          aria-label={intl.formatMessage({
            id: 'products.gallery.previous',
            defaultMessage: 'Previous image',
          })}
        >
          <ChevronLeft fontSize="large" />
        </IconButton>
        <Box
          onPointerDown={(event) => {
            start.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (start.current === null || zoomed) return;
            const moved = event.clientX - start.current;
            start.current = null;
            if (Math.abs(moved) > 60) go(moved < 0 ? 1 : -1);
          }}
          onDoubleClick={() => setZoomed((value) => !value)}
          sx={{
            height: '100%',
            overflow: zoomed ? 'auto' : 'hidden',
            touchAction: zoomed ? 'auto' : 'pan-y',
          }}
        >
          <Box
            component="img"
            src={src(image.fileId, 'full')}
            alt={describe(index)}
            sx={
              zoomed
                ? {
                    display: 'block',
                    width: '200%',
                    maxWidth: 'none',
                    cursor: 'zoom-out',
                  }
                : {
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    cursor: 'zoom-in',
                  }
            }
          />
        </Box>
        <IconButton
          color="inherit"
          onClick={() => go(1)}
          disabled={images.length < 2}
          aria-label={intl.formatMessage({
            id: 'products.gallery.next',
            defaultMessage: 'Next image',
          })}
        >
          <ChevronRight fontSize="large" />
        </IconButton>
      </Box>
      <Typography
        variant="body2"
        sx={{ textAlign: 'center', p: 1.5, color: '#C9D0DC' }}
      >
        {intl.formatMessage({
          id: 'products.gallery.viewerHint',
          defaultMessage:
            'Double-click or double-tap to zoom. ← → between images, Esc closes. On a phone, swipe.',
        })}
      </Typography>
    </Dialog>
  );
}
