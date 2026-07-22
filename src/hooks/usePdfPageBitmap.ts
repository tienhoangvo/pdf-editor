import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const RASTER_LOWER = 0.6;
const RASTER_UPPER = 1.6;
const SETTLE_MS = 500;
const MAX_RASTER_SCALE = 8;
const NO_BITMAP = 0;

// 🌟 SAFE MAX GRID CAPS: Protect browser memory allocation pools from exploding
const MAX_CANVAS_DIMENSION = 16384;

type UsePdfPageBitmapArgs = {
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
  dpr: number;
  scale: number;
  bitmapRef: React.MutableRefObject<ImageBitmap | null>;
  isFitted: boolean;
  onBitmap: () => void;
};

export default function usePdfPageBitmap({
  pdf,
  pageNumber,
  dpr,
  scale,
  bitmapRef,
  isFitted,
  onBitmap,
}: UsePdfPageBitmapArgs) {
  const bitmapScaleRef = useRef(NO_BITMAP);
  const tokenRef = useRef(0);
  const [isRasterizing, setIsRasterizing] = useState(false);

  const onBitmapRef = useRef(onBitmap);
  useEffect(() => {
    onBitmapRef.current = onBitmap;
  }, [onBitmap]);

  const rasterize = useCallback(
    async (targetScale: number) => {
      if (!pdf || targetScale <= 0) return;

      const token = ++tokenRef.current;
      setIsRasterizing(true);

      try {
        const page = await pdf.getPage(pageNumber);
        if (token !== tokenRef.current) return;

        const clamped = Math.min(targetScale, MAX_RASTER_SCALE);
        const viewport = page.getViewport({ scale: clamped * dpr });

        // 🌟 CORRECTION 1: Enforce physical size constraints to ensure safe texture allocation
        let width = Math.max(1, Math.round(viewport.width));
        let height = Math.max(1, Math.round(viewport.height));

        if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION) {
          const ratio = Math.min(
            MAX_CANVAS_DIMENSION / width,
            MAX_CANVAS_DIMENSION / height,
          );
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        const offscreen = new OffscreenCanvas(width, height);
        const ctx = offscreen.getContext("2d");
        if (!ctx)
          throw new Error("Could not instantiate canvas layout engine.");

        // Re-scale viewport properties if constraints were applied
        const renderViewport =
          width !== Math.round(viewport.width)
            ? page.getViewport({
                scale: clamped * dpr * (width / viewport.width),
              })
            : viewport;

        // Execute render task smoothly
        await page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport: renderViewport,
          canvas: offscreen as unknown as HTMLCanvasElement,
        }).promise;

        if (token !== tokenRef.current) return;

        // 🌟 CORRECTION 2: Use robust exception tracking blocks around GPU transfer targets
        let nextBitmap: ImageBitmap | null = null;
        try {
          nextBitmap = offscreen.transferToImageBitmap();
        } catch (bitmapError) {
          console.log(bitmapError);
          throw new Error("GPU Transfer State Core Fault Triggered.", {
            cause: bitmapError,
          });
        }

        if (nextBitmap) {
          bitmapRef.current?.close();
          bitmapRef.current = nextBitmap;
          bitmapScaleRef.current = clamped;
          onBitmapRef.current();
        }
      } catch (err) {
        console.error("⚠️ PDF Background Rasterizer Aborted Safely:", err);
      } finally {
        if (token === tokenRef.current) setIsRasterizing(false);
      }
    },
    [pdf, pageNumber, dpr, bitmapRef],
  );

  useEffect(() => {
    tokenRef.current++;
    bitmapRef.current?.close();
    bitmapRef.current = null;
    bitmapScaleRef.current = NO_BITMAP;
  }, [pdf, pageNumber, bitmapRef]);

  useEffect(() => {
    if (!pdf || !isFitted || scale <= 0) return;

    const current = bitmapScaleRef.current;
    if (current === NO_BITMAP) {
      rasterize(scale);
      return;
    }

    if (current >= MAX_RASTER_SCALE && scale > current) return;

    const ratio = scale / current;
    if (ratio > RASTER_LOWER && ratio < RASTER_UPPER) return;

    const id = setTimeout(() => rasterize(scale), SETTLE_MS);
    return () => clearTimeout(id);
  }, [pdf, isFitted, scale, rasterize]);

  useEffect(
    () => () => {
      tokenRef.current++;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    },
    [bitmapRef],
  );

  return { isRasterizing };
}
