// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';

import { theme } from '../../../../theme/themes.ts';

import { RequestErrorView } from './RequestErrorView.tsx';

afterEach(cleanup);

describe('RequestErrorView', () => {
  it('renders method, code, message and details', () => {
    render(
      <ThemeProvider theme={theme}>
        <RequestErrorView
          item={{
            code: -32000,
            details: 'try again',
            id: '1',
            kind: 'request_error',
            message: 'boom',
            method: 'session/prompt',
          }}
        />
      </ThemeProvider>,
    );
    assert.isNotNull(screen.queryByText('session/prompt failed (-32000)'));
    assert.isNotNull(screen.queryByText(/boom/));
    assert.isNotNull(screen.queryByText('try again'));
  });
});
