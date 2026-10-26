import SvgIcon from '@mui/material/SvgIcon';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { LucideIcon as LucideGlyph } from 'lucide-react';
import type { FC } from 'react';

export type LucideIconProps = {
  readonly icon: LucideGlyph;
} & Omit<SvgIconProps, 'component'>;

/** Lucide glyph sized/colored like a MUI icon (`fontSize`, `sx`, `color`). */
export const LucideIcon: FC<LucideIconProps> = ({ icon: Icon, ...muiProps }) => (
  <SvgIcon component={Icon} inheritViewBox {...muiProps} />
);
