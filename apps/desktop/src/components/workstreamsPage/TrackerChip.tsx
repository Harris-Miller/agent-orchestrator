import type { TrackerRef } from '@lib/hoa-home';
import Chip from '@mui/material/Chip';
import type { FC } from 'react';

import { trackerChipLabel } from './workstreamViews.ts';

/** Small outlined chip for a linked Tracker ref; pass `onDelete` to make it removable. */
export const TrackerChip: FC<{ readonly onDelete?: () => void; readonly trackerRef: TrackerRef }> = ({
  onDelete,
  trackerRef,
}) => (
  <Chip
    label={trackerChipLabel(trackerRef)}
    onDelete={onDelete}
    size="small"
    sx={{ fontSize: '0.65rem', height: 18 }}
    variant="outlined"
  />
);
