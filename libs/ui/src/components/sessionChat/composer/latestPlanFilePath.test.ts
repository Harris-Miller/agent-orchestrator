import { assert, describe, it } from '@effect/vitest';

import type { ChatItem } from '../../../host/sessionUpdateReducer.ts';
import { latestPlanFilePath } from './latestPlanFilePath.ts';

const call = (id: string, planFilePath?: string): ChatItem => ({
  id,
  kind: 'tool_call',
  planFilePath,
  status: 'completed',
  title: id,
  toolCallId: id,
});

describe('latestPlanFilePath', () => {
  it('returns the last plan path', () => {
    assert.strictEqual(
      latestPlanFilePath([call('a', '/p/1.md'), call('b'), call('c', '/p/2.md'), call('d')]),
      '/p/2.md',
    );
  });

  it('returns undefined when there is no plan', () => {
    assert.strictEqual(latestPlanFilePath([call('a')]), undefined);
  });
});
