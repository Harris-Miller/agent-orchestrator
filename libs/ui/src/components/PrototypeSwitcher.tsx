/** PROTOTYPE tooling — floating variant switcher (dev builds only). Throwaway with whatever prototype mounts it. */
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { LucideMuiIcon } from './LucideMuiIcon.tsx';

export const IS_DEV_BUILD = (import.meta as unknown as { readonly env?: { readonly DEV?: boolean } }).env?.DEV === true;

const readParam = (name: string): string | null => new URLSearchParams(window.location.search).get(name);

/** `?name=` search param mirrored into state; writes via `history.replaceState` (keeps router state intact). */
export const useUrlSearchParam = (name: string, fallback: string): readonly [string, (value: string) => void] => {
  const [value, setValue] = useState(() => readParam(name) ?? fallback);
  const set = useCallback(
    (next: string) => {
      setValue(next);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set(name, next);
        window.history.replaceState(window.history.state, '', url);
      } catch {
        // VS Code webview URLs may reject replaceState; state still updates.
      }
    },
    [name],
  );
  return [value, set] as const;
};

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable);

export type PrototypeVariantEntry = { readonly key: string; readonly name: string };

export const PrototypeSwitcher: FC<{
  readonly current: string;
  /** Extra prototype-only controls (scenario picker, modal previews, …). */
  readonly extras?: ReactNode;
  readonly onChange: (key: string) => void;
  readonly variants: readonly PrototypeVariantEntry[];
}> = ({ current, extras, onChange, variants }) => {
  const index = Math.max(
    0,
    variants.findIndex(v => v.key === current),
  );
  const step = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length];
      onChange(next.key);
    },
    [index, onChange, variants],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        step(-1);
      } else if (event.key === 'ArrowRight') {
        step(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [step]);

  if (!IS_DEV_BUILD) {
    return null;
  }

  const entry = variants[index];
  return (
    <Paper
      elevation={12}
      sx={{
        alignItems: 'center',
        bgcolor: 'common.black',
        border: '1px solid',
        borderColor: 'warning.main',
        borderRadius: 999,
        bottom: 16,
        color: 'common.white',
        display: 'flex',
        gap: 0.5,
        left: '50%',
        position: 'fixed',
        px: 1,
        py: 0.5,
        transform: 'translateX(-50%)',
        zIndex: theme => theme.zIndex.modal + 10,
      }}
    >
      <IconButton
        aria-label="Previous variant"
        onClick={() => {
          step(-1);
        }}
        size="small"
        sx={{ color: 'inherit' }}
      >
        <LucideMuiIcon icon={ChevronLeft} />
      </IconButton>
      <Box sx={{ minWidth: 180, textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 700 }} variant="body2">
          {entry.key} · {entry.name}
        </Typography>
      </Box>
      <IconButton
        aria-label="Next variant"
        onClick={() => {
          step(1);
        }}
        size="small"
        sx={{ color: 'inherit' }}
      >
        <LucideMuiIcon icon={ChevronRight} />
      </IconButton>
      {extras !== undefined ? (
        <>
          <Divider flexItem orientation="vertical" sx={{ borderColor: 'grey.700', mx: 0.5 }} />
          {extras}
        </>
      ) : null}
    </Paper>
  );
};
