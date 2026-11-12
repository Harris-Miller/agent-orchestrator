// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';

import { mockHostLayer } from '../../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../../hostRuntime.ts';
import { theme } from '../../../../theme/themes.ts';

import type { ChatItemOf } from './chatItemOf.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { UserMessageView } = await import('./UserMessageView.tsx');

afterEach(cleanup);

const mount = (item: Partial<ChatItemOf<'user_message'>>) =>
  render(
    <ThemeProvider theme={theme}>
      <UserMessageView
        availableCommands={[{ name: 'review' }]}
        item={{ id: 'u1', kind: 'user_message', text: '', ...item }}
      />
    </ThemeProvider>,
  );

describe('UserMessageView', () => {
  it('renders a command chip with its copy text', () => {
    mount({ text: 'run /review now' });
    assert.strictEqual(screen.getByTestId('transcript-command-chip').getAttribute('data-copy-text'), '/review');
  });

  it('renders a markdown link chip with its copy text', () => {
    mount({ text: 'see [docs](https://example.com/a)' });
    assert.strictEqual(
      screen.getByTestId('transcript-markdown-link-chip').getAttribute('data-copy-text'),
      '[docs](https://example.com/a)',
    );
  });

  it('shows the steering label when steering', () => {
    mount({ steering: true, text: 'hello' });
    assert.isNotNull(screen.queryByTestId('transcript-steering-label'));
  });

  it('omits the steering label otherwise', () => {
    mount({ text: 'hello' });
    assert.isNull(screen.queryByTestId('transcript-steering-label'));
  });

  it('renders nothing for an empty message', () => {
    const { container } = mount({});
    assert.strictEqual(container.innerHTML, '');
  });
});
