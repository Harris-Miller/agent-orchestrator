import type { SxProps, Theme } from '@mui/material/styles';
import SvgIcon from '@mui/material/SvgIcon';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { LucideIcon } from 'lucide-react';
import type { FC } from 'react';

export type LucideMuiIconProps = {
  readonly icon: LucideIcon;
} & Omit<SvgIconProps, 'component'>;

const lucideFillSx = { fill: 'none' } as const;

/** Lucide glyph sized/colored like a MUI icon (`fontSize`, `sx`, `color`). */
export const LucideMuiIcon: FC<LucideMuiIconProps> = ({ icon: Icon, sx, ...muiProps }) => (
  // MUI SvgIcon defaults to CSS `fill: currentColor`, which paints Lucide's stroke paths solid.
  // Lucide sets fill="none" as an SVG attribute; CSS wins, so force fill none here.
  <SvgIcon
    component={Icon}
    inheritViewBox
    sx={(sx === undefined ? lucideFillSx : [lucideFillSx, sx]) as SxProps<Theme>}
    {...muiProps}
  />
);
