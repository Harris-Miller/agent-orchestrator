import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import { Brain } from 'lucide-react';
import type { FC } from 'react';

import { LucideMuiIcon } from '../../../LucideMuiIcon.tsx';
import { ChatMarkdown } from '../markdown/ChatMarkdown.tsx';

export const AgentThoughtView: FC<{ readonly text: string }> = ({ text }) => (
  <ListItem sx={{ alignItems: 'flex-start', display: 'block', py: 1 }}>
    <Box sx={{ alignItems: 'flex-start', display: 'flex', gap: 1, px: 0.5 }}>
      <LucideMuiIcon icon={Brain} sx={{ color: 'text.secondary', flexShrink: 0, fontSize: 16, mt: 0.5 }} />
      <ChatMarkdown sx={{ color: 'text.secondary', minWidth: 0, pt: 0.25 }} text={text} />
    </Box>
  </ListItem>
);
