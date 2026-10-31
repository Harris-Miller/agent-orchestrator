import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { ChatItemView } from './ChatItemView.tsx';
import { workRegionLabel } from './groupChatItems.ts';
import type { WorkRegion } from './groupChatItems.ts';
import { workRegionPhrase } from './workRegionPhrase.ts';

export const WorkRegionView: FC<{
  availableCommands?: readonly AvailableCommand[];
  inFlight: boolean;
  region: WorkRegion;
  sessionId: string;
}> = ({ availableCommands, inFlight, region, sessionId }) => {
  const [toggle, setToggle] = useState<boolean>();
  const open = toggle ?? inFlight;
  return (
    <ListItem sx={{ display: 'block', py: 0.5 }}>
      <Box
        aria-expanded={open}
        component="button"
        onClick={() => {
          setToggle(!open);
        }}
        sx={{
          alignItems: 'center',
          bgcolor: 'transparent',
          border: 0,
          borderRadius: 1,
          color: 'text.secondary',
          cursor: 'pointer',
          display: 'flex',
          font: 'inherit',
          gap: 0.5,
          p: 0.5,
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
        }}
      >
        <LucideMuiIcon icon={open ? ChevronDown : ChevronRight} sx={{ fontSize: 16 }} />
        <Typography color="text.secondary" variant="body2">
          {workRegionLabel(region, inFlight, workRegionPhrase(sessionId, region.id))}
        </Typography>
      </Box>
      <Collapse in={open} unmountOnExit>
        <List dense disablePadding sx={{ pl: 1 }}>
          {region.items.map(item => (
            <ChatItemView availableCommands={availableCommands} item={item} key={item.id} />
          ))}
        </List>
      </Collapse>
    </ListItem>
  );
};
