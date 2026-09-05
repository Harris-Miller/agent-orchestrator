import type { CreateElicitationRequestBody, ElicitationContent, ElicitationPropertySchema } from '@libs/effect-acp';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

import { isRecord } from '../../utils.ts';

type FormRequest = {
  readonly message: string;
  readonly mode: 'form';
  readonly requestedSchema: {
    readonly properties?: Readonly<Record<string, ElicitationPropertySchema>>;
  };
};

const isFormRequest = (request: CreateElicitationRequestBody): request is CreateElicitationRequestBody & FormRequest =>
  'mode' in request &&
  (request as { mode?: unknown }).mode === 'form' &&
  'requestedSchema' in request &&
  'message' in request;

const propertyEntries = (request: FormRequest): readonly (readonly [string, ElicitationPropertySchema])[] => {
  const { properties } = request.requestedSchema;
  if (properties === undefined) {
    return [];
  }
  return Object.entries(properties);
};

const isSupportedProperty = (property: ElicitationPropertySchema): boolean => {
  if (!isRecord(property) || typeof property.type !== 'string') {
    return false;
  }
  return (
    property.type === 'string' ||
    property.type === 'boolean' ||
    property.type === 'number' ||
    property.type === 'integer'
  );
};

const defaultValueFor = (property: ElicitationPropertySchema): boolean | number | string => {
  if (!isRecord(property)) {
    return '';
  }
  if (property.type === 'boolean') {
    return typeof property.default === 'boolean' ? property.default : false;
  }
  if (property.type === 'number' || property.type === 'integer') {
    return typeof property.default === 'number' ? property.default : 0;
  }
  if (typeof property.default === 'string') {
    return property.default;
  }
  if (Array.isArray(property.enum) && typeof property.enum[0] === 'string') {
    return property.enum[0];
  }
  return '';
};

export const ElicitationFormCard: FC<{
  readonly agentTitle: string;
  readonly onAccept: (content: ElicitationContent) => void;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
  readonly request: CreateElicitationRequestBody;
}> = ({ agentTitle, onAccept, onCancel, onDecline, request }) => {
  const formRequest = isFormRequest(request) ? request : undefined;
  const entries = formRequest === undefined ? [] : propertyEntries(formRequest);

  const [values, setValues] = useState<Record<string, boolean | number | string>>(() => {
    const initial: Record<string, boolean | number | string> = {};
    for (const [name, property] of entries) {
      if (isSupportedProperty(property)) {
        initial[name] = defaultValueFor(property);
      }
    }
    return initial;
  });

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
        {entries.map(([name, property]) => {
          if (!isSupportedProperty(property) || !isRecord(property)) {
            return (
              <Typography color="text.secondary" key={name} variant="body2">
                Unsupported field “{name}” (type{' '}
                {isRecord(property) && typeof property.type === 'string' ? property.type : 'unknown'}) — decline or
                cancel.
              </Typography>
            );
          }

          const title = typeof property.title === 'string' ? property.title : name;
          const description = typeof property.description === 'string' ? property.description : undefined;

          if (property.type === 'boolean') {
            return (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={values[name] === true}
                    onChange={event => {
                      setValues(current => ({ ...current, [name]: event.target.checked }));
                    }}
                  />
                }
                key={name}
                label={title}
              />
            );
          }

          if (Array.isArray(property.enum) && property.enum.every(item => typeof item === 'string')) {
            return (
              <FormControl fullWidth key={name} size="small">
                <InputLabel id={`elicit-${name}`}>{title}</InputLabel>
                <Select
                  label={title}
                  labelId={`elicit-${name}`}
                  onChange={event => {
                    setValues(current => ({ ...current, [name]: event.target.value }));
                  }}
                  value={typeof values[name] === 'string' ? values[name] : ''}
                >
                  {property.enum.map(option => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            );
          }

          return (
            <TextField
              fullWidth
              helperText={description}
              key={name}
              label={title}
              onChange={event => {
                const raw = event.target.value;
                if (property.type === 'number' || property.type === 'integer') {
                  const parsed = Number(raw);
                  setValues(current => ({ ...current, [name]: Number.isFinite(parsed) ? parsed : 0 }));
                  return;
                }
                setValues(current => ({ ...current, [name]: raw }));
              }}
              size="small"
              type={property.type === 'number' || property.type === 'integer' ? 'number' : 'text'}
              value={values[name] ?? ''}
            />
          );
        })}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button
          onClick={() => {
            const content: Record<string, boolean | number | string> = {};
            for (const [name, value] of Object.entries(values)) {
              content[name] = value;
            }
            onAccept(content);
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
