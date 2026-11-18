import { assert, describe, it } from '@effect/vitest';

import { modelListMaxHeight, pickerPaneHeight } from './pickerLayout.ts';

describe('pickerPaneHeight', () => {
  it('reserves 5 Reasoning + 3 Options up to 8 rows combined', () => {
    const base = pickerPaneHeight(5, 3);
    assert.strictEqual(pickerPaneHeight(0, 0), base);
    assert.strictEqual(pickerPaneHeight(4, 4), base);
    assert.strictEqual(pickerPaneHeight(6, 2), base);
  });

  it('grows once Reasoning + Options exceed 8', () => {
    assert.isAbove(pickerPaneHeight(5, 4), pickerPaneHeight(5, 3));
    assert.isAbove(pickerPaneHeight(6, 3), pickerPaneHeight(5, 3));
  });

  it('keeps the model list inside the pane', () => {
    assert.isBelow(modelListMaxHeight(pickerPaneHeight(5, 3)), pickerPaneHeight(5, 3));
  });
});
