import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { FC } from 'react';

import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { HighlightFzfChars } from '../HighlightFzfChars.tsx';

import { ComposerMenuRow, ComposerMenuShell } from './ComposerMenuShell.tsx';
import { EMPTY_FZF_POSITIONS } from './filterAvailableCommands.ts';
import type { AvailableCommandMatch } from './filterAvailableCommands.ts';

export type ComposerCommandMenuProps = {
  readonly focusedIndex: number;
  readonly matches: readonly AvailableCommandMatch[];
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: (command: AvailableCommand) => void;
  readonly open: boolean;
};

export const ComposerCommandMenu: FC<ComposerCommandMenuProps> = ({
  focusedIndex,
  matches,
  onFocusIndexChange,
  onSelect,
  open,
}) => (
  <ComposerMenuShell focusedIndex={focusedIndex} itemCount={matches.length} open={open}>
    {matches.map((match, index) => {
      const { command, field, positions } = match;
      const { name } = command;
      const description = command.description ?? '';
      const namePositions = field === 'name' ? positions : EMPTY_FZF_POSITIONS;
      const descriptionPositions = field === 'description' ? positions : EMPTY_FZF_POSITIONS;
      const isDollar = name.startsWith('$');
      const primary = (
        <Box component="span" sx={{ fontWeight: 700 }}>
          {isDollar ? null : '/'}
          <HighlightFzfChars positions={namePositions} text={name} />
        </Box>
      );
      const secondary =
        description.length === 0 ? undefined : (
          <HighlightFzfChars positions={descriptionPositions} text={description} />
        );
      const row = (
        <ComposerMenuRow
          index={index}
          onFocusIndexChange={onFocusIndexChange}
          onSelect={() => {
            onSelect(command);
          }}
          primary={primary}
          secondary={secondary}
          selected={index === focusedIndex}
        />
      );

      if (description.length === 0) {
        return <Box key={command.name}>{row}</Box>;
      }

      return (
        <Tooltip
          disableFocusListener
          disableTouchListener
          enterDelay={400}
          key={command.name}
          placement="left"
          title={description}
        >
          <Box component="div">{row}</Box>
        </Tooltip>
      );
    })}
  </ComposerMenuShell>
);
