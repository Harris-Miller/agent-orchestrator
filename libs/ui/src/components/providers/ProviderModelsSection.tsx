/** Settings > Providers > Models: hide models from the pickers and set their order (Hidden model, Model order). */
import { DragDropProvider } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { GripVertical } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

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
  /** Whether this row is being dragged. */
  readonly dragging: boolean;
  /** Ref for the drag handle (dnd-kit); absent on rows that cannot be reordered. */
  readonly handleRef?: (element: Element | null) => void;
  readonly name: string;
  readonly off: boolean;
  readonly onToggle: (checked: boolean) => void;
  readonly reorderable: boolean;
  /** Ref for the row element (dnd-kit); absent on rows that cannot be reordered. */
  readonly rowRef?: (element: Element | null) => void;
  /** The raw model id, shown when it differs from the name. */
  readonly showId: string | undefined;
};

/** One model row: drag handle, name, id and visibility switch. Drag behaviour comes in through the refs. */
const ModelRow: FC<ModelRowProps> = ({ dragging, handleRef, name, off, onToggle, reorderable, rowRef, showId }) => (
  <Stack
    direction="row"
    ref={rowRef}
    sx={{
      '&:hover': { bgcolor: 'action.hover' },
      alignItems: 'center',
      bgcolor: dragging ? 'background.paper' : undefined,
      boxShadow: dragging ? 4 : undefined,
      gap: 1,
      opacity: off ? 0.5 : 1,
      pl: 0.5,
      position: 'relative',
      pr: 2,
      py: 0.5,
      zIndex: dragging ? 1 : undefined,
    }}
  >
    <Box
      aria-label={`Reorder ${name}`}
      ref={handleRef}
      role="button"
      sx={{ display: 'flex', touchAction: 'none', visibility: off ? 'hidden' : 'visible' }}
      tabIndex={reorderable ? 0 : -1}
    >
      <LucideMuiIcon
        icon={GripVertical}
        sx={{
          color: 'text.disabled',
          cursor: reorderable ? (dragging ? 'grabbing' : 'grab') : 'not-allowed',
          fontSize: 18,
        }}
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
    />
  </Stack>
);

type SortableModelRowProps = Pick<ModelRowProps, 'name' | 'onToggle' | 'showId'> & {
  readonly disabled: boolean;
  readonly id: string;
  /** Position among the shown rows. */
  readonly index: number;
};

/** A shown model row wired to dnd-kit: the grip is the only drag handle, and the keyboard sensor works on it. */
const SortableModelRow: FC<SortableModelRowProps> = ({ disabled, id, index, ...row }) => {
  const { handleRef, isDragging, ref } = useSortable({ disabled, id, index });
  return (
    <ModelRow {...row} dragging={isDragging} handleRef={handleRef} off={false} reorderable={!disabled} rowRef={ref} />
  );
};

/** The order to write after `fromId` was dropped on the shown row at `toIndex`; undefined when nothing moved. */
export const orderAfterDrop = (
  advertisedIds: readonly string[],
  order: readonly string[],
  shownIds: readonly string[],
  fromId: string,
  toIndex: number,
): readonly string[] | undefined => {
  const toId = shownIds[toIndex];
  return toId === undefined || toId === fromId ? undefined : reorderModels(advertisedIds, order, fromId, toId);
};

export const ProviderModelsSection: FC<{ readonly launchTarget: AgentLaunchTarget }> = ({ launchTarget }) => {
  const index = useAtomValue(configOptionIndexAtom(launchTarget));
  const prefs = useAtomValue(modelPickerPrefsAtom(launchTarget));
  const setPrefs = useAtomSet(setModelPickerPrefsAtom);
  const [filter, setFilter] = useState('');

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
        hidden: next.hidden ?? prefs.hidden,
        order: next.order ?? prefs.order,
      },
    });
  };
  const onToggle = (id: string) => (checked: boolean) => {
    write({ hidden: setModelHidden(prefs.hidden, id, !checked) });
  };
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const showIdOf = (id: string) => (nameOf(id) !== id ? id : undefined);

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
                write({ hidden: setAllModelsHidden(advertisedIds, prefs.hidden, !allHidden) });
              }}
              size="small"
            >
              {allHidden ? 'Enable all' : 'Disable all'}
            </Button>
          </Stack>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, maxHeight: 380, overflow: 'auto', pb: 1 }}>
            <DragDropProvider
              onDragEnd={event => {
                const { source } = event.operation;
                if (event.canceled || !isSortable(source)) {
                  return;
                }
                const next = orderAfterDrop(advertisedIds, prefs.order, shownIds, String(source.id), source.index);
                if (next !== undefined) {
                  write({ order: next });
                }
              }}
            >
              {shownIds.map((id, position) => (
                <SortableModelRow
                  disabled={filtering}
                  id={id}
                  index={position}
                  key={id}
                  name={nameOf(id)}
                  onToggle={onToggle(id)}
                  showId={showIdOf(id)}
                />
              ))}
            </DragDropProvider>
            {hiddenIds.length > 0 ? (
              <Typography color="text.secondary" sx={{ display: 'block', pb: 0.5, pt: 2, px: 2 }} variant="caption">
                Hidden from picker
              </Typography>
            ) : null}
            {hiddenIds.map(id => (
              <ModelRow
                dragging={false}
                key={id}
                name={nameOf(id)}
                off
                onToggle={onToggle(id)}
                reorderable={false}
                showId={showIdOf(id)}
              />
            ))}
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
