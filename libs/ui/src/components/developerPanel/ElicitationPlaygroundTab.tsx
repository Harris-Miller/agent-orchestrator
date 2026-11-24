import { CreateElicitationFormRequest, CreateElicitationUrlSessionRequest } from '@lib/effect-acp';
import type { ElicitationContent } from '@lib/effect-acp';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Schema } from 'effect';
import { useState } from 'react';
import type { FC } from 'react';

import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import type { ElicitationSummary } from '../../host/sessionUpdateReducer.ts';
import { PendingElicitationCard } from '../sessionChat/pendingInteractions/PendingElicitationCard.tsx';
import { ElicitationSummaryView } from '../sessionChat/transcript/chatItems/ElicitationSummaryView.tsx';

const form = (message: string, properties: Record<string, unknown>, required: string[] = []) =>
  Schema.decodeUnknownSync(CreateElicitationFormRequest)({
    message,
    mode: 'form',
    requestedSchema: { properties, required, type: 'object' },
    sessionId: 'playground',
  });

const choices = [
  { const: 'atoms', title: 'Atoms' },
  { const: 'reducer', title: 'Reducer' },
  { const: 'context', title: 'Context' },
];

/** Claude pairs a choice question with a free-text "Other" field via `_askUserQuestionCustomAnswer`. */
const claudeOther = (questionId: string) => ({
  _meta: { _askUserQuestionCustomAnswer: { questionId } },
  title: 'Other',
  type: 'string',
});

const singleChoice = (description: string, title: string) => ({ description, oneOf: choices, title, type: 'string' });

/** Codex pairs a choice question with an optional note via `codex.role: user_note`. */
const codexNote = (questionId: string) => ({
  _meta: { codex: { questionId, role: 'user_note' } },
  title: 'Add a note',
  type: 'string',
});

type Scenario = {
  readonly request: ReturnType<typeof form> | CreateElicitationUrlSessionRequest;
  readonly title: string;
};

const SINGLE_QUESTION: readonly Scenario[] = [
  {
    request: form('One question', { q0: { description: 'What should we call it?', title: 'Name', type: 'string' } }, [
      'q0',
    ]),
    title: 'Text',
  },
  {
    request: form('One question', {
      q0: {
        _meta: { codex: { isSecret: true } },
        description: 'Paste the API token',
        title: 'Token',
        type: 'string',
      },
    }),
    title: 'Text (secret)',
  },
  {
    request: form('One question', {
      q0: { description: 'Where do we send the report?', format: 'email', title: 'Email', type: 'string' },
    }),
    title: 'Text (email format)',
  },
  {
    request: form('One question', {
      q0: { description: 'How many retries?', maximum: 5, minimum: 1, title: 'Retries', type: 'integer' },
    }),
    title: 'Integer',
  },
  {
    request: form('One question', {
      q0: { description: 'Sampling temperature?', maximum: 1, minimum: 0, title: 'Temperature', type: 'number' },
    }),
    title: 'Number',
  },
  {
    request: form('One question', { q0: { description: 'Run the tests?', title: 'Tests', type: 'boolean' } }),
    title: 'Boolean',
  },
  {
    request: form('One question', { q0: singleChoice('Which approach?', 'State') }, ['q0']),
    title: 'Single choice',
  },
  {
    request: form('One question', {
      q0: singleChoice('Which approach?', 'State'),
      q0_custom: claudeOther('q0'),
    }),
    title: 'Single choice + Other (Claude)',
  },
  {
    request: form('One question', {
      q0: singleChoice('Which approach?', 'State'),
      q0_note: codexNote('q0'),
    }),
    title: 'Single choice + note (Codex)',
  },
  {
    request: form('One question', {
      q0: {
        description: 'Which features?',
        items: { anyOf: choices },
        title: 'Features',
        type: 'array',
      },
    }),
    title: 'Multi choice',
  },
  {
    request: form(
      'One question',
      {
        q0: {
          description: 'Pick two or three',
          items: { anyOf: choices },
          maxItems: 3,
          minItems: 2,
          title: 'Features',
          type: 'array',
        },
        q0_custom: claudeOther('q0'),
      },
      ['q0'],
    ),
    title: 'Multi choice + Other, min/max (Claude)',
  },
  {
    request: form('One question', {
      q0: { description: 'Which features?', items: { anyOf: choices }, title: 'Features', type: 'array' },
      q0_note: codexNote('q0'),
    }),
    title: 'Multi choice + note (Codex)',
  },
];

const URL_MODE: readonly Scenario[] = [
  {
    request: Schema.decodeUnknownSync(CreateElicitationUrlSessionRequest)({
      elicitationId: 'playground-url',
      message: 'Sign in to continue',
      mode: 'url',
      sessionId: 'playground',
      url: 'https://auth.example.com/login?token=abc',
    }),
    title: 'URL',
  },
];

const MULTI_QUESTION: readonly Scenario[] = [
  {
    request: form(
      'Mixed question types',
      {
        q0: singleChoice('Approach?', 'State'),
        q0_custom: claudeOther('q0'),
        q1: { description: 'Features?', items: { anyOf: choices }, title: 'Features', type: 'array' },
        q2: { description: 'Tests?', title: 'Tests', type: 'boolean' },
        q3: { description: 'Retries?', maximum: 5, minimum: 1, title: 'Retries', type: 'integer' },
        q4: { description: 'Name?', title: 'Name', type: 'string' },
      },
      ['q0', 'q3'],
    ),
    title: 'Mixed (5 tabs, some required)',
  },
  {
    request: form(
      'Claude AskUserQuestion',
      {
        question_0: singleChoice('Which library?', 'Library'),
        question_0_custom: claudeOther('question_0'),
        question_1: { description: 'Which extras?', items: { anyOf: choices }, title: 'Extras', type: 'array' },
        question_1_custom: claudeOther('question_1'),
      },
      ['question_0'],
    ),
    title: 'Claude-style (choice + Other)',
  },
  {
    request: form('Codex request_user_input', {
      question_0: singleChoice('Which approach?', 'Approach'),
      question_0_note: codexNote('question_0'),
      question_1: {
        _meta: { codex: { isSecret: true } },
        description: 'Token?',
        title: 'Token',
        type: 'string',
      },
    }),
    title: 'Codex-style (choice + note, secret)',
  },
  {
    request: form('Two questions', {
      q0: singleChoice('Approach?', 'State'),
      q1: { description: 'Tests?', title: 'Tests', type: 'boolean' },
    }),
    title: 'Two questions',
  },
];

const JsonBlock: FC<{ readonly label: string; readonly value: unknown }> = ({ label, value }) => (
  <Accordion
    disableGutters
    slotProps={{ transition: { unmountOnExit: true } }}
    sx={{ bgcolor: 'action.hover', borderRadius: 1 }}
  >
    <AccordionSummary>
      <Typography sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }} variant="body2">
        {label}
      </Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>
      <Box
        component="pre"
        sx={{
          fontFamily: FONT_FAMILY_MONO,
          fontSize: '0.75rem',
          m: 0,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
        }}
      >
        {JSON.stringify(value, null, 2)}
      </Box>
    </AccordionDetails>
  </Accordion>
);

const REQUEST_ID = 1;

type Result =
  | { readonly _tag: 'pending' }
  | { readonly _tag: 'accepted'; readonly content: ElicitationContent; readonly summary: ElicitationSummary }
  | { readonly _tag: 'ended'; readonly outcome: 'Cancelled' | 'Declined' };

const ScenarioView: FC<{ readonly scenario: Scenario }> = ({ scenario }) => {
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<Result>({ _tag: 'pending' });

  const reset = () => {
    setRun(n => n + 1);
    setResult({ _tag: 'pending' });
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">{scenario.title}</Typography>
        <Button onClick={reset} size="small">
          Reset
        </Button>
      </Stack>
      {result._tag === 'pending' ? (
        <PendingElicitationCard
          agentTitle="Claude"
          key={run}
          onAccept={(nextContent, next) => {
            setResult({ _tag: 'accepted', content: nextContent, summary: next });
          }}
          onCancel={() => {
            setResult({ _tag: 'ended', outcome: 'Cancelled' });
          }}
          onDecline={() => {
            setResult({ _tag: 'ended', outcome: 'Declined' });
          }}
          request={scenario.request}
        />
      ) : null}
      {result._tag === 'ended' ? <Typography color="text.secondary">{result.outcome}</Typography> : null}
      <Stack spacing={1} sx={{ mt: 1 }}>
        <JsonBlock
          label="elicitation/create request"
          value={{ id: REQUEST_ID, jsonrpc: '2.0', method: 'elicitation/create', params: scenario.request }}
        />
        {result._tag === 'accepted' ? (
          <JsonBlock
            label="elicitation/create response (Accept)"
            value={{ id: REQUEST_ID, jsonrpc: '2.0', result: { action: 'accept', content: result.content } }}
          />
        ) : null}
      </Stack>
      {result._tag === 'accepted' ? (
        <List disablePadding>
          <ElicitationSummaryView
            item={{ ...result.summary, id: `playground-${scenario.title}`, kind: 'elicitation_summary' }}
          />
        </List>
      ) : null}
    </Box>
  );
};

const Section: FC<{ readonly scenarios: readonly Scenario[]; readonly title: string }> = ({ scenarios, title }) => (
  <Stack spacing={3}>
    <Typography variant="h6">{title}</Typography>
    {scenarios.map(scenario => (
      <ScenarioView key={scenario.title} scenario={scenario} />
    ))}
  </Stack>
);

/** Every Pending elicitation variation the Chat can show, with the transcript summary it produces on Accept. */
export const ElicitationPlaygroundTab: FC = () => (
  <Stack spacing={4} sx={{ maxWidth: 720 }}>
    <Section scenarios={SINGLE_QUESTION} title="Single question" />
    <Section scenarios={MULTI_QUESTION} title="Multiple questions" />
    <Section scenarios={URL_MODE} title="URL mode" />
  </Stack>
);
