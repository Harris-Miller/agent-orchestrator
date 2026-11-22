import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FC, PointerEvent as ReactPointerEvent } from 'react';

import {
  clampPan,
  MAX_SCALE,
  MIN_SCALE,
  RESET_VIEW,
  wheelFactor,
  ZOOM_STEP,
  zoomAt,
} from '../host/imageLightboxZoom.ts';
import type { ZoomView } from '../host/imageLightboxZoom.ts';
import { IconTooltipButton } from './IconTooltipButton.tsx';

const TITLE_ID = 'image-lightbox-title';

/** Zoom/pan state lives here so it resets whenever the Dialog (un)mounts its content. */
const LightboxBody: FC<{ readonly name?: string; readonly onClose: () => void; readonly src: string }> = ({
  name,
  onClose,
  src,
}) => {
  const [view, setView] = useState<ZoomView>(RESET_VIEW);
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const zoom = (factor: number, client?: { readonly x: number; readonly y: number }) => {
    const rect = viewport?.getBoundingClientRect();
    const anchor =
      rect === undefined || client === undefined
        ? { x: 0, y: 0 }
        : { x: client.x - rect.left - rect.width / 2, y: client.y - rect.top - rect.height / 2 };
    setView(v => clampPan(zoomAt(v, factor, anchor), rect ?? { height: 0, width: 0 }));
  };

  // React's onWheel is passive, so attach natively to preventDefault.
  useEffect(() => {
    if (viewport === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      setView(v => clampPan(zoomAt(v, wheelFactor(-event.deltaY, event.deltaMode), anchor), rect));
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
    };
  }, [viewport]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const last = drag.current;
    if (last === null) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    drag.current = { x: event.clientX, y: event.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    setView(v => clampPan({ ...v, x: v.x + dx, y: v.y + dy }, rect));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <>
      {name !== undefined && (
        <DialogTitle id={TITLE_ID} sx={{ fontSize: 14, py: 1 }}>
          {name}
        </DialogTitle>
      )}
      <Box
        onPointerCancel={endDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        ref={setViewport}
        sx={{
          bgcolor: 'action.hover',
          cursor: dragging ? 'grabbing' : 'grab',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
          touchAction: 'none',
        }}
      >
        <Box
          alt={name ?? ''}
          component="img"
          draggable={false}
          src={src}
          sx={{
            height: '100%',
            objectFit: 'contain',
            transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})`,
            userSelect: 'none',
            width: '100%',
          }}
        />
        <Box
          onPointerDown={event => {
            event.stopPropagation();
          }}
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 1,
            bottom: 8,
            display: 'flex',
            position: 'absolute',
            right: 8,
          }}
        >
          <IconTooltipButton
            disabled={view.scale >= MAX_SCALE}
            icon={ZoomIn}
            label="Zoom in"
            onClick={() => {
              zoom(ZOOM_STEP);
            }}
          />
          <IconTooltipButton
            disabled={view.scale <= MIN_SCALE}
            icon={ZoomOut}
            label="Zoom out"
            onClick={() => {
              zoom(1 / ZOOM_STEP);
            }}
          />
          <IconTooltipButton
            icon={Maximize}
            label="Reset zoom"
            onClick={() => {
              setView(RESET_VIEW);
            }}
          />
        </Box>
      </Box>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </>
  );
};

/** Dialog showing one image with wheel/button zoom and drag pan. */
export const ImageLightbox: FC<{
  readonly name?: string;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly src: string;
}> = ({ name, onClose, open, src }) => (
  <Dialog
    aria-label={name === undefined ? 'Image preview' : undefined}
    aria-labelledby={name === undefined ? undefined : TITLE_ID}
    maxWidth={false}
    onClose={onClose}
    open={open}
    slotProps={{ paper: { sx: { height: '90vh', width: '90vw' } } }}
  >
    <LightboxBody name={name} onClose={onClose} src={src} />
  </Dialog>
);
