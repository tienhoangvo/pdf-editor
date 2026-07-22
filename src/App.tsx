import {
  useCallback,
  useState,
  useRef,
  useLayoutEffect,
  type MouseEvent,
} from "react";
import styles from "./App.module.css";
import Canvas from "./Canvas";
import { useElementSize } from "./hooks/useElementSize";
import usePdfDocument from "./hooks/usePdfDocument";
import usePdfPageBitmap from "./hooks/usePdfPageBitmap";
import type { CanvasReadyEventHandler } from "./Canvas/Canvas";

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export default function App() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const canvasSize = useElementSize(container);

  // 1. Fetch the master document parameters
  const {
    pdf,
    pageBoxes,
    status: pdfStatus,
  } = usePdfDocument("/sample-blueprint.pdf");

  // 2. Setup standard Camera workspace vectors
  const cameraRef = useRef<CameraState>({ x: 100, y: 100, zoom: 0.5 });
  const [rasterScale, setRasterScale] = useState(0.5);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const activeContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastDprRef = useRef(1);

  // 3. Mutable container to house the active GPU ImageBitmap reference safely
  const page1BitmapRef = useRef<ImageBitmap | null>(null);

  // 4. Centralized Render Strategy
  const drawWorkspace = useCallback(() => {
    const ctx = activeContextRef.current;
    if (!ctx) return;

    const { x, y, zoom } = cameraRef.current;
    const dpr = lastDprRef.current;

    // Reset layout transformations and wipe layout bounds
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Apply scaling stacks
    ctx.scale(dpr, dpr);
    ctx.translate(x, y);
    ctx.scale(zoom, zoom);

    // A. Fetch Page 1 geometric boundaries
    const page1Box = pageBoxes.get(1);
    if (!page1Box) return;

    // B. Draw Blueprint Sheet Container Box Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, page1Box.width, page1Box.height);

    // C. Draw the High-Res PDF Rasterized Bitmap Layer (If generated and available)
    if (page1BitmapRef.current) {
      ctx.drawImage(
        page1BitmapRef.current,
        0,
        0,
        page1Box.width,
        page1Box.height,
      );
    } else {
      // Fallback loader text if worker threads are currently processing vector paths
      ctx.fillStyle = "#64748b";
      ctx.font = "italic 16px sans-serif";
      ctx.fillText("Rasterizing Page Content...", 32, page1Box.height / 2);
    }

    // D. Render Annotation/Outline Vector Stroke Lines cleanly over the bitmap
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2 / zoom; // Keeps stroke size visually uniform regardless of zoom factor
    ctx.strokeRect(0, 0, page1Box.width, page1Box.height);
  }, [pageBoxes]);

  // 5. Connect the high-performance rasterization lifecycle engine for Page 1
  const { isRasterizing } = usePdfPageBitmap({
    pdf,
    pageNumber: 1,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    scale: rasterScale, // Tracks current layout zoom vector to evaluate fidelity updates
    bitmapRef: page1BitmapRef,
    isFitted: pageBoxes.has(1), // Lock initialization until layout boundaries populate
    onBitmap: () => {
      // Callback triggers instantly when a background paint thread finishes. Force visual update:
      drawWorkspace();
    },
  });

  // 6. Connect Canvas Contexts
  const handleCanvasReady = useCallback<CanvasReadyEventHandler>(
    ({ canvasContext, dpr }) => {
      activeContextRef.current = canvasContext;
      lastDprRef.current = dpr;
      drawWorkspace();
      return () => {
        activeContextRef.current = null;
      };
    },
    [drawWorkspace],
  );

  // 7. Interactive Non-Passive Wheel Zoom Handler
  const handleNativeWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const ctx = activeContextRef.current;
      if (!ctx) return;

      const rect = ctx.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const currentCamera = cameraRef.current;
      const zoomIntensity = 0.08;

      const worldX = (mouseX - currentCamera.x) / currentCamera.zoom;
      const worldY = (mouseY - currentCamera.y) / currentCamera.zoom;

      const zoomFactor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
      const nextZoom = Math.min(
        Math.max(currentCamera.zoom * zoomFactor, 0.05),
        8,
      );

      cameraRef.current = {
        zoom: nextZoom,
        x: mouseX - worldX * nextZoom,
        y: mouseY - worldY * nextZoom,
      };

      setRasterScale(nextZoom);

      drawWorkspace();
    },
    [drawWorkspace],
  );

  useLayoutEffect(() => {
    if (!container) return;
    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    drawWorkspace();
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, [container, handleNativeWheel, drawWorkspace]);

  // Drag Interaction Parameters
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - cameraRef.current.x,
      y: e.clientY - cameraRef.current.y,
    };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    cameraRef.current.x = e.clientX - dragStartRef.current.x;
    cameraRef.current.y = e.clientY - dragStartRef.current.y;
    drawWorkspace();
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className={styles.App}>
      <header className={styles.Header}>
        <h3 style={{ margin: 0 }}>PDF Vector Viewport</h3>
        <span style={{ fontSize: "12px" }}>
          Status: <strong>{pdfStatus}</strong>{" "}
          {isRasterizing && "⏳ [Rasterizing Grid]"}
        </span>
      </header>

      <main
        ref={setContainer}
        className={styles.Main}
        style={{
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      >
        {canvasSize && (
          <Canvas
            onCanvasReady={handleCanvasReady}
            width={canvasSize.width}
            height={canvasSize.height}
          />
        )}
      </main>
    </div>
  );
}
