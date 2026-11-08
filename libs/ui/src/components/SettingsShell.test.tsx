// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsShell } from './SettingsShell.tsx';

vi.mock('./RestoreUserSettingsDefaultsControl.tsx', () => ({
  RestoreUserSettingsDefaultsControl: () => <button type="button">Restore defaults</button>,
}));
vi.mock('./UserSettingsLoadFailureAlert.tsx', () => ({
  UserSettingsLoadFailureAlert: () => null,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it('releases the modal when an open drawer crosses into the wide layout', async () => {
    const media = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(window, 'matchMedia').mockImplementation(() => media as MediaQueryList);
    const { container } = render(
      <SettingsShell category="general" onBack={vi.fn()} onSelectCategory={vi.fn()}>
        Content
      </SettingsShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings categories', hidden: true }));
    expect(container.getAttribute('aria-hidden')).toBe('true');
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event('change'));
    });
    await vi.waitFor(() => {
      expect(container.getAttribute('aria-hidden')).toBeNull();
      expect(document.body.style.overflow).not.toBe('hidden');
    });
    act(() => {
      media.matches = false;
      media.dispatchEvent(new Event('change'));
    });
    expect(container.getAttribute('aria-hidden')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to app' })).toBeDefined();
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
