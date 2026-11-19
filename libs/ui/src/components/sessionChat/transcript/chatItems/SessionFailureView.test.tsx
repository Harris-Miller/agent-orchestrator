// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';

import { theme } from '../../../../theme/themes.ts';

import type { ChatItemOf } from './chatItemOf.ts';
import { SessionFailureView } from './SessionFailureView.tsx';
import type { SessionFailureHandlers } from './SessionFailureView.tsx';

afterEach(cleanup);

const item = (overrides: Partial<ChatItemOf<'session_failure'>> = {}): ChatItemOf<'session_failure'> => ({
  actions: ['retry', 'login', 'new_session'],
  category: 'connection',
  details: 'ECONNRESET',
  id: 'f1',
  kind: 'session_failure',
  reason: 'attempt 1 of 3',
  revision: 1,
  severity: 'warning',
  title: 'Reconnecting',
  ...overrides,
});

const renderView = (failure: ChatItemOf<'session_failure'>, handlers: SessionFailureHandlers = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <SessionFailureView handlers={handlers} item={failure} />
    </ThemeProvider>,
  );

describe('SessionFailureView', () => {
  it('renders title, reason, details and severity', () => {
    renderView(item());
    assert.isNotNull(screen.queryByText('Reconnecting'));
    assert.isNotNull(screen.queryByText(/attempt 1 of 3/));
    assert.isNotNull(screen.queryByText('ECONNRESET'));
    assert.isNotNull(screen.queryByRole('alert'));
  });

  it('shows only offered, handled actions and calls their handlers', () => {
    const calls: string[] = [];
    renderView(item({ actions: ['retry', 'new_session'] }), {
      login: { hint: 'ignored', onSignIn: () => calls.push('login') },
      onNewSession: () => calls.push('new'),
      onRetry: () => calls.push('retry'),
    });
    assert.isNull(screen.queryByText('Sign in'));
    fireEvent.click(screen.getByText('Retry'));
    fireEvent.click(screen.getByText('New session'));
    assert.deepStrictEqual(calls, ['retry', 'new']);
  });

  it('hides retry without a handler and shows no buttons for no actions', () => {
    renderView(item({ actions: ['retry'] }));
    assert.isNull(screen.queryByText('Retry'));
  });

  it('login without an in-app sign-in shows the hint as text; with one, a button', () => {
    renderView(item({ actions: ['login'] }), { login: { hint: 'Run codex login in a terminal.' } });
    assert.isNotNull(screen.queryByText('Run codex login in a terminal.'));
    cleanup();
    const calls: string[] = [];
    renderView(item({ actions: ['login'] }), { login: { hint: 'h', onSignIn: () => calls.push('in') } });
    fireEvent.click(screen.getByText('Sign in'));
    assert.deepStrictEqual(calls, ['in']);
  });
});
