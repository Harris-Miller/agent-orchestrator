import { assert, describe, it } from '@effect/vitest';
import { VscodeExtension, VscodeExtensionFailed } from '@lib/context-services';
import type { VscodeDetection } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import {
  loadVscodeExtensionStatus,
  shouldOfferExtensionUpdate,
  vscodeExtensionInstallState,
} from './vscodeExtension.ts';

describe('vscodeExtensionInstallState', () => {
  it('is not-installed when nothing is installed', () => {
    assert.strictEqual(vscodeExtensionInstallState('0.1.0', undefined), 'not-installed');
  });

  it('compares numerically, not lexically', () => {
    assert.strictEqual(vscodeExtensionInstallState('0.1.0', '0.1.0'), 'up-to-date');
    assert.strictEqual(vscodeExtensionInstallState('0.10.0', '0.9.0'), 'outdated');
    assert.strictEqual(vscodeExtensionInstallState('0.9.0', '0.10.0'), 'newer-installed');
    assert.strictEqual(vscodeExtensionInstallState('1.0.0', '0.99.99'), 'outdated');
  });

  it('orders a prerelease below its release', () => {
    assert.strictEqual(vscodeExtensionInstallState('0.1.0', '0.1.0-alpha.1'), 'outdated');
    assert.strictEqual(vscodeExtensionInstallState('0.1.0-alpha.1', '0.1.0'), 'newer-installed');
    assert.strictEqual(vscodeExtensionInstallState('0.1.0-alpha.2', '0.1.0-alpha.10'), 'newer-installed');
  });

  it('treats an unparseable installed version as outdated, never a downgrade', () => {
    assert.strictEqual(vscodeExtensionInstallState('0.1.0', 'garbage'), 'outdated');
  });
});

describe('shouldOfferExtensionUpdate', () => {
  it('offers only outdated, and not for the skipped bundled version', () => {
    assert.isTrue(shouldOfferExtensionUpdate('outdated', '0.2.0', undefined));
    assert.isTrue(shouldOfferExtensionUpdate('outdated', '0.2.0', '0.1.0'));
    assert.isFalse(shouldOfferExtensionUpdate('outdated', '0.2.0', '0.2.0'));
    assert.isFalse(shouldOfferExtensionUpdate('up-to-date', '0.2.0', undefined));
    assert.isFalse(shouldOfferExtensionUpdate('not-installed', '0.2.0', undefined));
    assert.isFalse(shouldOfferExtensionUpdate('newer-installed', '0.2.0', undefined));
  });
});

const bundled = { path: '/resources/hoa-vscode.vsix', version: '0.2.0' };

const hostWith = (overrides: Partial<VscodeExtension>) =>
  Layer.succeed(VscodeExtension, {
    bundled: Effect.succeed(bundled),
    detect: Effect.succeed<VscodeDetection>({ _tag: 'Cli', path: '/usr/bin/code' }),
    installBundled: Effect.void,
    installedVersion: Effect.succeed('0.1.0'),
    supported: true,
    ...overrides,
  });

describe('loadVscodeExtensionStatus', () => {
  const load = (overrides: Partial<VscodeExtension>) =>
    loadVscodeExtensionStatus.pipe(Effect.provide(hostWith(overrides)));

  it.effect('is ready with the install state when VS Code has a CLI', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* load({}), { _tag: 'Ready', bundled, installed: '0.1.0', state: 'outdated' });
      assert.deepStrictEqual(yield* load({ installedVersion: Effect.succeed(undefined) }), {
        _tag: 'Ready',
        bundled,
        installed: undefined,
        state: 'not-installed',
      });
    }),
  );

  it.effect('offers manual steps when VS Code has no CLI', () =>
    Effect.gen(function* () {
      const detect: Effect.Effect<VscodeDetection> = Effect.succeed({ _tag: 'AppOnly' });
      assert.deepStrictEqual(yield* load({ detect }), { _tag: 'ManualInstall', bundled });
    }),
  );

  it.effect('is hidden when unsupported, not bundled, not detected, or the host fails', () =>
    Effect.gen(function* () {
      const failure = Effect.fail(new VscodeExtensionFailed({ message: 'boom' }));
      for (const overrides of [
        { supported: false },
        { bundled: Effect.succeed(undefined) },
        { detect: Effect.succeed<VscodeDetection>({ _tag: 'NotFound' }) },
        { installedVersion: failure },
      ]) {
        assert.deepStrictEqual(yield* load(overrides), { _tag: 'Hidden' });
      }
    }),
  );
});
