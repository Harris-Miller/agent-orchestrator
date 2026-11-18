import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { Check } from 'lucide-react';
import type { ComponentProps, FC } from 'react';

import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';

type HoverHandlers = Pick<ComponentProps<typeof MenuItem>, 'onBlur' | 'onFocus' | 'onMouseEnter' | 'onMouseLeave'>;

/**
 * A dense picker row: label plus a check when selected. `unavailable` greys it and ignores clicks but, unlike MUI's
 * `disabled` (pointer-events: none, unfocusable), keeps hover and focus alive so the description strip still updates.
 */
export const CheckedMenuItem: FC<
  HoverHandlers & {
    readonly label: string;
    readonly onSelect: () => void;
    readonly opacity?: number;
    readonly selected: boolean;
    readonly unavailable?: boolean;
  }
> = ({ label, onSelect, opacity = 1, selected, unavailable = false, ...handlers }) => (
  <MenuItem
    {...handlers}
    aria-disabled={unavailable || undefined}
    onClick={() => {
      if (!unavailable) {
        onSelect();
      }
    }}
    selected={selected}
    sx={{ borderRadius: 1, gap: 1, opacity: unavailable ? 0.38 : opacity }}
  >
    <Typography sx={{ flex: 1, fontSize: 14 }}>{label}</Typography>
    {selected ? <LucideMuiIcon icon={Check} sx={{ fontSize: 16 }} /> : null}
  </MenuItem>
);
