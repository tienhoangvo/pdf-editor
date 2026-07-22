import { useSyncExternalStore } from "react";

function getSnapshot(): number {
  return window.devicePixelRatio;
}

function subscribe(callback: () => void) {
  let currentDpr = window.devicePixelRatio;
  let query = window.matchMedia(`(resolution: ${currentDpr}dppx)`);

  const onChange = () => {
    query.removeEventListener("change", onChange);

    callback();

    currentDpr = window.devicePixelRatio;
    query = window.matchMedia(`(resolution: ${currentDpr}dppx)`);
    query.addEventListener("change", onChange, { once: true });
  };

  query.addEventListener("change", onChange, { once: true });

  return () => {
    query.removeEventListener("change", onChange);
  };
}

export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
