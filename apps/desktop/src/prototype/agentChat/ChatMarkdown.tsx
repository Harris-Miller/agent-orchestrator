import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { FC, ReactNode } from 'react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';

/** Look like a link; never emit a real <a href> (Tauri navigates absolute paths and breaks the shell). */
const MarkdownLink: FC<{ children?: ReactNode }> = ({ children }) => (
  <Box component="span" sx={{ color: 'primary.main', textDecoration: 'underline' }}>
    {children}
  </Box>
);

const markdownComponents = { a: MarkdownLink } satisfies Components;

const baseSx = {
  '& blockquote': {
    borderColor: 'divider',
    borderLeft: 3,
    color: 'text.secondary',
    m: 0,
    mb: 1,
    pl: 1.5,
  },
  '& code': {
    bgcolor: 'action.hover',
    borderRadius: 0.5,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.85em',
    px: 0.5,
    py: 0.125,
  },
  '& h1': { fontSize: '1.25rem' },
  '& h1, & h2, & h3, & h4, & h5, & h6': {
    '&:first-of-type': { mt: 0 },
    fontWeight: 600,
    lineHeight: 1.3,
    mb: 1,
    mt: 1.5,
  },
  '& h2': { fontSize: '1.1rem' },
  '& h3, & h4, & h5, & h6': { fontSize: '1rem' },
  '& hr': { borderColor: 'divider', my: 1.5 },
  '& ol, & ul': { m: 0, mb: 1, pl: 2.5 },
  '& p': { '&:last-child': { mb: 0 }, m: 0, mb: 1 },
  '& pre': {
    '& code': {
      bgcolor: 'transparent',
      borderRadius: 0,
      display: 'block',
      fontSize: '0.8125rem',
      p: 0,
    },
    bgcolor: 'action.hover',
    borderRadius: 1,
    mb: 1,
    overflow: 'auto',
    p: 1.5,
  },
  color: 'text.primary',
  typography: 'body2',
};

export const ChatMarkdown: FC<{ sx?: SxProps<Theme>; text: string }> = ({ sx, text }) => (
  <Box sx={[baseSx, sx] as SxProps<Theme>}>
    <Markdown components={markdownComponents} skipHtml>
      {text}
    </Markdown>
  </Box>
);
