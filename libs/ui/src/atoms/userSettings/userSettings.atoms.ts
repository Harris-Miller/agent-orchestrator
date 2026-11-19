/** User settings write-through Atom backed by `@lib/hoa-home`. */
import { normalizeAlwaysHiddenGlobs, readUserSettings, writeUserSettings } from '@lib/hoa-home';
import type { UserSettings } from '@lib/hoa-home';
import { Effect, Exit } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import type { ModelPickerPrefs } from '../../host/modelPickerPrefs.ts';
import type { HostRuntimeBag } from '../../createHostRuntime.ts';
import type { ThemeId } from '../../theme/themeId.ts';
import { clampThemeId, readPaintThemeId, writePaintThemeId } from '../../theme/themePaintCache.ts';

import {
  appOrchestratedAgentsEnabled,
  appOrchestratedAgentsEnabledAtom,
  chatWidthModeAtom,
  midTurnSendModeAtom,
  showArchivedAtom,
  showArchivedEnabled,
  unwrapUserSettings,
  userSettingsDocumentAtom,
  withModelPickerPrefs,
} from './userSettingsDocument.atoms.ts';
import type { ChatWidth, MidTurnSend } from './userSettingsDocument.atoms.ts';

export { appOrchestratedAgentsEnabled, showArchivedEnabled, unwrapUserSettings };
export type { ChatWidth, MidTurnSend };

type AtomRuntime = HostRuntimeBag['atomRuntime'];

/** Disable Settings edits only while load is Initial or waiting. */
export const userSettingsEditsDisabled = <E>(result: AsyncResult.AsyncResult<UserSettings, E>): boolean =>
  AsyncResult.isInitial(result) || result.waiting;

/** Prefer confirming session delete when the Settings field is unset. */
export const confirmSessionDeleteEnabled = (settings: UserSettings): boolean => settings.confirmSessionDelete !== false;

/** Developer mode is off when the Settings field is unset. */
export const developerModeEnabled = (settings: UserSettings): boolean => settings.developerModeEnabled === true;

/** Notifications are on when the Settings field is unset. */
export const notificationsEnabled = (settings: UserSettings): boolean => settings.notificationsEnabled !== false;

/** Keep awake is on when the Settings field is unset. */
export const keepAwakeEnabled = (settings: UserSettings): boolean => settings.keepAwakeEnabled !== false;

/** Match VS Code theme is on when the Settings field is unset. */
export const matchVscodeThemeEnabled = (settings: UserSettings): boolean => settings.matchVscodeTheme !== false;

/** Notification sound is on when the Settings field is unset. */
export const notificationSoundEnabled = (settings: UserSettings): boolean =>
  settings.notificationSoundEnabled !== false;

/** Only notify while the Host window is unfocused when the Settings field is unset. */
export const notifyOnlyWhenUnfocusedEnabled = (settings: UserSettings): boolean =>
  settings.notifyOnlyWhenUnfocused !== false;

export const createUserSettingsAtoms = (runtime: AtomRuntime) => {
  const loadUserSettingsAtom = runtime.atom(() => readUserSettings()).pipe(Atom.keepAlive);

  /** Subscribe for persist Failure (toast / tests). Not the app write API. */
  const persistUserSettingsAtomFn = runtime
    .fn((userSettings: UserSettings) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(writeUserSettings(userSettings));
        if (Exit.isFailure(exit)) {
          yield* Effect.logError('Failed to persist User settings', exit.cause);
          return yield* Effect.failCause(exit.cause);
        }
      }),
    )
    .pipe(Atom.keepAlive);

  /** Copies each disk read into the User settings document; never depends on the document, so writes stick. */
  const loadIntoDocumentAtom = Atom.make(get => {
    get.set(userSettingsDocumentAtom, get(loadUserSettingsAtom));
  }).pipe(Atom.keepAlive);

  /** View over the User settings document: mounting loads it, writes persist it, refresh re-reads disk. */
  const userSettingsAtom = Atom.writable(
    get => {
      get.mount(persistUserSettingsAtomFn);
      get.mount(loadIntoDocumentAtom);
      return get(userSettingsDocumentAtom);
    },
    (ctx, next: UserSettings) => {
      ctx.set(userSettingsDocumentAtom, AsyncResult.success(next));
      ctx.set(persistUserSettingsAtomFn, next);
    },
    refresh => {
      refresh(loadUserSettingsAtom);
    },
  ).pipe(Atom.keepAlive);

  /** Effective confirm-before-delete preference (on when unset). Write patches User settings. */
  const confirmSessionDeleteAtom = Atom.writable(
    get => confirmSessionDeleteEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), confirmSessionDelete: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Effective Developer mode preference (off when unset). Write patches User settings. */
  const developerModeAtom = Atom.writable(
    get => developerModeEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), developerModeEnabled: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Effective Experimental: App Orchestrated Agents (off when unset). Write patches User settings. */
  const appOrchestratedAgentsAtom = Atom.writable(
    get => get(appOrchestratedAgentsEnabledAtom),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, {
        ...unwrapUserSettings(ctx.get(userSettingsAtom)),
        appOrchestratedAgentsEnabled: enabled,
      });
    },
  ).pipe(Atom.keepAlive);

  /** Effective Show archived (off when unset). Write patches User settings. */
  const showArchivedSettingAtom = Atom.writable(
    get => get(showArchivedAtom),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), showArchived: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Effective Chat width (Comfortable when unset). Write patches User settings. */
  const chatWidthAtom = Atom.writable(
    get => get(chatWidthModeAtom),
    (ctx, width: ChatWidth) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), chatWidth: width });
    },
  ).pipe(Atom.keepAlive);

  /** Effective mid-turn send (Steer when unset). Write patches User settings. */
  const midTurnSendAtom = Atom.writable(
    get => get(midTurnSendModeAtom),
    (ctx, mode: MidTurnSend) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), midTurnSend: mode });
    },
  ).pipe(Atom.keepAlive);

  /** Effective Notifications preference (on when unset). Write patches User settings. */
  const notificationsEnabledAtom = Atom.writable(
    get => notificationsEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), notificationsEnabled: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Effective Keep awake preference (on when unset). Write patches User settings. */
  const keepAwakeEnabledAtom = Atom.writable(
    get => keepAwakeEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), keepAwakeEnabled: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Effective Match VS Code theme preference (on when unset). Write patches User settings. */
  const matchVscodeThemeAtom = Atom.writable(
    get => matchVscodeThemeEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), matchVscodeTheme: enabled });
    },
  ).pipe(Atom.keepAlive);

  /** Effective Notification sound preference (on when unset). Write patches User settings. */
  const notificationSoundEnabledAtom = Atom.writable(
    get => notificationSoundEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, {
        ...unwrapUserSettings(ctx.get(userSettingsAtom)),
        notificationSoundEnabled: enabled,
      });
    },
  ).pipe(Atom.keepAlive);

  /** Effective only-when-unfocused preference (on when unset). Write patches User settings. */
  const notifyOnlyWhenUnfocusedAtom = Atom.writable(
    get => notifyOnlyWhenUnfocusedEnabled(unwrapUserSettings(get(userSettingsAtom))),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, {
        ...unwrapUserSettings(ctx.get(userSettingsAtom)),
        notifyOnlyWhenUnfocused: enabled,
      });
    },
  ).pipe(Atom.keepAlive);

  /** Normalized Always-hidden globs (empty when unset). Write patches User settings. */
  const alwaysHiddenGlobsAtom = Atom.writable(
    get => normalizeAlwaysHiddenGlobs(unwrapUserSettings(get(userSettingsAtom)).alwaysHiddenGlobs),
    (ctx, globs: readonly string[]) => {
      const normalized = normalizeAlwaysHiddenGlobs(globs);
      const current = unwrapUserSettings(ctx.get(userSettingsAtom));
      if (normalized.length === 0) {
        const { alwaysHiddenGlobs: _removed, ...rest } = current;
        ctx.set(userSettingsAtom, rest);
        return;
      }
      ctx.set(userSettingsAtom, { ...current, alwaysHiddenGlobs: [...normalized] });
    },
  ).pipe(Atom.keepAlive);

  /** Replace one launch target's Hidden models + Model order. Callers pass already-pruned lists. */
  const setModelPickerPrefsAtom = Atom.writable(
    () => undefined,
    (ctx, arg: { readonly launchTarget: AgentLaunchTarget; readonly prefs: ModelPickerPrefs }) => {
      ctx.set(
        userSettingsAtom,
        withModelPickerPrefs(unwrapUserSettings(ctx.get(userSettingsAtom)), arg.launchTarget, arg.prefs),
      );
    },
  ).pipe(Atom.keepAlive);

  /** Effective theme: paint cache while settings not Success; User settings after. Write paints + updates settings. */
  const themeAtom = Atom.writable(
    get => {
      const settings = get(userSettingsAtom);
      if (!AsyncResult.isSuccess(settings)) {
        return readPaintThemeId();
      }
      const themeId = clampThemeId(settings.value.theme);
      writePaintThemeId(themeId);
      return themeId;
    },
    (ctx, id: ThemeId) => {
      writePaintThemeId(id);
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), theme: id });
    },
  ).pipe(Atom.keepAlive);

  return {
    alwaysHiddenGlobsAtom,
    appOrchestratedAgentsAtom,
    chatWidthAtom,
    confirmSessionDeleteAtom,
    developerModeAtom,
    keepAwakeEnabledAtom,
    matchVscodeThemeAtom,
    midTurnSendAtom,
    notificationSoundEnabledAtom,
    notificationsEnabledAtom,
    notifyOnlyWhenUnfocusedAtom,
    persistUserSettingsAtomFn,
    setModelPickerPrefsAtom,
    showArchivedSettingAtom,
    themeAtom,
    userSettingsAtom,
  };
};
