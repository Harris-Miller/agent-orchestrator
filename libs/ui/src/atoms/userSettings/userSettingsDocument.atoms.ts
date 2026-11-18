/**
 * The in-memory `settings.json`: the app's single copy of User settings. Module-level so Host-runtime-free Atoms can
 * derive from it; `createUserSettingsAtoms` loads it from disk and persists writes. Never mirror a field elsewhere.
 */
import { defaultSettings } from '@lib/hoa-home';
import type { readUserSettings, UserSettings } from '@lib/hoa-home';
import type { Effect } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { EMPTY_MODEL_PICKER_PREFS } from '../../host/modelPickerPrefs.ts';
import type { ModelPickerPrefs } from '../../host/modelPickerPrefs.ts';
import type { AtomRegistry } from 'effect/reactivity';

export type UserSettingsLoadError = Effect.Error<ReturnType<typeof readUserSettings>>;

export const userSettingsDocumentAtom = Atom.make<AsyncResult.AsyncResult<UserSettings, UserSettingsLoadError>>(
  AsyncResult.initial(),
).pipe(Atom.withLabel('userSettingsDocument'), Atom.keepAlive);

/** Unwrap AsyncResult to UserSettings: Success value, else previousSuccess, else product defaults. */
export const unwrapUserSettings = <E>(result: AsyncResult.AsyncResult<UserSettings, E>): UserSettings =>
  AsyncResult.getOrElse(result, () => defaultSettings);

/** Current User settings for code outside Atom reads (product defaults until loaded). */
export const currentUserSettings = (registry: AtomRegistry.AtomRegistry): UserSettings =>
  unwrapUserSettings(registry.get(userSettingsDocumentAtom));

/** Show archived is off when the Settings field is unset. */
export const showArchivedEnabled = (settings: UserSettings): boolean => settings.showArchived === true;

/** Effective Show archived, read from the User settings document. Toggle through `showArchivedSettingAtom`. */
export const showArchivedAtom = Atom.make(get =>
  showArchivedEnabled(unwrapUserSettings(get(userSettingsDocumentAtom))),
).pipe(Atom.withLabel('showArchived'), Atom.keepAlive);

/** Experimental: App Orchestrated Agents is off when the Settings field is unset. */
export const appOrchestratedAgentsEnabled = (settings: UserSettings): boolean =>
  settings.appOrchestratedAgentsEnabled === true;

/** Effective Experimental: App Orchestrated Agents, read from the User settings document. Write through `appOrchestratedAgentsAtom`. */
export const appOrchestratedAgentsEnabledAtom = Atom.make(get =>
  appOrchestratedAgentsEnabled(unwrapUserSettings(get(userSettingsDocumentAtom))),
).pipe(Atom.withLabel('appOrchestratedAgents'), Atom.keepAlive);

/** Whether the User settings document has been read yet (the hub waits for it to know if it is wanted). */
export const userSettingsLoadedAtom = Atom.make(get => !AsyncResult.isInitial(get(userSettingsDocumentAtom))).pipe(
  Atom.withLabel('userSettingsLoaded'),
  Atom.keepAlive,
);

/** What sending a message while a prompt turn runs does (Composer Send button, Enter). */
export type MidTurnSend = NonNullable<UserSettings['midTurnSend']>;

/** Steer is the mid-turn send when the Settings field is unset. */
export const midTurnSendMode = (settings: UserSettings): MidTurnSend => settings.midTurnSend ?? 'steer';

/** Effective mid-turn send, read from the User settings document. Write through `midTurnSendAtom`. */
export const midTurnSendModeAtom = Atom.make(get =>
  midTurnSendMode(unwrapUserSettings(get(userSettingsDocumentAtom))),
).pipe(Atom.withLabel('midTurnSend'), Atom.keepAlive);

const withoutKey = <V>(record: Readonly<Record<string, V>> | undefined, key: string): Record<string, V> => {
  const { [key]: _removed, ...rest } = record ?? {};
  return rest;
};

/** Hidden models + Model order for one launch target (empty when unset). */
export const modelPickerPrefsOf = (settings: UserSettings, launchTarget: AgentLaunchTarget): ModelPickerPrefs => {
  const hidden = settings.hiddenModels?.[launchTarget];
  const order = settings.modelOrder?.[launchTarget];
  return hidden === undefined && order === undefined
    ? EMPTY_MODEL_PICKER_PREFS
    : { hidden: hidden ?? [], order: order ?? [] };
};

/** Settings with one launch target's prefs replaced; empty lists drop the key. */
export const withModelPickerPrefs = (
  settings: UserSettings,
  launchTarget: AgentLaunchTarget,
  prefs: ModelPickerPrefs,
): UserSettings => {
  const hiddenModels =
    prefs.hidden.length === 0
      ? withoutKey(settings.hiddenModels, launchTarget)
      : { ...settings.hiddenModels, [launchTarget]: [...prefs.hidden] };
  const modelOrder =
    prefs.order.length === 0
      ? withoutKey(settings.modelOrder, launchTarget)
      : { ...settings.modelOrder, [launchTarget]: [...prefs.order] };
  const { hiddenModels: _h, modelOrder: _o, ...rest } = settings;
  return {
    ...rest,
    ...(Object.keys(hiddenModels).length === 0 ? {} : { hiddenModels }),
    ...(Object.keys(modelOrder).length === 0 ? {} : { modelOrder }),
  };
};

/** Hidden models + Model order of a launch target, read from the User settings document. Write through `setModelPickerPrefsAtom`. */
export const modelPickerPrefsAtom = Atom.family((launchTarget: AgentLaunchTarget | undefined) =>
  Atom.make(get =>
    launchTarget === undefined
      ? EMPTY_MODEL_PICKER_PREFS
      : modelPickerPrefsOf(unwrapUserSettings(get(userSettingsDocumentAtom)), launchTarget),
  ).pipe(Atom.withLabel(`modelPickerPrefs:${launchTarget ?? 'none'}`), Atom.keepAlive),
);
