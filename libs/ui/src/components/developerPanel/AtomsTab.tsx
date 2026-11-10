import { RegistryContext } from '@effect/atom-react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useContext, useEffect, useState } from 'react';
import type { FC } from 'react';

import { listAtoms } from '../../atoms/atomInspector.ts';
import type { AtomNameOf } from '../../atoms/atomInspector.ts';
import { toJsonSafe } from '../../atoms/atomValue.ts';
import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';

import { atomValuePreview, AtomValueView } from './AtomValueView.tsx';

const POLL_MS = 500;

/** Current value of every Atom in the registry, polled while mounted (never subscribes, so it keeps no Atom alive). */
export const AtomsTab: FC<{
  readonly nameOf?: AtomNameOf;
  readonly onCopyError: (error: unknown) => void;
}> = ({ nameOf, onCopyError }) => {
  const registry = useContext(RegistryContext);
  const [entries, setEntries] = useState(() => listAtoms(registry, nameOf));
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const id = setInterval(() => {
      setEntries(listAtoms(registry, nameOf));
    }, POLL_MS);
    return () => {
      clearInterval(id);
    };
  }, [nameOf, registry]);

  const needle = filter.trim().toLowerCase();
  const shown = needle === '' ? entries : entries.filter(entry => entry.label.toLowerCase().includes(needle));

  return (
    <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }} useFlexGap>
        <TextField
          onChange={event => {
            setFilter(event.target.value);
          }}
          placeholder="Filter atoms"
          size="small"
          slotProps={{ htmlInput: { 'aria-label': 'Filter atoms' } }}
          value={filter}
        />
        <Typography color="text.secondary" variant="caption">
          {shown.length} / {entries.length} shown
        </Typography>
      </Stack>
      <Stack spacing={1} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {shown.map(entry => {
          const isOpen = expanded.has(entry.label);
          const preview = entry.computed ? atomValuePreview(entry.value) : undefined;
          return (
            <Accordion
              expanded={isOpen}
              key={entry.label}
              onChange={(_event, open) => {
                setExpanded(current => {
                  const nextExpanded = new Set(current);
                  if (open) {
                    nextExpanded.add(entry.label);
                  } else {
                    nextExpanded.delete(entry.label);
                  }
                  return nextExpanded;
                });
              }}
              slotProps={{ transition: { unmountOnExit: true } }}
              sx={{ bgcolor: 'action.hover', borderRadius: 1 }}
            >
              <AccordionSummary>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }} useFlexGap>
                  <Typography
                    component="span"
                    sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }}
                    variant="body2"
                  >
                    {entry.label}
                  </Typography>
                  <Chip label={entry.kind} size="small" variant="outlined" />
                  {preview === undefined ? null : (
                    <Typography
                      color="text.secondary"
                      component="span"
                      noWrap
                      sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }}
                      variant="body2"
                    >
                      {preview}
                    </Typography>
                  )}
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {entry.computed ? (
                  <Stack spacing={1}>
                    <AtomValueView value={entry.value} />
                    <Button
                      onClick={() => {
                        hostRunPromise(writeTextToClipboard(JSON.stringify(toJsonSafe(entry.value), null, 2))).catch(
                          onCopyError,
                        );
                      }}
                      size="small"
                      sx={{ alignSelf: 'flex-start' }}
                      variant="text"
                    >
                      copy JSON
                    </Button>
                  </Stack>
                ) : (
                  <Typography color="text.secondary" variant="body2">
                    Not computed yet.
                  </Typography>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    </Stack>
  );
};
