import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

import type {
  NormalizedConfigOption,
  NormalizedMode,
  NormalizedModel,
  SessionSnapshot,
} from '../../host/acpSessionBootstrap.ts';
import { normalizeSession } from '../../host/acpSessionBootstrap.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { UsageCard } from '../sessionChat/UsageCard.tsx';

export const sectionCardSx = {
  bgcolor: 'background.default',
  borderColor: 'divider',
  p: 1.5,
} as const;

export const Section: FC<{ children: ReactNode; pending?: boolean; title: string }> = ({
  children,
  pending,
  title,
}) => (
  <Stack spacing={1}>
    <Typography sx={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }} variant="caption">
      {title}
    </Typography>
    {pending === true ? (
      <Typography color="text.secondary" variant="body2">
        Pending…
      </Typography>
    ) : (
      children
    )}
  </Stack>
);

const OptionChips: FC<{
  readonly currentId?: string;
  readonly options: readonly (NormalizedMode | NormalizedModel)[];
}> = ({ currentId, options }) => {
  if (options.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        None reported
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {options.map(option => {
        const selected = option.id === currentId;
        return (
          <Paper key={option.id} sx={sectionCardSx} variant="outlined">
            <Stack spacing={0.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip
                  color={selected ? 'primary' : 'default'}
                  label={option.name}
                  size="small"
                  variant={selected ? 'filled' : 'outlined'}
                />
                {selected ? (
                  <Typography color="primary.main" variant="caption">
                    current
                  </Typography>
                ) : null}
              </Stack>
              <Typography color="text.secondary" sx={{ fontFamily: FONT_FAMILY_MONO }} variant="caption">
                {option.id}
              </Typography>
              {option.description !== undefined ? (
                <Typography color="text.secondary" variant="body2">
                  {option.description}
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
};

const ConfigOptionCard: FC<{ readonly option: NormalizedConfigOption }> = ({ option }) => (
  <Paper sx={sectionCardSx} variant="outlined">
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 600 }} variant="body2">
          {option.name}
        </Typography>
        <Chip label={option.type} size="small" variant="outlined" />
        {option.category !== undefined ? (
          <Chip color="default" label={option.category} size="small" variant="outlined" />
        ) : null}
      </Stack>
      {option.description !== undefined ? (
        <Typography color="text.secondary" variant="body2">
          {option.description}
        </Typography>
      ) : null}
      <Typography variant="body2">
        Current:{' '}
        <strong>
          {option.currentValue === undefined
            ? '—'
            : option.type === 'boolean'
              ? String(option.currentValue)
              : option.currentValue}
        </strong>
      </Typography>
      {option.type === 'select' && option.choices.length > 0 ? (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {option.choices.map(choice => (
            <Chip
              color={choice.id === option.currentValue ? 'primary' : 'default'}
              key={choice.id}
              label={choice.name}
              size="small"
              title={choice.description}
              variant={choice.id === option.currentValue ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  </Paper>
);

export const SessionStateContent: FC<{
  readonly availableCommands?: readonly AvailableCommand[];
  readonly selectedModeId?: string;
  readonly selectedModelId?: string;
  readonly session?: SessionSnapshot;
  readonly showSessionDetails: boolean;
}> = ({ availableCommands, selectedModeId, selectedModelId, session, showSessionDetails }) => {
  const sessionConfiguration =
    session?.sessionConfiguration !== undefined ? normalizeSession(session.sessionConfiguration) : undefined;

  return (
    <Stack spacing={2}>
      {showSessionDetails ? (
        <>
          <Section pending={sessionConfiguration === undefined} title="Session">
            {sessionConfiguration !== undefined ? (
              <Stack spacing={1.5}>
                {session?.sessionId !== undefined ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Chip label={session.sessionId} size="small" sx={{ fontFamily: FONT_FAMILY_MONO }} />
                    <Button
                      onClick={() => {
                        hostRunPromise(writeTextToClipboard(session.sessionId)).catch(() => undefined);
                      }}
                      size="small"
                      variant="text"
                    >
                      Copy
                    </Button>
                  </Stack>
                ) : null}

                <Stack spacing={0.75}>
                  <Typography color="text.secondary" variant="caption">
                    Usage
                  </Typography>
                  {session?.usage === undefined ? (
                    <Typography color="text.secondary" variant="body2">
                      None reported
                    </Typography>
                  ) : (
                    <UsageCard usage={session.usage} />
                  )}
                </Stack>

                <Stack spacing={0.75}>
                  <Typography color="text.secondary" variant="caption">
                    Models
                  </Typography>
                  <OptionChips
                    currentId={selectedModelId ?? sessionConfiguration.models.currentId}
                    options={sessionConfiguration.models.options}
                  />
                </Stack>

                <Stack spacing={0.75}>
                  <Typography color="text.secondary" variant="caption">
                    Modes
                  </Typography>
                  <OptionChips
                    currentId={selectedModeId ?? sessionConfiguration.modes.currentId}
                    options={sessionConfiguration.modes.options}
                  />
                </Stack>

                {sessionConfiguration.configOptions.length > 0 ? (
                  <Stack spacing={0.75}>
                    <Typography color="text.secondary" variant="caption">
                      Config options
                    </Typography>
                    <Stack spacing={1}>
                      {sessionConfiguration.configOptions.map(option => (
                        <ConfigOptionCard key={option.id} option={option} />
                      ))}
                    </Stack>
                  </Stack>
                ) : null}
              </Stack>
            ) : null}
          </Section>

          <Divider />

          <Section pending={availableCommands === undefined} title="Commands">
            {availableCommands !== undefined ? (
              availableCommands.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  None reported
                </Typography>
              ) : (
                <List dense disablePadding>
                  {availableCommands.map(command => (
                    <ListItem disableGutters key={command.name} sx={{ px: 0 }}>
                      <ListItemText
                        primary={command.name}
                        secondary={command.description}
                        slotProps={{
                          primary: { sx: { fontFamily: FONT_FAMILY_MONO, fontWeight: 600 } },
                          secondary: { sx: { color: 'text.secondary' } },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              )
            ) : null}
          </Section>
        </>
      ) : null}
    </Stack>
  );
};

/** Session State body for the Developer panel tab. */
export const SessionStateView: FC<{
  readonly session?: SessionSnapshot;
}> = ({ session }) => (
  <SessionStateContent
    availableCommands={session?.availableCommands}
    selectedModeId={session?.selectedModeId}
    selectedModelId={session?.selectedModelId}
    session={session}
    showSessionDetails={session?.status === 'active'}
  />
);
