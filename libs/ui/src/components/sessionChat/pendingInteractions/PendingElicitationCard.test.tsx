// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { CreateElicitationFormRequest } from '@libs/effect-acp';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Schema } from 'effect';
import { afterEach, vi } from 'vitest';

import { theme } from '../../../theme/themes.ts';

import { PendingElicitationCard } from './PendingElicitationCard.tsx';

afterEach(cleanup);

const form = (properties: Record<string, unknown>, required: string[] = []) =>
  Schema.decodeUnknownSync(CreateElicitationFormRequest)({
    message: 'Questions',
    mode: 'form',
    requestedSchema: { properties, required, type: 'object' },
    sessionId: 's',
  });

const fourQuestions = form(
  {
    q0: {
      description: 'Approach?',
      oneOf: [
        { const: 'a', title: 'Atoms' },
        { const: 'b', title: 'Reducer' },
      ],
      title: 'State',
      type: 'string',
    },
    q0_custom: {
      _meta: { _askUserQuestionCustomAnswer: { questionId: 'q0' } },
      title: 'Other',
      type: 'string',
    },
    q1: { description: 'Features?', items: { enum: ['x', 'y'], type: 'string' }, title: 'Features', type: 'array' },
    q2: { description: 'Tests?', title: 'Tests', type: 'boolean' },
    q3: { description: 'Retries?', maximum: 5, minimum: 1, title: 'Retries', type: 'integer' },
  },
  ['q0', 'q3'],
);

const setup = (request = fourQuestions) => {
  const onAccept = vi.fn();
  const onCancel = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <PendingElicitationCard
        agentTitle="Claude"
        onAccept={onAccept}
        onCancel={onCancel}
        onDecline={vi.fn()}
        request={request}
      />
    </ThemeProvider>,
  );
  return { onAccept, onCancel };
};

const press = (key: string) => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key });
};

describe('PendingElicitationCard', () => {
  it('answers and submits a 4-question form from the keyboard', async () => {
    const { onAccept } = setup();
    press('2'); // Reducer
    press('Enter');
    press('1'); // x
    press('2'); // y
    press('2'); // un-y
    press('Enter');
    press('1'); // boolean on
    press('Enter');
    await waitFor(() => {
      assert.strictEqual(document.activeElement, screen.getByRole('spinbutton'));
    });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    press('Enter'); // to Submit tab
    assert.isNotNull(screen.queryByText('Review your answers'));
    press('Enter');
    assert.strictEqual(onAccept.mock.calls.length, 1);
    assert.deepStrictEqual(onAccept.mock.calls[0]?.[0], { q0: 'b', q1: ['x'], q2: true, q3: 3 });
  });

  it('picks Other with the digit after the last option and focuses its box', async () => {
    setup();
    press('3');
    await waitFor(() => {
      assert.strictEqual((document.activeElement as HTMLInputElement).placeholder, 'Other');
    });
    press('Escape');
    assert.isTrue(document.activeElement?.hasAttribute('tabindex'));
  });

  it('on Submit with an unanswered required question, Enter jumps back to it', () => {
    const { onAccept } = setup();
    for (let i = 0; i < 4; i += 1) press('Enter');
    press('Enter');
    assert.strictEqual(onAccept.mock.calls.length, 0);
    assert.isNull(screen.queryByText('Review your answers'));
    assert.isNotNull(screen.queryByText('Required'));
  });

  it('cancels on Escape', () => {
    const { onCancel } = setup();
    press('Escape');
    assert.strictEqual(onCancel.mock.calls.length, 1);
  });

  it('keeps a single question compact, with keyboard accept', () => {
    const { onAccept } = setup(
      form({ q: { oneOf: [{ const: 'a', title: 'A' }], title: 'Pick', type: 'string' } }, ['q']),
    );
    assert.isNull(screen.queryByRole('tab'));
    assert.isTrue((screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement).disabled);
    press('Enter');
    assert.strictEqual(onAccept.mock.calls.length, 0);
    press('1');
    press('Enter');
    assert.deepStrictEqual(onAccept.mock.calls[0]?.[0], { q: 'a' });
  });
});
