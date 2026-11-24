// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { CreateElicitationFormRequest, CreateElicitationUrlSessionRequest } from '@lib/effect-acp';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Schema } from 'effect';
import { afterEach, vi } from 'vitest';

import { hostRunPromise } from '../../../hostRuntime.ts';
import { theme } from '../../../theme/themes.ts';

import { PendingElicitationCard } from './PendingElicitationCard.tsx';

vi.mock('../../../hostRuntime.ts', () => ({ hostRunPromise: vi.fn(() => Promise.resolve()) }));
vi.mock('../../../host/openChatLink.ts', () => ({ openChatLink: vi.fn((link: unknown) => link) }));

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

const urlRequest = (url: string) =>
  Schema.decodeUnknownSync(CreateElicitationUrlSessionRequest)({
    elicitationId: 'e1',
    message: 'Sign in please',
    mode: 'url',
    sessionId: 's',
    url,
  });

const setupUrl = (url: string) => {
  const onAccept = vi.fn();
  const onCancel = vi.fn();
  const onDecline = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <PendingElicitationCard
        agentTitle="Claude"
        onAccept={onAccept}
        onCancel={onCancel}
        onDecline={onDecline}
        request={urlRequest(url)}
      />
    </ThemeProvider>,
  );
  return { onAccept, onCancel, onDecline };
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
    assert.strictEqual(document.activeElement, screen.getByRole('tablist').closest('[tabindex="-1"]'));
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
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint resolves testing-library types differently from tsc
    assert.isTrue((screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement).disabled);
    press('Enter');
    assert.strictEqual(onAccept.mock.calls.length, 0);
    press('1');
    press('Enter');
    assert.deepStrictEqual(onAccept.mock.calls[0]?.[0], { q: 'a' });
  });

  it('Enter on the selected tab advances', () => {
    setup();
    const [selected] = screen.getAllByRole('tab');
    selected.focus();
    fireEvent.keyDown(selected, { key: 'Enter' });
    assert.strictEqual(screen.getAllByRole('tab')[1]?.getAttribute('aria-selected'), 'true');
  });

  it('ignores digits with a modifier held', () => {
    setup();
    fireEvent.keyDown(document.activeElement ?? document.body, { ctrlKey: true, key: '2' });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: '2', metaKey: true });
    fireEvent.keyDown(document.activeElement ?? document.body, { altKey: true, key: '2' });
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint resolves testing-library types differently from tsc
    assert.isFalse((screen.getByRole('radio', { name: /Reducer/ }) as HTMLInputElement).checked);
  });

  it('focuses the input of a lone number question on mount', async () => {
    setup(form({ n: { title: 'N', type: 'integer' } }));
    await waitFor(() => {
      assert.strictEqual(document.activeElement, screen.getByRole('spinbutton'));
    });
  });

  it('renders a codex note inside a compact form and submits both keys', () => {
    const { onAccept } = setup(
      form({
        question_0: { oneOf: [{ const: 'a', title: 'A' }], title: 'Pick', type: 'string' },
        question_0_note: {
          _meta: { codex: { questionId: 'question_0', role: 'user_note' } },
          title: 'Additional answer or note',
          type: 'string',
        },
      }),
    );
    assert.isNull(screen.queryByRole('tab'));
    press('1');
    fireEvent.change(screen.getByRole('textbox', { name: 'Additional answer or note' }), {
      target: { value: 'because' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    assert.deepStrictEqual(onAccept.mock.calls[0]?.[0], { question_0: 'a', question_0_note: 'because' });
    const [, payload] = onAccept.mock.calls[0] as [unknown, { rows: { note: string }[] }];
    assert.strictEqual(payload.rows[0]?.note, 'because');
  });

  it('shows the question as a heading and labels the text input with it', () => {
    setup(form({ q: { title: 'Which branch should I use for the release?', type: 'string' } }));
    const textbox = screen.getByRole('textbox', { name: 'Which branch should I use for the release?' });
    assert.isNotNull(textbox);
    assert.isNotNull(screen.queryByText('Questions'));
    assert.strictEqual(screen.getAllByText('Which branch should I use for the release?').length, 1);
  });

  it('renders URL mode with message and full url, and routes buttons', () => {
    const url = 'https://auth.example.com/login?token=abc#frag';
    const { onAccept, onCancel, onDecline } = setupUrl(url);
    assert.isNotNull(screen.queryByText('Sign in please'));
    assert.isNotNull(screen.queryByText(url));
    assert.isNull(screen.queryByText(/Unsupported/));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    assert.strictEqual(onAccept.mock.calls.length, 1);
    assert.deepStrictEqual(onAccept.mock.calls[0], [{}, { message: 'Sign in please', rows: [] }]);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    assert.strictEqual(onDecline.mock.calls.length, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    assert.strictEqual(onCancel.mock.calls.length, 1);
  });

  it('Open link calls the host and does not respond', () => {
    const { onAccept, onCancel, onDecline } = setupUrl('https://example.com/x');
    fireEvent.click(screen.getByRole('button', { name: 'Open link' }));
    assert.deepStrictEqual(vi.mocked(hostRunPromise).mock.calls.at(-1) as unknown[], [
      { kind: 'url', url: 'https://example.com/x' },
    ]);
    assert.strictEqual(onAccept.mock.calls.length, 0);
    assert.strictEqual(onCancel.mock.calls.length, 0);
    assert.strictEqual(onDecline.mock.calls.length, 0);
  });

  it('focuses the URL card on mount and cancels on Escape', async () => {
    const { onCancel } = setupUrl('https://example.com/x');
    await waitFor(() => {
      assert.strictEqual(document.activeElement, screen.getByText('Sign in please').closest('[tabindex="-1"]'));
    });
    press('Escape');
    assert.strictEqual(onCancel.mock.calls.length, 1);
  });

  it('disables Open link for non-http urls', () => {
    setupUrl('file:///etc/passwd');
    assert.isTrue(screen.getByRole<HTMLButtonElement>('button', { name: 'Open link' }).disabled);
    assert.isNotNull(screen.queryByText('file:///etc/passwd'));
  });
});
