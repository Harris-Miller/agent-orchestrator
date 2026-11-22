import Typography from '@mui/material/Typography';
import type { FC } from 'react';

// Panel widths (px) at which the title grows from "HOA" to "The HOA" to the full name; leaves room for header actions.
// Kept just under WORKBENCH_NAV_RAIL_WIDTH so the full name shows at the default width. Needs a `containerType: 'inline-size'` ancestor.
const TITLE_MEDIUM_MIN_WIDTH = 260;
const TITLE_FULL_MIN_WIDTH = 390;

/** The application title shown in a rail's header: full name, then "The HOA", then "HOA" as the panel narrows. */
export const AppTitle: FC = () => (
  <Typography
    noWrap
    sx={{
      fontWeight: 600,
      '& .title-full, & .title-medium': { display: 'none' },
      [`@container (min-width: ${TITLE_MEDIUM_MIN_WIDTH}px)`]: {
        '& .title-medium': { display: 'inline' },
        '& .title-short': { display: 'none' },
      },
      [`@container (min-width: ${TITLE_FULL_MIN_WIDTH}px)`]: {
        '& .title-full': { display: 'inline' },
        '& .title-medium': { display: 'none' },
      },
    }}
    variant="subtitle1"
  >
    <span className="title-full">Harness Orchestrating Agents</span>
    <span className="title-medium">The HOA</span>
    <span className="title-short">HOA</span>
  </Typography>
);
