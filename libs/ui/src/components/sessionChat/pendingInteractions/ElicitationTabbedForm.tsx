import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { elicitationKeyDown, ElicitationQuestionBody, KeyHints } from './ElicitationQuestionBody.tsx';
import type { SetElicitationValues } from './ElicitationQuestionBody.tsx';
import { canAcceptElicitation } from './elicitationFormViews.ts';
import type { ElicitationFieldView, ElicitationValues } from './elicitationFormViews.ts';
import { answerText, enterAction, flagMessage, isFlagged, questionStatus } from './elicitationQuestionNav.ts';

const StatusMark: FC<{ readonly answered: boolean }> = ({ answered }) => (
  <Box aria-hidden component="span" sx={{ color: answered ? 'success.main' : 'text.disabled' }}>
    {answered ? '✓' : '○'}
  </Box>
);

const tabSx = { minHeight: 36, py: 0.5, textTransform: 'none' } as const;

/** One question per tab plus a final Submit tab that reviews every answer. */
export const ElicitationTabbedForm: FC<{
  readonly agentTitle: string;
  readonly message: string;
  readonly onAccept: () => void;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
  readonly setValues: SetElicitationValues;
  readonly values: ElicitationValues;
  readonly views: readonly ElicitationFieldView[];
}> = ({ agentTitle, message, onAccept, onCancel, onDecline, setValues, values, views }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState(0);
  const [left, setLeft] = useState<ReadonlySet<string>>(() => new Set());
  const [submitOpened, setSubmitOpened] = useState(false);
  const review = tab === views.length;
  const canAccept = canAcceptElicitation(views, values);

  // Text/number questions take focus in their input; everything else focuses the card so keys reach it.
  useEffect(() => {
    const root = rootRef.current;
    (root?.querySelector<HTMLInputElement>('[data-autofocus]') ?? root)?.focus();
  }, [tab]);

  const go = (to: number) => {
    if (!review) setLeft(current => new Set(current).add(views[tab].name));
    if (to === views.length) setSubmitOpened(true);
    setTab(to);
  };
  const flagged = (view: ElicitationFieldView) => isFlagged(view, values, submitOpened || left.has(view.name));

  const onEnter = () => {
    const action = enterAction(views, values, tab);
    if (action.kind === 'accept') onAccept();
    else if (action.kind === 'go') go(action.tab);
  };

  return (
    <>
      <Typography color="text.secondary" variant="caption">
        {agentTitle} asks
      </Typography>
      <Typography gutterBottom variant="subtitle1">
        {message}
      </Typography>
      <Box
        onKeyDown={elicitationKeyDown({
          current: review ? undefined : views[tab],
          onCancel,
          onEnter,
          setValues,
          values,
        })}
        ref={rootRef}
        sx={{ outline: 'none' }}
        tabIndex={-1}
      >
        <Tabs
          onChange={(_, to: number) => {
            go(to);
          }}
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
          value={tab}
          variant="scrollable"
        >
          {views.map((view, index) => (
            <Tab
              key={view.name}
              label={
                <Stack direction="row" spacing={0.75} sx={{ color: flagged(view) ? 'error.main' : undefined }}>
                  <StatusMark answered={questionStatus(view, values) === 'answered'} />
                  <span>{view.caption ?? `Question ${index + 1}`}</span>
                </Stack>
              }
              sx={{ ...tabSx, color: flagged(view) ? 'error.main' : undefined }}
            />
          ))}
          <Tab label="Submit" sx={tabSx} />
        </Tabs>
        <Box sx={{ minHeight: 160, py: 1.5 }}>
          {review ? (
            <Stack spacing={0.5}>
              <Typography color="text.secondary" variant="caption">
                Review your answers
              </Typography>
              {views.map((view, index) => {
                const bad = flagged(view);
                const answer = answerText(view, values);
                return (
                  <ButtonBase
                    key={view.name}
                    onClick={() => {
                      go(index);
                    }}
                    sx={{ borderRadius: 1, display: 'block', px: 1, py: 0.5, textAlign: 'left' }}
                  >
                    <Typography variant="body2">
                      <StatusMark answered={questionStatus(view, values) === 'answered'} /> {view.label}
                    </Typography>
                    <Typography color={bad ? 'error' : 'text.secondary'} sx={{ pl: 2.5 }} variant="body2">
                      {answer ?? (bad ? flagMessage(view, values) : 'Not answered')}
                    </Typography>
                  </ButtonBase>
                );
              })}
            </Stack>
          ) : (
            <ElicitationQuestionBody
              flagged={flagged(views[tab])}
              setValues={setValues}
              values={values}
              view={views[tab]}
            />
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button onClick={onDecline} size="small" variant="outlined">
            Decline
          </Button>
          <Button onClick={onCancel} size="small">
            Cancel
          </Button>
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <KeyHints enter={review ? 'submit' : 'next'} />
          </Box>
          {review ? (
            <Button disabled={!canAccept} onClick={onAccept} size="small" variant="contained">
              Submit answers
            </Button>
          ) : (
            <>
              <Button
                disabled={tab === 0}
                onClick={() => {
                  go(tab - 1);
                }}
                size="small"
              >
                Back
              </Button>
              <Button onClick={onEnter} size="small" variant="contained">
                {tab === views.length - 1 ? 'Review' : 'Next'}
              </Button>
            </>
          )}
        </Stack>
      </Box>
    </>
  );
};
