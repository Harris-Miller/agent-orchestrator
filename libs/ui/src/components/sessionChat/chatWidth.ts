import type { Theme } from '@mui/material/styles';

import type { ChatWidth } from '../../atoms/userSettings/userSettings.atoms.ts';

/** `sx` that caps a Chat column at the Chat width and centres it in the pane. */
export const chatWidthSx = (width: ChatWidth) => ({
  maxWidth: (theme: Theme) => (width === 'full' ? 'none' : theme.breakpoints.values[width === 'wide' ? 'lg' : 'md']),
  mx: 'auto',
  width: '100%',
});
