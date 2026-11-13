// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';

import type { ChatItemOf } from './chatItemOf.ts';
import { ElicitationSummaryView } from './ElicitationSummaryView.tsx';

afterEach(cleanup);

describe('ElicitationSummaryView', () => {
  it('renders the note under the value', () => {
    const item = {
      id: 'e1',
      kind: 'elicitation_summary',
      message: 'M',
      rows: [{ caption: undefined, label: 'Q', note: 'because', value: 'Alpha' }],
    } satisfies ChatItemOf<'elicitation_summary'>;
    render(<ElicitationSummaryView item={item} />);
    assert.isNotNull(screen.queryByText('Alpha'));
    assert.isNotNull(screen.queryByText('because'));
  });
});
