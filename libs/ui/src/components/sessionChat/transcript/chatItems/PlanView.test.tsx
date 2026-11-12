// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';

import { theme } from '../../../../theme/themes.ts';

import { PlanView } from './PlanView.tsx';

afterEach(cleanup);

describe('PlanView', () => {
  it('renders entries with status and priority chips', () => {
    render(
      <ThemeProvider theme={theme}>
        <PlanView
          item={{
            entries: [
              { content: 'Write code', priority: 'high', status: 'in_progress' },
              { content: 'Ship it', status: 'pending' },
            ],
            id: 'p1',
            kind: 'plan',
          }}
        />
      </ThemeProvider>,
    );
    assert.isNotNull(screen.queryByText('Plan'));
    assert.isNotNull(screen.queryByText('Write code'));
    assert.isNotNull(screen.queryByText('Ship it'));
    assert.isNotNull(screen.queryByText('in_progress'));
    assert.isNotNull(screen.queryByText('high'));
    assert.isNotNull(screen.queryByText('pending'));
  });

  it('colors the status chip by status', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <PlanView
          item={{
            entries: [{ content: 'Done thing', status: 'completed' }],
            id: 'p2',
            kind: 'plan',
          }}
        />
      </ThemeProvider>,
    );
    const chip = container.querySelector('.MuiChip-root');
    assert.isTrue(chip?.classList.contains('MuiChip-colorSuccess'));
  });
});
