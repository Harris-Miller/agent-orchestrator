import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import { Brain } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import type { AvailableCommand, ChatItem } from '../../../../host/sessionUpdateReducer.ts';
import { LucideMuiIcon } from '../../../LucideMuiIcon.tsx';
import { SessionFailureRow } from '../chatItems/SessionFailureRow.tsx';
import { ToolCallView } from '../chatItems/ToolCallView.tsx';
import { ChatItemView } from '../ChatItemView.tsx';
import { DisclosureButton, DisclosureChevron } from '../DisclosureButton.tsx';
import { splitWorkSegments, workItemPreviewText, workSegmentLabel } from './groupChatItems.ts';
import type { WorkRegion, WorkSegment } from './groupChatItems.ts';
import { SubagentItemView } from '../chatItems/SubagentItemView.tsx';
import { workRegionLabel } from './workRegionLabel.ts';
import { workRegionPhrase } from './workRegionPhrase.ts';

/** One line for a collapsed in-flight region's latest Work item. */
const WorkItemPreview: FC<{ item: ChatItem }> = ({ item }) => {
  switch (item.kind) {
    case 'tool_call':
      return <ToolCallView item={item} preview />;
    case 'session_failure':
      return <SessionFailureRow item={item} />;
    case 'agent_thought':
    case 'plan':
      return (
        <ListItem sx={{ display: 'block', py: 0 }}>
          <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, px: 0.5, py: 0.25 }}>
            {item.kind === 'agent_thought' ? (
              <LucideMuiIcon icon={Brain} sx={{ color: 'text.secondary', flexShrink: 0, fontSize: 16 }} />
            ) : null}
            <Typography color="text.secondary" noWrap sx={{ minWidth: 0 }} variant="body2">
              {workItemPreviewText(item)}
            </Typography>
          </Box>
        </ListItem>
      );
    default:
      return null;
  }
};

const ChatItemList: FC<{ availableCommands?: readonly AvailableCommand[]; items: readonly ChatItem[] }> = ({
  availableCommands,
  items,
}) => (
  <List dense disablePadding sx={{ pl: 1 }}>
    {items.map(item => (
      <ChatItemView availableCommands={availableCommands} item={item} key={item.id} />
    ))}
  </List>
);

const WorkSegmentView: FC<{
  availableCommands?: readonly AvailableCommand[];
  defaultOpen: boolean;
  segment: WorkSegment;
}> = ({ availableCommands, defaultOpen, segment }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <ListItem sx={{ display: 'block', py: 0 }}>
      <DisclosureButton
        onToggle={() => {
          setOpen(!open);
        }}
        open={open}
        sx={{ color: 'text.secondary', gap: 0.5, p: 0.5 }}
      >
        <DisclosureChevron open={open} />
        <Typography color="text.secondary" variant="body2">
          {workSegmentLabel(segment)}
        </Typography>
      </DisclosureButton>
      <Collapse in={open} unmountOnExit>
        <ChatItemList availableCommands={availableCommands} items={segment.items} />
      </Collapse>
    </ListItem>
  );
};

export const WorkRegionView: FC<{
  availableCommands?: readonly AvailableCommand[];
  inFlight: boolean;
  region: WorkRegion;
}> = ({ availableCommands, inFlight, region }) => {
  const [open, setOpen] = useState(false);
  const regionRef = useRef<HTMLLIElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
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
  const segments = splitWorkSegments(region.items);
  const segmentCount = segments.filter(entry => entry.kind === 'work_segment').length;
  // Open region going from flat to segmented: keep what the user was reading open in the first segment.
  const [prevSegmentCount, setPrevSegmentCount] = useState(segmentCount);
  const [firstSegmentOpen, setFirstSegmentOpen] = useState(false);
  if (segmentCount !== prevSegmentCount) {
    setPrevSegmentCount(segmentCount);
    if (open && prevSegmentCount === 1) setFirstSegmentOpen(true);
  }
  const firstSegmentId = segments.find(entry => entry.kind === 'work_segment')?.id;
  const latest = region.items.findLast(item => item.kind !== 'subagent');
  const subagents = region.items.filter(item => item.kind === 'subagent');
  return (
    // No top padding on the region: the header's natural top is the region's top, so any gap means it is stuck.
    <ListItem ref={regionRef} sx={{ display: 'block', pb: 0.5, pt: 0 }}>
      <Box
        ref={headerRef}
        sx={{ bgcolor: 'background.default', position: open ? 'sticky' : 'static', pt: 0.5, top: 0, zIndex: 1 }}
      >
        <DisclosureButton
          onToggle={() => {
            const stuck =
              (regionRef.current?.getBoundingClientRect().top ?? 0) <
              (headerRef.current?.getBoundingClientRect().top ?? 0);
            setOpen(!open);
            setFirstSegmentOpen(false);
            // Header's natural spot is the region's top; bring it back while the body collapses.
            if (open && stuck) regionRef.current?.scrollIntoView({ block: 'start' });
          }}
          open={open}
          sx={{ color: 'text.secondary', gap: 0.5, p: 0.5 }}
        >
          <DisclosureChevron open={open} />
          <Typography color="text.secondary" variant="body2">
            {workRegionLabel(region, inFlight, now, workRegionPhrase(region.id))}
          </Typography>
        </DisclosureButton>
      </Box>
      {!open && subagents.length > 0 ? (
        <List dense disablePadding sx={{ pl: 1 }}>
          {subagents.map(item => (
            <SubagentItemView item={item} key={item.id} />
          ))}
        </List>
      ) : null}
      {inFlight && !open && latest !== undefined ? (
        <List dense disablePadding sx={{ pl: 1 }}>
          <WorkItemPreview item={latest} />
        </List>
      ) : null}
      <Collapse in={open} unmountOnExit>
        {segmentCount === 1 ? (
          <ChatItemList availableCommands={availableCommands} items={region.items} />
        ) : (
          <List dense disablePadding sx={{ pl: 1 }}>
            {segments.map(entry =>
              entry.kind === 'work_segment' ? (
                <WorkSegmentView
                  availableCommands={availableCommands}
                  defaultOpen={firstSegmentOpen && entry.id === firstSegmentId}
                  key={`segment-${entry.id}`}
                  segment={entry}
                />
              ) : (
                <ChatItemView availableCommands={availableCommands} item={entry} key={entry.id} />
              ),
            )}
          </List>
        )}
      </Collapse>
    </ListItem>
  );
};
