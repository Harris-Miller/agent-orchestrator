import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

import { commandInvocation } from './composerCommandTokens.ts';

export type ComposerCommandMenuProps = {
  readonly commands: readonly AvailableCommand[];
  readonly focusedIndex: number;
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: (command: AvailableCommand) => void;
  readonly open: boolean;
};

const menuShellSx = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  maxHeight: 320,
  overflow: 'auto',
} as const;

export const ComposerCommandMenu: FC<ComposerCommandMenuProps> = ({
  commands,
  focusedIndex,
  onFocusIndexChange,
  onSelect,
  open,
}) => {
  if (!open) {
    return null;
  }

  return (
    <Paper elevation={8} sx={menuShellSx}>
      {commands.length === 0 ? (
        <Typography color="text.secondary" sx={{ px: 1.5, py: 1 }} variant="body2">
          No matches
        </Typography>
      ) : (
        <List dense disablePadding>
          {commands.map((command, index) => {
            const invocation = commandInvocation(command.name);
            const description = command.description ?? '';
            const row = (
              <ListItemButton
                onClick={() => {
                  onSelect(command);
                }}
                onMouseEnter={() => {
                  onFocusIndexChange(index);
                }}
                selected={index === focusedIndex}
                sx={{ py: 0.75 }}
              >
                <Typography component="div" noWrap sx={{ width: '100%' }} variant="body2">
                  <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700, mr: 1 }}>
                    {invocation}
                  </Box>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {description}
                  </Box>
                </Typography>
              </ListItemButton>
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
        </List>
      )}
    </Paper>
  );
};
