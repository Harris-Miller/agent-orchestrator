/** Shared Effect Atom runtime for ACP desktop state. */
import { TauriServicesLive } from '@lib/context-services-tauri';
import { Atom } from 'effect/unstable/reactivity';

export const acpRuntime = Atom.runtime(() => TauriServicesLive);

export type AcpAtomGet = Parameters<Parameters<typeof acpRuntime.fn>[0]>[1];
