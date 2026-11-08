// PROTOTYPE — throwaway. Floating `?variant=` switcher for UI prototypes. Do not merge to main.
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { FC } from 'react';

export const PrototypeSwitcher: FC<{
  readonly current: string;
  readonly variants: readonly { readonly key: string; readonly name: string }[];
}> = ({ current, variants }) => {
  const navigate = useNavigate();
  const index = Math.max(
    variants.findIndex(v => v.key === current),
    0,
  );
  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    if (next === undefined) return;
    navigate({ replace: true, search: { variant: next.key }, to: '/' }).catch(() => undefined);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) return null;
  const variant = variants[index];

  return (
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: '#ff0',
        borderRadius: 999,
        bottom: 16,
        boxShadow: 6,
        color: '#000',
        display: 'flex',
        fontFamily: 'monospace',
        fontSize: 13,
        gap: 1,
        left: '50%',
        position: 'fixed',
        px: 1,
        py: 0.5,
        transform: 'translateX(-50%)',
        zIndex: 99999,
      }}
    >
      <IconButton onClick={() => go(-1)} size="small" sx={{ color: 'inherit' }}>
        ←
      </IconButton>
      <span>
        PROTOTYPE {variant?.key} ({variant?.name})
      </span>
      <IconButton onClick={() => go(1)} size="small" sx={{ color: 'inherit' }}>
        →
      </IconButton>
    </Box>
  );
};
