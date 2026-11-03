import { CreateElicitationFormRequest } from '@libs/effect-acp';
import type { CreateElicitationRequestBody, ElicitationContent } from '@libs/effect-acp';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Schema } from 'effect';
import { useState } from 'react';
import type { FC } from 'react';

import {
  canAcceptElicitation,
  elicitationContent,
  elicitationFieldViews,
  elicitationSummaryRows,
  initialElicitationValues,
} from './elicitationFormViews.ts';
import type { ElicitationSummaryRow, ElicitationValue, ElicitationValues } from './elicitationFormViews.ts';

export const PendingElicitationCard: FC<{
  readonly agentTitle: string;
  readonly onAccept: (
    content: ElicitationContent,
    summary: { readonly message: string; readonly rows: readonly ElicitationSummaryRow[] },
  ) => void;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
  readonly request: CreateElicitationRequestBody;
}> = ({ agentTitle, onAccept, onCancel, onDecline, request }) => {
  const formRequest = Schema.is(CreateElicitationFormRequest)(request) ? request : undefined;
  const views = formRequest === undefined ? [] : elicitationFieldViews(formRequest);
  const [values, setValues] = useState<ElicitationValues>(() => initialElicitationValues(views));
  const setValue = (name: string, value: ElicitationValue) => {
    setValues(current => ({ ...current, [name]: value }));
  };

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

  return (
    <Paper sx={{ bgcolor: 'action.hover', p: 2 }} variant="outlined">
      <Typography color="text.secondary" variant="caption">
        {agentTitle} asks
      </Typography>
      <Typography gutterBottom variant="subtitle1">
        {formRequest.message}
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 2, mt: 1 }}>
        {views.map(view => {
          if (view.kind === 'unsupported') {
            return (
              <Typography color="text.secondary" key={view.name} variant="body2">
                Unsupported field “{view.name}” (type {view.type}) — decline or cancel.
              </Typography>
            );
          }
          const value = values[view.name];
          const caption = (
            <>
              {view.caption === undefined ? null : (
                <Typography color="text.secondary" component="span" sx={{ display: 'block' }} variant="caption">
                  {view.caption}
                </Typography>
              )}
              {view.label}
            </>
          );

          if (view.kind === 'boolean') {
            return (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={value === true}
                    onChange={event => {
                      setValue(view.name, event.target.checked);
                    }}
                  />
                }
                key={view.name}
                label={caption}
              />
            );
          }

          if (view.kind === 'single') {
            return (
              <FormControl key={view.name}>
                <FormLabel>{caption}</FormLabel>
                <RadioGroup
                  onChange={event => {
                    setValue(view.name, event.target.value);
                  }}
                  value={typeof value === 'string' ? value : ''}
                >
                  {view.options.map(option => (
                    <FormControlLabel
                      control={<Radio />}
                      key={option.value}
                      label={option.label}
                      value={option.value}
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            );
          }

          if (view.kind === 'multi') {
            const selected: readonly string[] = Array.isArray(value) ? value : [];
            return (
              <FormControl key={view.name}>
                <FormLabel>{caption}</FormLabel>
                <FormGroup>
                  {view.options.map(option => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={selected.includes(option.value)}
                          onChange={event => {
                            setValue(
                              view.name,
                              event.target.checked
                                ? [...selected, option.value]
                                : selected.filter(item => item !== option.value),
                            );
                          }}
                        />
                      }
                      key={option.value}
                      label={option.label}
                    />
                  ))}
                </FormGroup>
              </FormControl>
            );
          }

          const numeric = view.kind === 'number' || view.kind === 'integer';
          return (
            <TextField
              fullWidth
              key={view.name}
              label={caption}
              onChange={event => {
                const raw = event.target.value;
                setValue(view.name, numeric ? (raw === '' ? undefined : Number(raw)) : raw);
              }}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              type={numeric ? 'number' : 'text'}
              value={value ?? ''}
            />
          );
        })}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button
          disabled={!canAcceptElicitation(views, values)}
          onClick={() => {
            onAccept(elicitationContent(values), {
              message: formRequest.message,
              rows: elicitationSummaryRows(views, values),
            });
          }}
          size="small"
          variant="contained"
        >
          Accept
        </Button>
        <Button onClick={onDecline} size="small" variant="outlined">
          Decline
        </Button>
        <Button onClick={onCancel} size="small">
          Cancel
        </Button>
      </Stack>
    </Paper>
  );
};
