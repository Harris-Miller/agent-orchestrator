// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { ConfirmBulkSessionDeleteDialog } from './ConfirmBulkSessionDeleteDialog.tsx';

afterEach(cleanup);

describe('ConfirmBulkSessionDeleteDialog', () => {
  it('states the count and confirms once', () => {
    const onConfirm = vi.fn();
    render(<ConfirmBulkSessionDeleteDialog count={3} onCancel={vi.fn()} onConfirm={onConfirm} />);
    assert.isNotNull(screen.queryByText('Delete 3 sessions?'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    assert.strictEqual(onConfirm.mock.calls.length, 1);
  });

  it('uses the singular for one session', () => {
    render(<ConfirmBulkSessionDeleteDialog count={1} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    assert.isNotNull(screen.queryByText('Delete 1 session?'));
    assert.isNotNull(screen.queryByText(/permanently delete 1 session\./));
  });

  it('is closed for a zero count', () => {
    render(<ConfirmBulkSessionDeleteDialog count={0} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    assert.isNull(screen.queryByRole('dialog'));
  });
});
