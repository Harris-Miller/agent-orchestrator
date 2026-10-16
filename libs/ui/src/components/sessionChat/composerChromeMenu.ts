import { useState } from 'react';
import type { MouseEvent } from 'react';

/** Min width of the Model column in the Model·Effort Menu (and matching mode Menu). */
export const COMPOSER_MODEL_MENU_MIN_WIDTH = 148;

const COMPOSER_CHROME_MENU_ANCHOR_ORIGIN = { horizontal: 'left', vertical: 'top' } as const;
const COMPOSER_CHROME_MENU_TRANSFORM_ORIGIN = { horizontal: 'left', vertical: 'bottom' } as const;

/** Shared anchor + Menu origins for composer / handoff chrome chips. */
export const useComposerChromeMenu = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = () => {
    setAnchorEl(null);
  };
  return {
    active: anchorEl !== null,
    close,
    menuProps: {
      anchorEl,
      anchorOrigin: COMPOSER_CHROME_MENU_ANCHOR_ORIGIN,
      onClose: close,
      open: anchorEl !== null,
      transformOrigin: COMPOSER_CHROME_MENU_TRANSFORM_ORIGIN,
    },
    openFromClick: (event: MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    },
  };
};
