import { OpenUrl } from '@lib/context-services';
import { Effect } from 'effect';
import { useCallback, useState } from 'react';

import { hostRuntime } from '../hostRuntime.ts';

/** Opens `url` in the system browser; `error` holds a fallback message when that fails. */
export const useOpenExternalUrl = (url: string) => {
  const [error, setError] = useState<string | undefined>(undefined);

  const open = useCallback(async () => {
    setError(undefined);
    const exit = await hostRuntime.runPromiseExit(
      Effect.gen(function* () {
        const openUrl = yield* OpenUrl;
        yield* openUrl.open(url);
      }),
    );
    if (exit._tag === 'Failure') {
      setError(`Could not open the browser. Visit ${url}`);
    }
  }, [url]);

  return { error, open };
};
