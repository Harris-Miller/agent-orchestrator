import { CreateElicitationFormRequest } from '@libs/effect-acp';
import type { CreateElicitationRequestBody, ElicitationContent } from '@libs/effect-acp';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Schema } from 'effect';
import { useRef, useState } from 'react';
import type { FC } from 'react';

import type { ElicitationSummary } from '../../../host/sessionUpdateReducer.ts';
import { elicitationKeyDown, ElicitationQuestionBody, KeyHints, useQuestionFocus } from './ElicitationQuestionBody.tsx';
import { ElicitationTabbedForm } from './ElicitationTabbedForm.tsx';
import {
  canAcceptElicitation,
  elicitationContent,
  elicitationFieldViews,
  elicitationSummaryRows,
  initialElicitationValues,
} from './elicitationFormViews.ts';
import type { ElicitationValues } from './elicitationFormViews.ts';
import { isFlagged } from './elicitationQuestionNav.ts';

export const PendingElicitationCard: FC<{
  readonly agentTitle: string;
  readonly onAccept: (content: ElicitationContent, summary: ElicitationSummary) => void;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
  readonly request: CreateElicitationRequestBody;
}> = ({ agentTitle, onAccept, onCancel, onDecline, request }) => {
  const formRequest = Schema.is(CreateElicitationFormRequest)(request) ? request : undefined;
  const views = formRequest === undefined ? [] : elicitationFieldViews(formRequest);
  const [values, setValues] = useState<ElicitationValues>(() => initialElicitationValues(views));
  const cardRef = useRef<HTMLDivElement>(null);
  const tabbed = views.length > 1;

  useQuestionFocus(cardRef, 0);

  if (formRequest === undefined) {
    return (
      <Paper sx={{ bgcolor: 'action.hover', p: 2 }} variant="outlined">
        <Typography gutterBottom variant="subtitle2">
          Unsupported elicitation from {agentTitle}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={onDecline} size="small" variant="outlined">
            Decline
          </Button>
          <Button onClick={onCancel} size="small">
            Cancel
          </Button>
        </Stack>
      </Paper>
    );
  }

  const canAccept = canAcceptElicitation(views, values);
  const accept = () => {
    onAccept(elicitationContent(values), {
      message: formRequest.message,
      rows: elicitationSummaryRows(views, values),
    });
  };

  if (tabbed) {
    return (
      <Paper sx={{ bgcolor: 'action.hover', p: 2 }} variant="outlined">
        <ElicitationTabbedForm
          agentTitle={agentTitle}
          message={formRequest.message}
          onAccept={accept}
          onCancel={onCancel}
          onDecline={onDecline}
          setValues={setValues}
          values={values}
          views={views}
        />
      </Paper>
    );
  }

  return (
    <Paper
      onKeyDown={elicitationKeyDown({
        current: views[0],
        onCancel,
        onEnter: () => {
          if (canAccept) accept();
        },
        setValues,
        values,
      })}
      ref={cardRef}
      sx={{ bgcolor: 'action.hover', outline: 'none', p: 2 }}
      tabIndex={-1}
      variant="outlined"
    >
      <Typography color="text.secondary" variant="caption">
        {agentTitle} asks
      </Typography>
      <Typography gutterBottom variant="subtitle1">
        {formRequest.message}
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 2, mt: 1 }}>
        {views.map(view => (
          <ElicitationQuestionBody
            flagged={isFlagged(view, values, false)}
            key={view.name}
            setValues={setValues}
            values={values}
            view={view}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button disabled={!canAccept} onClick={accept} size="small" variant="contained">
          Accept
        </Button>
        <Button onClick={onDecline} size="small" variant="outlined">
          Decline
        </Button>
        <Button onClick={onCancel} size="small">
          Cancel
        </Button>
        <Box sx={{ flex: 1, textAlign: 'right' }}>
          <KeyHints enter="accept" view={views[0]} />
        </Box>
      </Stack>
    </Paper>
  );
};
