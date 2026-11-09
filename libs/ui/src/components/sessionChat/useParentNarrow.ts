import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Whether the element holding the returned `probeRef` element is narrower than `threshold` px. Attach the ref to a
 * zero-size, out-of-flow element; the parent is what gets measured, so a fragment-rendering component can adapt to the
 * host row it was placed in.
 */
export const useParentNarrow = (threshold: number) => {
  const [narrow, setNarrow] = useState(false);
  const observer = useRef<ResizeObserver | undefined>(undefined);

  const probeRef = useCallback(
    (probe: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = undefined;
      const parent = probe?.parentElement;
      if (parent === null || parent === undefined) return;
      setNarrow(parent.clientWidth < threshold);
      observer.current = new ResizeObserver(([change]) => {
        if (change !== undefined) setNarrow(change.contentRect.width < threshold);
      });
      observer.current.observe(parent);
    },
    [threshold],
  );

  useLayoutEffect(
    () => () => {
      observer.current?.disconnect();
    },
    [],
  );

  return { narrow, probeRef };
};
