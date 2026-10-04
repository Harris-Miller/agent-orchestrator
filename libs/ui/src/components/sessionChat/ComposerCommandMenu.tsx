import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { FC } from 'react';

import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

import { commandInvocation } from './composerCommandTokens.ts';
import { ComposerMenuRow, ComposerMenuShell } from './ComposerMenuShell.tsx';

export type ComposerCommandMenuProps = {
  readonly commands: readonly AvailableCommand[];
  readonly focusedIndex: number;
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: (command: AvailableCommand) => void;
  readonly open: boolean;
};

export const ComposerCommandMenu: FC<ComposerCommandMenuProps> = ({
  commands,
  focusedIndex,
  onFocusIndexChange,
  onSelect,
  open,
}) => (
  <ComposerMenuShell focusedIndex={focusedIndex} itemCount={commands.length} open={open}>
    {commands.map((command, index) => {
      const invocation = commandInvocation(command.name);
      const description = command.description ?? '';
      const row = (
        <ComposerMenuRow
          index={index}
          onFocusIndexChange={onFocusIndexChange}
          onSelect={() => {
            onSelect(command);
          }}
          primary={invocation}
          secondary={description}
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
