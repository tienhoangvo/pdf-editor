import { useSyncExternalStore, useMemo, useRef, type RefObject } from "react";

interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize(
  target: HTMLElement | RefObject<HTMLElement | null> | null,
): ElementSize | null {
  const refs = useRef<{
    lastElement: HTMLElement | null;
    observer: ResizeObserver | null;
    lastSize: ElementSize | null;
  }>({
    lastElement: null,
    observer: null,
    lastSize: null,
  });
  const store = useMemo(() => {
    const getElement = (): HTMLElement | null => {
      if (!target) return null;
      return "current" in target ? target.current : target;
    };

    return {
      subscribe(callback: () => void) {
        const element = getElement();

        if (!element) {
          const frameId = requestAnimationFrame(() => {
            if (getElement()) callback();
          });
          return () => cancelAnimationFrame(frameId);
        }

        refs.current.lastElement = element;
        refs.current.observer = new ResizeObserver(() => callback());
        refs.current.observer.observe(element);

        return () => {
          refs.current.observer?.disconnect();
          refs.current.observer = null;
          refs.current.lastElement = null;
        };
      },

      getSnapshot(): ElementSize | null {
        const element = getElement();

        if (element !== refs.current.lastElement && refs.current.observer) {
          queueMicrotask(() => store.subscribe(() => {}));
        }

        if (!element) {
          refs.current.lastSize = null;
          return null;
        }

        const nextWidth = element.offsetWidth;
        const nextHeight = element.offsetHeight;
        const prev = refs.current.lastSize;

        // 2. Performance Safeguard: Return the identical object reference if sizes match
        if (prev && prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }

        // 3. Only create a brand new object structure if a physical layout shift happens
        const nextSize = { width: nextWidth, height: nextHeight };
        refs.current.lastSize = nextSize;
        return nextSize;
      },
    };
  }, [target]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
