/**
 * PROTOTYPE — floating variant bar. Hidden in production builds.
 * Shared by throwaway UI prototypes that use `?variant=` search params.
 */
import { LucideMuiIcon } from '@lib/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import type { FC } from 'react';

export type PrototypeVariantMeta = {
  readonly key: string;
  readonly name: string;
};

export const PrototypeSwitcher: FC<{
  readonly current: string;
  readonly variants: readonly PrototypeVariantMeta[];
}> = ({ current, variants }) => {
  const navigate = useNavigate({ from: '/' });

  const index = Math.max(
    0,
    variants.findIndex(v => v.key === current),
  );
  const label = variants[index] ?? { key: current, name: current };

  const go = useCallback(
    (nextIndex: number) => {
      if (variants.length === 0) {
        return;
      }
      const next = variants[(nextIndex + variants.length) % variants.length];
      navigate({
        replace: true,
        search: { variant: next.key as 'A' | 'B' | 'C' },
      }).catch(() => undefined);
    },
    [navigate, variants],
  );

  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      const { target } = event;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(index + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [go, index]);

  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: 'warning.main',
        borderRadius: 999,
        bottom: 24,
        boxShadow: 6,
        color: 'warning.contrastText',
        display: 'flex',
        gap: 0.5,
        left: '50%',
        position: 'fixed',
        px: 1,
        py: 0.5,
        transform: 'translateX(-50%)',
        zIndex: theme => theme.zIndex.tooltip + 1,
      }}
    >
      <IconButton
        aria-label="Previous prototype variant"
        color="inherit"
        onClick={() => {
          go(index - 1);
        }}
        size="small"
      >
        <LucideMuiIcon icon={ChevronLeft} />
      </IconButton>
      <Typography sx={{ fontWeight: 700, minWidth: 220, textAlign: 'center' }} variant="body2">
        {label.key} · {label.name}
      </Typography>
      <IconButton
        aria-label="Next prototype variant"
        color="inherit"
        onClick={() => {
          go(index + 1);
        }}
        size="small"
      >
        <LucideMuiIcon icon={ChevronRight} />
      </IconButton>
    </Box>
  );
};
