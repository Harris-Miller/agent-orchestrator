/** PROTOTYPE shared chrome for work-region variants. */
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

import type { WorkTurnFixture } from './fixture.ts';

export const PrototypeUserBubble: FC<{ text: string }> = ({ text }) => (
  <Box sx={{ display: 'flex', justifyContent: 'flex-end', py: 1 }}>
    <Paper
      sx={{
        bgcolor: 'action.selected',
        borderRadius: 2,
        maxWidth: 'min(85%, 42rem)',
        px: 1.75,
        py: 1.25,
      }}
      variant="outlined"
    >
      <Typography sx={{ whiteSpace: 'pre-wrap' }} variant="body1">
        {text}
      </Typography>
    </Paper>
  </Box>
);

export const PrototypeAgentAnswer: FC<{ markdown: string }> = ({ markdown }) => (
  <Box sx={{ py: 1 }}>
    <Typography
      component="pre"
      sx={{ fontFamily: 'inherit', m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      variant="body1"
    >
      {markdown}
    </Typography>
  </Box>
);

export const PrototypeStateDump: FC<{ children: ReactNode }> = ({ children }) => (
  <Box
    sx={{
      bgcolor: 'action.hover',
      borderRadius: 1,
      color: 'text.secondary',
      fontFamily: 'ui-monospace, monospace',
      fontSize: 11,
      mt: 2,
      p: 1,
      whiteSpace: 'pre-wrap',
    }}
  >
    <Typography color="text.secondary" sx={{ fontWeight: 700, mb: 0.5 }} variant="caption">
      PROTOTYPE state
    </Typography>
    {children}
  </Box>
);

export const PrototypeChatShell: FC<{
  readonly aboveComposer?: ReactNode;
  readonly children: ReactNode;
  readonly fixture: WorkTurnFixture;
}> = ({ aboveComposer, children, fixture }) => (
  <Box
    component="main"
    sx={{
      bgcolor: 'background.default',
      display: 'flex',
      flex: 1,
      flexDirection: 'column',
      gap: 0.5,
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden',
      p: 0.5,
    }}
  >
    <Box sx={{ bgcolor: 'transparent', flex: 1, minHeight: 0, overflow: 'auto', p: 0.5 }}>
      <PrototypeUserBubble text={fixture.userPrompt} />
      {children}
      <PrototypeAgentAnswer markdown={fixture.agentAnswerMarkdown} />
    </Box>
    <Box sx={{ flexShrink: 0 }}>
      {aboveComposer !== undefined && aboveComposer !== null ? (
        <Box
          sx={{
            bgcolor: 'action.hover',
            borderRadius: '14px 14px 0 0',
            color: 'text.secondary',
            fontSize: 12,
            mb: '-10px',
            mx: 1.5,
            pb: 1.75,
            pt: 1,
            px: 1.5,
          }}
        >
          {aboveComposer}
        </Box>
      ) : null}
      <Paper
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          boxShadow: 3,
          color: 'text.secondary',
          p: 1.5,
        }}
      >
        <Typography variant="body2">PROTOTYPE composer stub — read-only fixture transcript</Typography>
      </Paper>
    </Box>
  </Box>
);
