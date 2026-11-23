// @vitest-environment happy-dom
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { theme } from '../../theme/themes.ts';
import { ComposerImageAttachments } from './composer/ComposerImageAttachments.tsx';
import { TranscriptImageTile } from './transcript/chatItems/UserMessageView.tsx';
import type { OpenFileSupport } from './useChatLinkProps.ts';

const state = vi.hoisted(() => ({ support: 'unsupported' as OpenFileSupport }));

vi.mock('./useChatLinkProps.ts', () => ({
  chatLinkHandlers: (open: () => void) => ({ onClick: open, role: 'link', tabIndex: 0 }),
  useChatLinkProps: () => undefined,
  useOpenFileSupport: () => state.support,
}));

vi.mock('./transcript/markdown/ChatMarkdown.tsx', () => ({ ChatMarkdown: () => null }));
vi.mock('./chips/ChipContent.tsx', () => ({ ChipContent: () => null }));

afterEach(cleanup);

const SRC = 'data:image/png;base64,AAAA';
const attachment = { id: 'a', name: 'pic', previewDataUrl: SRC, uri: 'file:///x/pic.png' };

const renderComposer = () =>
  render(
    <ThemeProvider theme={theme}>
      <ComposerImageAttachments attachments={[attachment as never]} onRemove={vi.fn()} />
    </ThemeProvider>,
  );
const renderTile = (image: object) =>
  render(
    <ThemeProvider theme={theme}>
      <TranscriptImageTile image={image as never} index={0} />
    </ThemeProvider>,
  );

describe('image tile lightbox gating', () => {
  it('composer tile opens the lightbox when open-file is resolved unsupported', () => {
    state.support = 'unsupported';
    renderComposer();
    fireEvent.click(screen.getByRole('link'));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
  });

  it.each<OpenFileSupport>(['supported', 'unknown'])('composer tile does not open the lightbox when %s', support => {
    state.support = support;
    renderComposer();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('transcript tile opens the lightbox when unsupported', () => {
    state.support = 'unsupported';
    renderTile({ name: 'pic', previewDataUrl: SRC });
    fireEvent.click(screen.getByRole('link'));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
  });

  it.each<OpenFileSupport>(['supported', 'unknown'])('transcript tile does not open the lightbox when %s', support => {
    state.support = support;
    renderTile({ name: 'pic', previewDataUrl: SRC });
    const link = screen.queryByRole('link');
    if (link !== null) fireEvent.click(link);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('broken placeholder (no src) is not clickable', () => {
    state.support = 'unsupported';
    renderTile({ name: 'pic' });
    expect(screen.queryByRole('link')).toBeNull();
  });
});
