import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import type { FC } from 'react';

import { CopyMessageButton } from '../CopyMessageButton.tsx';
import { ChatMarkdown } from '../markdown/ChatMarkdown.tsx';
import { prepareChatMarkdownText } from '../markdown/stripEmbeddedContextBlocks.ts';

export const AgentMessageView: FC<{ readonly text: string }> = ({ text }) => {
  const markdown = prepareChatMarkdownText(text);
  return (
    <ListItem sx={{ alignItems: 'flex-start', display: 'block', py: 1 }}>
      <ChatMarkdown text={text} />
      {markdown.trim().length > 0 ? (
        <Box sx={{ ml: -0.75 }}>
          <CopyMessageButton getText={() => markdown} />
        </Box>
      ) : null}
    </ListItem>
  );
};
