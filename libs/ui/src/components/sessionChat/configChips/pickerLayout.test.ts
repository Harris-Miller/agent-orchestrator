import { assert, describe, it } from '@effect/vitest';

import { modelListMaxHeight, pickerPaneHeight } from './pickerLayout.ts';
import type { OptionRowKind } from './pickerLayout.ts';

const switches = (n: number): readonly OptionRowKind[] => Array.from({ length: n }, () => 'switch');

describe('pickerPaneHeight', () => {
  it('reserves 5 Reasoning + 3 Options up to 8 rows combined', () => {
    const base = pickerPaneHeight(5, switches(3));
    assert.strictEqual(pickerPaneHeight(0, []), base);
    assert.strictEqual(pickerPaneHeight(4, switches(4)), base);
    assert.strictEqual(pickerPaneHeight(6, switches(2)), base);
  });

  it('grows once Reasoning + Options exceed 8', () => {
    assert.isAbove(pickerPaneHeight(5, switches(4)), pickerPaneHeight(5, switches(3)));
    assert.isAbove(pickerPaneHeight(6, switches(3)), pickerPaneHeight(5, switches(3)));
  });

  it('counts select rows taller than switch rows', () => {
    assert.isAbove(pickerPaneHeight(5, ['select', 'switch', 'switch']), pickerPaneHeight(5, switches(3)));
    assert.isAbove(pickerPaneHeight(6, ['select', 'switch', 'switch']), pickerPaneHeight(6, switches(3)));
  });

  it('keeps the model list inside the pane', () => {
    assert.isBelow(modelListMaxHeight(pickerPaneHeight(5, switches(3))), pickerPaneHeight(5, switches(3)));
  });
});
