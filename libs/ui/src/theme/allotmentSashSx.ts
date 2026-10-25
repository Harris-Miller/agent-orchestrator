/**
 * Allotment paints hover on ::before via --focus-border / --sash-hover-size.
 * Do not set .sash-hover backgroundColor — that fills the full --sash-size (8px) hit target.
 * Colors follow the active Theme preference's semantic tokens.
 */
export const allotmentSashSx = {
  '--focus-border': 'var(--primary)',
  '--sash-hover-size': '3px',
  '--separator-border': 'var(--border)',
  '& .split-view-separator-border > .split-view-container > .split-view-view:not(:first-of-type)::before': {
    backgroundColor: 'var(--border)',
  },
};
