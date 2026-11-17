/** Settings > Providers > Models: hide models from the pickers and set their order (Hidden model, Model order). */
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { GripVertical } from 'lucide-react';
import { useState } from 'react';
import type { FC, KeyboardEvent } from 'react';

import { modelPickerPrefsAtom, setModelPickerPrefsAtom } from '../../atoms/boundHarnessAtoms.ts';
import { configOptionIndexAtom } from '../../atoms/backendState.atoms.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { advertisedModelChoices } from '../../host/configOptionIndexUi.ts';
import {
  orderedModelIds,
  pruneHidden,
  reorderModels,
  setAllModelsHidden,
  setModelHidden,
} from '../../host/modelPickerPrefs.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';
import { SettingsGroup as Group, SettingsSectionTitle as SectionTitle } from '../SettingsSection.tsx';

const FILTER_THRESHOLD = 8;

type ModelRowProps = {
  readonly dragging: boolean;
  readonly name: string;
  readonly off: boolean;
  readonly onDragEnd: () => void;
  /** Returns true when the row accepts the drop (so the browser allows it). */
  readonly onDragOver: () => boolean;
  readonly onDragStart: () => void;
  readonly onDrop: () => void;
  readonly onHandleKeyDown: (event: KeyboardEvent) => void;
  readonly onToggle: (checked: boolean) => void;
  readonly reorderable: boolean;
  /** The raw model id, shown when it differs from the name. */
  readonly showId: string | undefined;
  /** Whether a drag is hovering over this row. */
  readonly target: boolean;
};

/** One model row: drag handle (drag starts from the handle only), name, id and visibility switch. */
const ModelRow: FC<ModelRowProps> = ({
  dragging,
  name,
  off,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onHandleKeyDown,
  onToggle,
  reorderable,
  showId,
  target,
}) => {
  const [armed, setArmed] = useState(false);
  return (
    <Stack
      direction="row"
      draggable={reorderable && armed}
      onDragEnd={() => {
        setArmed(false);
        onDragEnd();
      }}
      onDragOver={event => {
        if (onDragOver()) {
          event.preventDefault();
        }
      }}
      onDragStart={onDragStart}
      onDrop={onDrop}
      sx={{
        '&:hover': { bgcolor: 'action.hover' },
        alignItems: 'center',
        borderTop: 2,
        borderTopColor: target ? 'primary.main' : 'transparent',
        gap: 1,
        opacity: off || dragging ? 0.5 : 1,
        pl: 0.5,
        pr: 2,
        py: 0.5,
      }}
    >
      <Box
        aria-label={`Reorder ${name}`}
        onKeyDown={onHandleKeyDown}
        onMouseDown={() => {
          setArmed(true);
        }}
        onMouseUp={() => {
          setArmed(false);
        }}
        role="button"
        sx={{ display: 'flex', visibility: off ? 'hidden' : 'visible' }}
        tabIndex={reorderable ? 0 : -1}
      >
        <LucideMuiIcon
          icon={GripVertical}
          sx={{ color: 'text.disabled', cursor: reorderable ? 'grab' : 'not-allowed', fontSize: 18 }}
        />
      </Box>
      <Typography noWrap sx={{ fontSize: 13 }}>
        {name}
      </Typography>
      {showId === undefined ? null : (
        <Typography noWrap sx={{ color: 'text.disabled', fontFamily: FONT_FAMILY_MONO, fontSize: 11 }}>
          {showId}
        </Typography>
      )}
      <Box sx={{ flex: 1 }} />
      <Switch
        checked={!off}
        onChange={(_event, checked) => {
          onToggle(checked);
        }}
        slotProps={{ input: { 'aria-label': `Show ${name}` } }}
        size="small"
      />
    </Stack>
  );
};

export const ProviderModelsSection: FC<{ readonly launchTarget: AgentLaunchTarget }> = ({ launchTarget }) => {
  const index = useAtomValue(configOptionIndexAtom(launchTarget));
  const prefs = useAtomValue(modelPickerPrefsAtom(launchTarget));
  const setPrefs = useAtomSet(setModelPickerPrefsAtom);
  const [filter, setFilter] = useState('');
  const [dragId, setDragId] = useState<string | undefined>();
  const [overId, setOverId] = useState<string | undefined>();

  const choices = advertisedModelChoices(index);
  const advertisedIds = choices.map(choice => choice.id);
  const byId = new Map(choices.map(choice => [choice.id, choice]));
  const ordered = orderedModelIds(advertisedIds, prefs.order);
  const hidden = new Set(pruneHidden(advertisedIds, prefs.hidden));
  const needle = filter.trim().toLowerCase();
  const filtering = choices.length > FILTER_THRESHOLD && needle.length > 0;
  const matches = (id: string) =>
    !filtering || id.toLowerCase().includes(needle) || (byId.get(id)?.name ?? '').toLowerCase().includes(needle);
  const shownIds = ordered.filter(id => !hidden.has(id) && matches(id));
  const hiddenIds = ordered.filter(id => hidden.has(id) && matches(id));
  const allHidden = hidden.size === choices.length;

  const write = (next: { readonly hidden?: readonly string[]; readonly order?: readonly string[] }) => {
    setPrefs({
      launchTarget,
      prefs: {
        hidden: pruneHidden(advertisedIds, next.hidden ?? prefs.hidden),
        order: next.order ?? prefs.order.filter(id => advertisedIds.includes(id)),
      },
    });
  };
  const move = (fromId: string, toId: string) => {
    write({ order: reorderModels(advertisedIds, prefs.order, fromId, toId) });
  };

  const onHandleKeyDown = (event: KeyboardEvent, id: string) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
      return;
    }
    event.preventDefault();
    const at = shownIds.indexOf(id);
    const target = shownIds[event.key === 'ArrowUp' ? at - 1 : at + 1];
    if (target !== undefined) {
      move(id, target);
    }
  };

  const row = (id: string, off: boolean) => {
    const name = byId.get(id)?.name ?? id;
    return (
      <ModelRow
        dragging={dragId === id}
        key={id}
        name={name}
        off={off}
        onDragEnd={() => {
          setDragId(undefined);
          setOverId(undefined);
        }}
        onDragOver={() => {
          if (dragId !== undefined && !off) {
            setOverId(id);
            return true;
          }
          return false;
        }}
        onDragStart={() => {
          setDragId(id);
        }}
        onDrop={() => {
          if (dragId !== undefined && dragId !== id) {
            move(dragId, id);
          }
          setDragId(undefined);
          setOverId(undefined);
        }}
        onHandleKeyDown={event => {
          onHandleKeyDown(event, id);
        }}
        onToggle={checked => {
          write({ hidden: setModelHidden(advertisedIds, prefs.hidden, id, !checked) });
        }}
        reorderable={!off && !filtering}
        showId={name !== id ? id : undefined}
        target={overId === id && dragId !== id}
      />
    );
  };

  return (
    <>
      <SectionTitle>Models</SectionTitle>
      {choices.length === 0 ? (
        <Group>
          <Box sx={{ px: 2.5, py: 2 }}>
            <Typography color="text.secondary" variant="body2">
              Models appear after this provider first connects.
            </Typography>
          </Box>
        </Group>
      ) : (
        <Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2, mb: 1, px: 0.5 }}>
            {choices.length > FILTER_THRESHOLD ? (
              <TextField
                onChange={event => {
                  setFilter(event.target.value);
                }}
                placeholder="Filter models"
                size="small"
                slotProps={{ htmlInput: { 'aria-label': 'Filter models' } }}
                sx={{ width: 200 }}
                value={filter}
              />
            ) : null}
            <Typography color="text.secondary" variant="body2">
              {choices.length} models · {hidden.size} hidden
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button
              disabled={prefs.order.length === 0}
              onClick={() => {
                write({ order: [] });
              }}
              size="small"
            >
              Reset order
            </Button>
            <Button
              onClick={() => {
                write({ hidden: setAllModelsHidden(advertisedIds, !allHidden) });
              }}
              size="small"
            >
              {allHidden ? 'Enable all' : 'Disable all'}
            </Button>
          </Stack>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, maxHeight: 380, overflow: 'auto', pb: 1 }}>
            {shownIds.map(id => row(id, false))}
            {hiddenIds.length > 0 ? (
              <Typography color="text.secondary" sx={{ display: 'block', pb: 0.5, pt: 2, px: 2 }} variant="caption">
                Hidden from picker
              </Typography>
            ) : null}
            {hiddenIds.map(id => row(id, true))}
          </Box>
          {filtering ? (
            <Typography color="text.secondary" sx={{ mt: 0.5, px: 0.5 }} variant="caption">
              Clear the filter to reorder.
            </Typography>
          ) : null}
        </Box>
      )}
    </>
  );
};
