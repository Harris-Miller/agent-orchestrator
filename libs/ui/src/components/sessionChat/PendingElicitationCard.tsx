import {
  CreateElicitationFormRequest,
  ElicitationArrayProperty,
  ElicitationBooleanProperty,
  ElicitationIntegerProperty,
  ElicitationNumberProperty,
  ElicitationStringProperty,
} from '@libs/effect-acp';
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
import { Schema } from 'effect';
import { useState } from 'react';
import type { FC } from 'react';

const SupportedFormProperty = Schema.Union([
  ElicitationStringProperty,
  ElicitationBooleanProperty,
  ElicitationNumberProperty,
  ElicitationIntegerProperty,
]);
type SupportedFormProperty = typeof SupportedFormProperty.Type;

const propertyEntries = (
  request: CreateElicitationFormRequest,
): readonly (readonly [string, ElicitationPropertySchema])[] => {
  const { properties } = request.requestedSchema;
  if (properties === undefined) {
    return [];
  }
  return Object.entries(properties);
};

const defaultValueFor = (property: SupportedFormProperty): boolean | number | string => {
  if (Schema.is(ElicitationBooleanProperty)(property)) {
    return property.default ?? false;
  }
  if (Schema.is(ElicitationNumberProperty)(property) || Schema.is(ElicitationIntegerProperty)(property)) {
    return property.default ?? 0;
  }
  if (property.default != null) {
    return property.default;
  }
  const firstEnum = property.enum?.[0];
  return firstEnum ?? '';
};

const unsupportedTypeLabel = (property: ElicitationPropertySchema): string => {
  if (Schema.is(ElicitationArrayProperty)(property)) {
    return property.type;
  }
  return 'unknown';
};

export const PendingElicitationCard: FC<{
  readonly agentTitle: string;
  readonly onAccept: (content: ElicitationContent) => void;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
  readonly request: CreateElicitationRequestBody;
}> = ({ agentTitle, onAccept, onCancel, onDecline, request }) => {
  const formRequest = Schema.is(CreateElicitationFormRequest)(request) ? request : undefined;
  const entries = formRequest === undefined ? [] : propertyEntries(formRequest);

  const [values, setValues] = useState<Record<string, boolean | number | string>>(() => {
    const initial: Record<string, boolean | number | string> = {};
    for (const [name, property] of entries) {
      if (Schema.is(SupportedFormProperty)(property)) {
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
          if (!Schema.is(SupportedFormProperty)(property)) {
            return (
              <Typography color="text.secondary" key={name} variant="body2">
                Unsupported field “{name}” (type {unsupportedTypeLabel(property)}) — decline or cancel.
              </Typography>
            );
          }

          const title = property.title ?? name;
          const description = property.description ?? undefined;

          if (Schema.is(ElicitationBooleanProperty)(property)) {
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

          if (Schema.is(ElicitationStringProperty)(property) && property.enum != null) {
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
                if (Schema.is(ElicitationNumberProperty)(property) || Schema.is(ElicitationIntegerProperty)(property)) {
                  const parsed = Number(raw);
                  setValues(current => ({ ...current, [name]: Number.isFinite(parsed) ? parsed : 0 }));
                  return;
                }
                setValues(current => ({ ...current, [name]: raw }));
              }}
              size="small"
              type={
                Schema.is(ElicitationNumberProperty)(property) || Schema.is(ElicitationIntegerProperty)(property)
                  ? 'number'
                  : 'text'
              }
              value={values[name] ?? ''}
            />
          );
        })}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button
          onClick={() => {
            onAccept(values);
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
