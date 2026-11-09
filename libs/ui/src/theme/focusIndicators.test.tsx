// @vitest-environment happy-dom
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Radio from '@mui/material/Radio';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { themes } from './themes.ts';

afterEach(cleanup);

describe('keyboard focus indicators', () => {
  for (const [name, theme] of Object.entries(themes)) {
    it(`keeps visible rings on controls in ${name}`, () => {
      const { container } = render(
        <ThemeProvider theme={theme}>
          <Checkbox className="Mui-focusVisible" />
          <Checkbox checked className="Mui-focusVisible" />
          <Checkbox indeterminate className="Mui-focusVisible" />
          <Radio className="Mui-focusVisible" />
          <Radio checked className="Mui-focusVisible" />
          <MenuList>
            <MenuItem className="Mui-focusVisible">Option</MenuItem>
            <MenuItem selected className="Mui-focusVisible">
              Selected option
            </MenuItem>
          </MenuList>
        </ThemeProvider>,
      );
      const controls = container.querySelectorAll('.MuiCheckbox-root, .MuiRadio-root');
      expect(controls).toHaveLength(5);
      for (const control of controls) {
        const glyph = control.querySelector('svg');
        expect(glyph).not.toBeNull();
        expect(getComputedStyle(glyph!).boxShadow).toContain('0 0 0 3px');
      }
      for (const item of container.querySelectorAll('.MuiMenuItem-root')) {
        expect(getComputedStyle(item).boxShadow).toContain('0 0 0 3px');
      }
    });
  }
});
