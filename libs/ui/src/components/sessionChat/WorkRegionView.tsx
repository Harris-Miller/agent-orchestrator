import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { ChatItemView } from './ChatItemView.tsx';
import { DisclosureButton, DisclosureChevron } from './DisclosureButton.tsx';
import type { WorkRegion } from './groupChatItems.ts';
import { workRegionLabel } from './workRegionLabel.ts';
import { workRegionPhrase } from './workRegionPhrase.ts';

export const WorkRegionView: FC<{
  availableCommands?: readonly AvailableCommand[];
  inFlight: boolean;
  region: WorkRegion;
}> = ({ availableCommands, inFlight, region }) => {
  const [toggle, setToggle] = useState<boolean>();
  const open = toggle ?? inFlight;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [inFlight]);
  return (
    <ListItem sx={{ display: 'block', py: 0.5 }}>
      <DisclosureButton
        onToggle={() => {
          setToggle(!open);
        }}
        open={open}
        sx={{ color: 'text.secondary', gap: 0.5, p: 0.5 }}
      >
        <DisclosureChevron open={open} />
        <Typography color="text.secondary" variant="body2">
          {workRegionLabel(region, inFlight, now, workRegionPhrase(region.id))}
        </Typography>
      </DisclosureButton>
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
