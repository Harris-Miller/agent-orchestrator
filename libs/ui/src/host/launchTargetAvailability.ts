/**
 * Launch target availability: for each enabled launch target, usable now or why not. Two sources answer it — the
 * backend harness (Bootstrap phase, Config option index) and the Provider (CLI, runtime, download) — and the Provider's
 * reason outranks the harness's. Pickers render every enabled target; unusable ones are disabled and show the reason.
 */
import { isUsablePhase } from './acpSessionBootstrap.ts';
import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import type { HarnessFailure } from './harnessFailure.ts';
import { unavailableReason } from './providerView.ts';
import type { ProviderView } from './providerView.ts';

export type UnavailableReasons = Readonly<Partial<Record<AgentLaunchTarget, string>>>;

/** Why a backend harness cannot start sessions yet (`undefined` when it can: usable phase and a nonempty Config index). */
export const harnessUnavailableReason = (harness: {
  readonly failure: HarnessFailure | undefined;
  readonly hasConfigIndex: boolean;
  readonly phase: AcpBootstrapPhase;
}): string | undefined => {
  if (harness.phase === 'error') {
    return harness.failure?.message ?? 'Unavailable';
  }
  if (!isUsablePhase(harness.phase)) {
    return 'Starting…';
  }
  if (!harness.hasConfigIndex) {
    return harness.phase === 'usable' ? 'Loading models…' : 'No configuration available';
  }
  return undefined;
};

/** `harnessReasons` with each Provider's own reason (it cannot launch at all) taking precedence. */
export const withProviderReasons = (
  harnessReasons: UnavailableReasons,
  providers: readonly ProviderView[],
): UnavailableReasons => {
  const reasons = { ...harnessReasons };
  for (const provider of providers) {
    const reason = unavailableReason(provider);
    if (reason !== undefined) {
      reasons[provider.id] = reason;
    }
  }
  return reasons;
};

const sameElements = (a: readonly AgentLaunchTarget[], b: readonly AgentLaunchTarget[]): boolean =>
  a.length === b.length && a.every((target, i) => target === b[i]);

const sameReasons = (a: UnavailableReasons, b: UnavailableReasons): boolean => {
  const keys = Object.keys(a) as AgentLaunchTarget[];
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
};

export interface HarnessAvailability {
  readonly reasons: UnavailableReasons;
  readonly usable: readonly AgentLaunchTarget[];
}

export interface LaunchTargetAvailability extends HarnessAvailability {
  readonly selectable: readonly AgentLaunchTarget[];
}

/** Structural equality so the availability atoms keep their reference across unrelated harness snapshot writes. */
export const harnessAvailabilityEqual = (a: HarnessAvailability, b: HarnessAvailability): boolean =>
  sameElements(a.usable, b.usable) && sameReasons(a.reasons, b.reasons);

/** `harnessAvailabilityEqual` plus the `selectable` list. */
export const launchTargetAvailabilityEqual = (a: LaunchTargetAvailability, b: LaunchTargetAvailability): boolean =>
  harnessAvailabilityEqual(a, b) && sameElements(a.selectable, b.selectable);
