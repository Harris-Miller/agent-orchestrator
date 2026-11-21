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

const noop = (): void => undefined;

const expand = () => {
  fireEvent.click(screen.getByRole('button', { name: /Reconnecting/ }));
};

describe('SessionFailureView', () => {
  it('shows the title and severity icon collapsed; reason and details hidden', () => {
    renderView(item());
    assert.isNotNull(screen.queryByText('Reconnecting'));
    assert.isNotNull(screen.queryByLabelText('warning'));
    assert.isNull(screen.queryByText(/attempt 1 of 3/));
    assert.isNull(screen.queryByText('ECONNRESET'));
    assert.isNull(screen.queryByText('Retry'));
  });

  it('error severity icon', () => {
    renderView(item({ severity: 'error' }));
    assert.isNotNull(screen.queryByLabelText('error'));
  });

  it('expanding reveals reason and details', () => {
    renderView(item());
    expand();
    assert.isNotNull(screen.queryByText(/attempt 1 of 3/));
    assert.isNotNull(screen.queryByText('ECONNRESET'));
  });

  it('shows only offered, handled actions after expanding and calls their handlers', () => {
    const calls: string[] = [];
    renderView(item({ actions: ['retry', 'new_session'] }), {
      login: { hint: 'ignored', onSignIn: () => calls.push('login') },
      onNewSession: () => calls.push('new'),
      onRetry: () => calls.push('retry'),
    });
    expand();
    assert.isNull(screen.queryByText('Sign in'));
    fireEvent.click(screen.getByText('Retry'));
    fireEvent.click(screen.getByText('New session'));
    assert.deepStrictEqual(calls, ['retry', 'new']);
  });

  it('hides retry without a handler', () => {
    renderView(item({ actions: ['retry'] }));
    expand();
    assert.isNull(screen.queryByText('Retry'));
  });

  it('login without an in-app sign-in shows the hint as text; with one, a button', () => {
    renderView(item({ actions: ['login'] }), { login: { hint: 'Run codex login in a terminal.' } });
    expand();
    assert.isNotNull(screen.queryByText('Run codex login in a terminal.'));
    cleanup();
    const calls: string[] = [];
    renderView(item({ actions: ['login'] }), { login: { hint: 'h', onSignIn: () => calls.push('in') } });
    expand();
    fireEvent.click(screen.getByText('Sign in'));
    assert.deepStrictEqual(calls, ['in']);
  });

  it('Continue handler with retry action shows Continue while collapsed and calls it', () => {
    const calls: string[] = [];
    renderView(item({ actions: ['retry'], category: 'limit' }), { onContinue: () => calls.push('continue') });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    assert.deepStrictEqual(calls, ['continue']);
    expand();
    assert.isNull(screen.queryByText('Retry'));
  });

  it('Continue hidden without retry action or without a handler', () => {
    renderView(item({ actions: ['new_session'], category: 'limit' }), { onContinue: noop });
    assert.isNull(screen.queryByText('Continue'));
    cleanup();
    renderView(item({ actions: ['retry'], category: 'limit' }));
    assert.isNull(screen.queryByText('Continue'));
  });

  it('Retry handler shows Retry and calls it', () => {
    const calls: string[] = [];
    renderView(item({ actions: ['retry'] }), { onRetry: () => calls.push('retry') });
    expand();
    fireEvent.click(screen.getByText('Retry'));
    assert.deepStrictEqual(calls, ['retry']);
  });

  it('unknown actions never render buttons', () => {
    renderView(item({ actions: ['bogus' as never] }), { onNewSession: noop, onRetry: noop });
    expand();
    assert.isNull(screen.queryByRole('button', { name: /Retry|New session|Sign in/ }));
  });
});
