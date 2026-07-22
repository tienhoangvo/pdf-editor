import {
  type ComponentProps,
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import styles from "./Canvas.module.css";
import clsx from "clsx";
import { useDevicePixelRatio } from "../hooks/useDevicePixelRatio";

export interface CanvasReadyPayload {
  canvasElement: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
  dpr: number;
  backingWidth: number;
  backingHeight: number;
}

export type CanvasReadyEventHandler = (
  payload: CanvasReadyPayload,
) => void | (() => void);

type CanvasOwnProps = {
  width: number;
  height: number;
  onCanvasReady?: CanvasReadyEventHandler;
};

export type CanvasProps = CanvasOwnProps &
  Omit<ComponentProps<"canvas">, keyof CanvasOwnProps>;

const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(function Canvas(
  { width, height, onCanvasReady, className: delegatedClassName, ...delegated },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCanvasReadyRef = useRef<CanvasReadyEventHandler | null>(null);
  const dpr = useDevicePixelRatio();

  const mergeCanvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasRef.current = node;

      if (forwardedRef) {
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else {
          forwardedRef.current = node;
        }
      }
    },
    [forwardedRef],
  );

  /*
    - must be a layout effect declared BEFORE the sizing effect below: layout effects
    - run in declaration order, and the sizing effect reads this ref on mount
   */
  useLayoutEffect(() => {
    onCanvasReadyRef.current = onCanvasReady ?? null;
  }, [onCanvasReady]);

  useLayoutEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    // explicitly configure context performance parameters
    const canvasContext = canvasElement.getContext("2d", {
      alpha: true, // required to show our backdrop color underneath vector streams
      desynchronized: false, // keeps drawing steps aligned correctly with native screen sync rules
    });
    if (!canvasContext) return;

    // backing-store size (device px) = CSS size × dpr
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);

    /* 
        - assigning width/height wipes the bitmap AND resets all context state
        - (transform, fillStyle, lineWidth, …), so consumers must repaint from scratch 
    */
    canvasElement.width = backingWidth;
    canvasElement.height = backingHeight;

    /*
        - consumers may return a cleanup (e.g. cancelling a rAF loop); 
        - React calls it before the next resize and on unmount
    */
    return onCanvasReadyRef.current?.({
      canvasContext,
      canvasElement,
      dpr,
      backingWidth,
      backingHeight,
    });
  }, [width, height, dpr]);

  return (
    <canvas
      ref={mergeCanvasRef}
      className={clsx(styles.Canvas, delegatedClassName)}
      {...delegated}
    />
  );
});

export default Canvas;
