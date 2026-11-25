/** User settings write-through Atom backed by `@lib/hoa-home`. */
import { normalizeAlwaysHiddenGlobs, readUserSettings, writeUserSettings } from '@lib/hoa-home';
import type { UserSettings } from '@lib/hoa-home';
import { Effect, Exit } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import type { ModelPickerPrefs } from '../../host/modelPickerPrefs.ts';
import type { HostRuntimeBag } from '../../createHostRuntime.ts';
import type { PaintedSlotSetting } from '../../theme/themeId.ts';
import { readPaintThemeSettings, writePaintThemeSettings } from '../../theme/themePaintCache.ts';
import { resolvePaintedThemeId, resolveThemeSettings } from '../../theme/themeSettings.ts';
import type { ThemeSettings } from '../../theme/themeSettings.ts';
import type { ThemeId } from '../../theme/themes.ts';
import { hostThemeAtom, osPrefersDarkAtom } from '../theme.atoms.ts';

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
  workstreamsEnabled,
  workstreamsEnabledAtom,
} from './userSettingsDocument.atoms.ts';
import type { ChatWidth, MidTurnSend } from './userSettingsDocument.atoms.ts';

export { appOrchestratedAgentsEnabled, showArchivedEnabled, unwrapUserSettings, workstreamsEnabled };
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

  /** Effective Experimental: Workstreams (off when unset). Write patches User settings. */
  const workstreamsSettingAtom = Atom.writable(
    get => get(workstreamsEnabledAtom),
    (ctx, enabled: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), workstreamsEnabled: enabled });
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

  /** Resolved light palette / dark palette / Painted slot setting: paint cache until settings load, then User settings. */
  const themeSettingsAtom = Atom.make((get): ThemeSettings => {
    const settings = get(userSettingsAtom);
    if (!AsyncResult.isSuccess(settings)) {
      return readPaintThemeSettings();
    }
    const resolved = resolveThemeSettings(settings.value);
    writePaintThemeSettings(resolved);
    return resolved;
  }).pipe(Atom.keepAlive);

  /** Patch all three theme fields from the resolved triple, clearing the legacy `theme`. */
  const writeThemeSettings = (ctx: Atom.WriteContext<unknown>, patch: Partial<ThemeSettings>) => {
    const next = { ...ctx.get(themeSettingsAtom), ...patch };
    writePaintThemeSettings(next);
    const { theme: _legacy, ...rest } = unwrapUserSettings(ctx.get(userSettingsAtom));
    ctx.set(userSettingsAtom, { ...rest, ...next });
  };

  /** Light palette. Write patches User settings. */
  const lightThemeAtom = Atom.writable(
    get => get(themeSettingsAtom).lightTheme,
    (ctx, id: ThemeId) => {
      writeThemeSettings(ctx, { lightTheme: id });
    },
  ).pipe(Atom.keepAlive);

  /** Dark palette. Write patches User settings. */
  const darkThemeAtom = Atom.writable(
    get => get(themeSettingsAtom).darkTheme,
    (ctx, id: ThemeId) => {
      writeThemeSettings(ctx, { darkTheme: id });
    },
  ).pipe(Atom.keepAlive);

  /** Painted slot setting (always light / always dark / use system). Write patches User settings. */
  const paintedSlotAtom = Atom.writable(
    get => get(themeSettingsAtom).paintedSlot,
    (ctx, setting: PaintedSlotSetting) => {
      writeThemeSettings(ctx, { paintedSlot: setting });
    },
  ).pipe(Atom.keepAlive);

  /** Painted palette id (read-only): the slot the setting, OS and Host pick, filled by that slot's palette. */
  const themeAtom: Atom.Atom<ThemeId> = Atom.make(get =>
    resolvePaintedThemeId({
      hostMode: get(hostThemeAtom)?.colors.mode,
      osPrefersDark: get(osPrefersDarkAtom),
      settings: get(themeSettingsAtom),
    }),
  ).pipe(Atom.keepAlive);

  return {
    alwaysHiddenGlobsAtom,
    appOrchestratedAgentsAtom,
    workstreamsSettingAtom,
    chatWidthAtom,
    confirmSessionDeleteAtom,
    darkThemeAtom,
    developerModeAtom,
    keepAwakeEnabledAtom,
    lightThemeAtom,
    matchVscodeThemeAtom,
    midTurnSendAtom,
    notificationSoundEnabledAtom,
    notificationsEnabledAtom,
    notifyOnlyWhenUnfocusedAtom,
    paintedSlotAtom,
    persistUserSettingsAtomFn,
    setModelPickerPrefsAtom,
    showArchivedSettingAtom,
    themeAtom,
    userSettingsAtom,
  };
};
