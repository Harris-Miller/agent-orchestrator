// @vitest-environment happy-dom
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { theme } from '../theme/themes.ts';
import { ImageLightbox } from './ImageLightbox.tsx';

afterEach(cleanup);

describe('ImageLightbox', () => {
  it('shows one image with zoom controls and a single Close action', () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <ImageLightbox name="pic" onClose={onClose} open src="data:image/png;base64,AAAA" />
      </ThemeProvider>,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toBeDefined();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
