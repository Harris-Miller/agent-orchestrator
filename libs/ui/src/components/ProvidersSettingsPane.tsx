import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { FC } from 'react';

import { allLaunchTargetPhasesAtom } from '../atoms/backendState.atoms.ts';
import { restartBackendAtomFn } from '../atoms/boundHarnessAtoms.ts';
import type { AcpBootstrapPhase } from '../host/acpSessionBootstrap.ts';
import { writeTextToClipboard } from '../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../hostRuntime.ts';

import { SettingsSectionIntro } from './settingsChrome.tsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion.tsx';
import { Badge } from './ui/badge.tsx';
import { Button } from './ui/button.tsx';

const phaseClass = (phase: AcpBootstrapPhase): string => {
  switch (phase) {
    case 'connecting':
    case 'initialized':
    case 'probing':
      return 'border-muted-foreground text-muted-foreground';
    case 'error':
      return 'border-destructive text-destructive';
    case 'ready':
      return 'border-primary text-primary';
    default:
      return '';
  }
};

const prettyErrorText = (error: string): string => {
  try {
    return JSON.stringify(JSON.parse(error), null, 2);
  } catch {
    return error;
  }
};

/** Settings → Providers: harness phase chips. */
export const ProvidersSettingsPane: FC = () => {
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const restartBackend = useAtomSet(restartBackendAtomFn, { mode: 'promise' });

  return (
    <>
      <SettingsSectionIntro title="Providers">
        Bootstrap phase per provider. Click an error chip to retry that provider.
      </SettingsSectionIntro>
      <div className="flex flex-col gap-4">
        {backendPhases.map(entry => {
          const errorText = entry.error === undefined ? undefined : prettyErrorText(entry.error);
          return (
            <div key={entry.launchTarget}>
              <Badge
                className={phaseClass(entry.phase)}
                onClick={
                  entry.phase === 'error'
                    ? () => {
                        restartBackend(entry.launchTarget).catch(() => undefined);
                      }
                    : undefined
                }
                render={
                  entry.phase === 'error' ? (
                    <button aria-label={`${entry.label}: ${entry.phase}`} type="button" />
                  ) : undefined
                }
                variant="outline"
              >
                {entry.label}: {entry.phase}
              </Badge>
              {errorText !== undefined ? (
                <Accordion className="mt-1.5">
                  <AccordionItem className="rounded-md border-0 bg-muted" value={entry.launchTarget}>
                    <div className="flex items-center pr-2">
                      <AccordionTrigger className="min-w-0 flex-1 py-2 text-xs">
                        <span className="font-mono">Expand to view error message</span>
                      </AccordionTrigger>
                      <Button
                        onClick={() => {
                          hostRunPromise(writeTextToClipboard(errorText)).catch(() => undefined);
                        }}
                        size="xs"
                        variant="ghost"
                      >
                        copy
                      </Button>
                    </div>
                    <AccordionContent>
                      <pre className="m-0 overflow-auto font-mono text-xs whitespace-pre-wrap">{errorText}</pre>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
};
