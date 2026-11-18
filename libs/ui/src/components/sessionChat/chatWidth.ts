import { useAtomValue } from '@effect/atom-react';
import type { Theme } from '@mui/material/styles';

import { chatWidthAtom } from '../../atoms/boundHarnessAtoms.ts';
import type { ChatWidth } from '../../atoms/userSettings/userSettings.atoms.ts';

const BREAKPOINT_BY_WIDTH: Record<ChatWidth, 'md' | 'lg' | undefined> = {
  comfortable: 'md',
  full: undefined,
  wide: 'lg',
};

/** `sx` that caps a Chat column at the Chat width and centres it in the pane. */
export const chatWidthSx = (width: ChatWidth) => ({
  maxWidth: (theme: Theme) => {
    const breakpoint = BREAKPOINT_BY_WIDTH[width];
    return breakpoint === undefined ? 'none' : theme.breakpoints.values[breakpoint];
  },
  mx: 'auto',
  width: '100%',
});

/** `chatWidthSx` for the current Chat width setting. */
export const useChatWidthSx = () => chatWidthSx(useAtomValue(chatWidthAtom));
