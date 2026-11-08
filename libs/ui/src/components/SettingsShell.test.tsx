// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsShell } from './SettingsShell.tsx';

vi.mock('./RestoreUserSettingsDefaultsControl.tsx', () => ({
  RestoreUserSettingsDefaultsControl: () => <button type="button">Restore defaults</button>,
}));
vi.mock('./UserSettingsLoadFailureAlert.tsx', () => ({
  UserSettingsLoadFailureAlert: () => null,
}));

afterEach(cleanup);

describe('SettingsShell', () => {
  it('marks the current category and filters navigation', () => {
    render(
      <SettingsShell category="general" onBack={vi.fn()} onSelectCategory={vi.fn()}>
        Content
      </SettingsShell>,
    );
    expect(screen.getByRole('button', { name: 'General' }).getAttribute('aria-current')).toBe('page');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'appear' } });
    expect(screen.queryByRole('button', { name: 'General' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeDefined();
  });

  it('selects a category from the temporary drawer and returns to the app', () => {
    const select = vi.fn();
    const back = vi.fn();
    render(
      <SettingsShell category="general" onBack={back} onSelectCategory={select}>
        Content
      </SettingsShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to app' }));
    expect(back).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Settings categories', hidden: true }));
    const drawer = screen.getAllByRole('navigation', { name: 'Settings categories', hidden: true }).at(-1)!;
    fireEvent.click(within(drawer).getByRole('button', { name: 'Appearance', hidden: true }));
    expect(select).toHaveBeenCalledWith('appearance');
    expect(select).toHaveBeenCalledOnce();
  });
});
