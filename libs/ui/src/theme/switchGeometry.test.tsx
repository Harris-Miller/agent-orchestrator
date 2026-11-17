// @vitest-environment happy-dom
import Switch from '@mui/material/Switch';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { themes } from './themes.ts';

afterEach(cleanup);

describe('Switch geometry', () => {
  for (const [name, theme] of Object.entries(themes)) {
    it(`is identical for small and medium in ${name}`, () => {
      const { container } = render(
        <ThemeProvider theme={theme}>
          <Switch checked size="small" />
          <Switch checked size="medium" />
        </ThemeProvider>,
      );
      const roots = container.querySelectorAll('.MuiSwitch-root');
      expect(roots).toHaveLength(2);
      for (const root of roots) {
        const base = root.querySelector('.MuiSwitch-switchBase')!;
        const thumb = root.querySelector('.MuiSwitch-thumb')!;
        expect(getComputedStyle(root).width).toBe('34px');
        expect(getComputedStyle(root).height).toBe('20px');
        expect(getComputedStyle(root).padding).toBe('0px');
        expect(getComputedStyle(base).padding).toBe('2px');
        expect(getComputedStyle(base).transform).toBe('translateX(14px)');
        expect(getComputedStyle(thumb).width).toBe('16px');
        expect(getComputedStyle(thumb).height).toBe('16px');
      }
    });
  }
});
