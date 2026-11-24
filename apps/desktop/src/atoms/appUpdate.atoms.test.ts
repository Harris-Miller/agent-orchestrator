import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';
import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }));

vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
// The @lib/ui barrel needs a bound host runtime; only the pure view helpers are used here.
vi.mock('@lib/ui', () => import('../../../../libs/ui/src/host/updatesView.ts'));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));

const { appUpdateAtom, checkAppUpdate, downloadAppUpdate, retryAppUpdate } = await import('./appUpdate.atoms.ts');

const fakeUpdate = (download: () => Promise<void> = () => Promise.resolve()) => ({
  download,
  install: () => Promise.resolve(),
  version: '2.0.0',
});

describe('appUpdate atoms', () => {
  it('does not clobber a Download that started while a check was in flight', async () => {
    vi.stubEnv('PROD', true);
    const registry = AtomRegistry.make();
    registry.set(appUpdateAtom, { _tag: 'Available', version: '1.5.0' });
    let resolveCheck: (u: unknown) => void = () => undefined;
    mocks.check.mockReturnValueOnce(
      new Promise(resolve => {
        resolveCheck = resolve;
      }),
    );
    const inFlight = checkAppUpdate(registry);
    registry.set(appUpdateAtom, { _tag: 'Downloading', version: '1.5.0' });
    resolveCheck(fakeUpdate());
    await inFlight;
    assert.deepStrictEqual(registry.get(appUpdateAtom), { _tag: 'Downloading', version: '1.5.0' });
    vi.unstubAllEnvs();
  });

  it('retry re-runs check then download after a failure', async () => {
    vi.stubEnv('PROD', true);
    const registry = AtomRegistry.make();
    registry.set(appUpdateAtom, { _tag: 'Failed', message: 'x' });
    mocks.check.mockResolvedValueOnce(fakeUpdate());
    await retryAppUpdate(registry);
    assert.deepStrictEqual(registry.get(appUpdateAtom), { _tag: 'Ready', version: '2.0.0' });
    vi.unstubAllEnvs();
  });

  it('a failed download lands in Failed', async () => {
    vi.stubEnv('PROD', true);
    const registry = AtomRegistry.make();
    mocks.check.mockResolvedValueOnce(fakeUpdate(() => Promise.reject(new Error('nope'))));
    await checkAppUpdate(registry);
    await downloadAppUpdate(registry);
    assert.deepStrictEqual(registry.get(appUpdateAtom), { _tag: 'Failed', message: 'nope' });
    vi.unstubAllEnvs();
  });
});
