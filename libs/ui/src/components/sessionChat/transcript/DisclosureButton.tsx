import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';

const DISCLOSURE_CHEVRON_SIZE = 16;

export const DisclosureChevron: FC<{ open: boolean }> = ({ open }) => (
  <LucideMuiIcon icon={open ? ChevronDown : ChevronRight} sx={{ fontSize: DISCLOSURE_CHEVRON_SIZE }} />
);

/** Empty slot as wide as {@link DisclosureChevron}, so rows without a chevron stay column-aligned. */
export const DisclosureChevronSpacer: FC = () => <Box sx={{ flexShrink: 0, width: DISCLOSURE_CHEVRON_SIZE }} />;

/** Unstyled native button with `aria-expanded` and visible keyboard focus. */
export const DisclosureButton: FC<{
  children: ReactNode;
  onToggle: () => void;
  open: boolean;
  sx?: Exclude<SxProps<Theme>, readonly unknown[]>;
}> = ({ children, onToggle, open, sx }) => (
  <Box
    aria-expanded={open}
    component="button"
    onClick={onToggle}
    sx={[
      {
        alignItems: 'center',
        bgcolor: 'transparent',
        border: 0,
        borderRadius: 1,
        cursor: 'pointer',
        display: 'flex',
        font: 'inherit',
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
      },
      sx ?? false,
    ]}
  >
    {children}
  </Box>
);
