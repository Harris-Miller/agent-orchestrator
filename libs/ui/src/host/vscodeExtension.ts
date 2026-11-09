/**
 * VS Code extension install state: how the Bundled VS Code extension compares with what the VS Code CLI reports
 * installed.
 */
import { VscodeExtension } from '@lib/context-services';
import type { BundledVscodeExtension } from '@lib/context-services';
import { Effect } from 'effect';

export type VscodeExtensionInstallState = 'newer-installed' | 'not-installed' | 'outdated' | 'up-to-date';

type Semver = { readonly core: readonly number[]; readonly pre: readonly string[] };

const parseSemver = (version: string): Semver | undefined => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(version.trim());
  return match === null
    ? undefined
    : { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4]?.split('.') ?? [] };
};

const compareIdentifier = (a: string, b: string): number => {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) {
    return Math.sign(Number(a) - Number(b));
  }
  if (aNumeric !== bNumeric) {
    return aNumeric ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
};

/** Negative when `a` is older than `b`. A prerelease sorts below its release. */
const compareSemver = (a: Semver, b: Semver): number => {
  for (const [index, part] of a.core.entries()) {
    const diff = part - (b.core[index] ?? 0);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }
  if (a.pre.length === 0 || b.pre.length === 0) {
    return a.pre.length === b.pre.length ? 0 : a.pre.length === 0 ? 1 : -1;
  }
  for (const [index, part] of a.pre.entries()) {
    const other = b.pre[index];
    if (other === undefined) {
      return 1;
    }
    const diff = compareIdentifier(part, other);
    if (diff !== 0) {
      return diff;
    }
  }
  return a.pre.length === b.pre.length ? 0 : -1;
};

/** An unparseable installed version counts as `outdated`; an unparseable bundled version never offers a downgrade. */
export const vscodeExtensionInstallState = (
  bundled: string,
  installed: string | undefined,
): VscodeExtensionInstallState => {
  if (installed === undefined) {
    return 'not-installed';
  }
  const bundledVersion = parseSemver(bundled);
  const installedVersion = parseSemver(installed);
  if (bundledVersion === undefined || installedVersion === undefined) {
    return installed === bundled ? 'up-to-date' : 'outdated';
  }
  const order = compareSemver(installedVersion, bundledVersion);
  return order === 0 ? 'up-to-date' : order < 0 ? 'outdated' : 'newer-installed';
};

/** The launch-time update dialog returns only for an outdated install whose bundled version was not skipped. */
export const shouldOfferExtensionUpdate = (
  state: VscodeExtensionInstallState,
  bundledVersion: string,
  skippedVersion: string | undefined,
): boolean => state === 'outdated' && skippedVersion !== bundledVersion;

/** What the VS Code extension row renders. `Hidden` also covers any host failure: the feature is best-effort. */
export type VscodeExtensionStatus =
  | { readonly _tag: 'Hidden' }
  /** VS Code is installed but no CLI works: show the `.vsix` path and "Install from VSIX..." steps. */
  | { readonly _tag: 'ManualInstall'; readonly bundled: BundledVscodeExtension }
  | {
      readonly _tag: 'Ready';
      readonly bundled: BundledVscodeExtension;
      readonly installed: string | undefined;
      readonly state: VscodeExtensionInstallState;
    };

const HIDDEN: VscodeExtensionStatus = { _tag: 'Hidden' };

/** Hidden unless the Host supports it, bundles the `.vsix` (not `tauri dev`) and finds VS Code. */
export const loadVscodeExtensionStatus: Effect.Effect<VscodeExtensionStatus, never, VscodeExtension> = Effect.gen(
  function* () {
    const extension = yield* VscodeExtension;
    if (!extension.supported) {
      return HIDDEN;
    }
    const bundled = yield* extension.bundled;
    if (bundled === undefined) {
      return HIDDEN;
    }
    const detection = yield* extension.detect;
    switch (detection._tag) {
      case 'NotFound':
        return HIDDEN;
      case 'AppOnly':
        return { _tag: 'ManualInstall', bundled } satisfies VscodeExtensionStatus;
      case 'Cli': {
        const installed = yield* extension.installedVersion;
        return {
          _tag: 'Ready',
          bundled,
          installed,
          state: vscodeExtensionInstallState(bundled.version, installed),
        } satisfies VscodeExtensionStatus;
      }
    }
  },
).pipe(
  Effect.catch(error =>
    Effect.logWarning('VS Code extension status unavailable', error.message).pipe(Effect.as(HIDDEN)),
  ),
);
