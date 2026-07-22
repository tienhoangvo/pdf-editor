import { useEffect, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { AsyncStatus } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/** A page's box in PDF points — the world-coordinate space annotations live in. */
export type PageBox = {
  pageNumber: number;
  width: number;
  height: number;
};

const EMPTY_BOXES = new Map<number, PageBox>();

export default function usePdfDocument(file: string | null) {
  // 1. Initialize states cleanly.
  // We use functional initialization to set the correct starting status.
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageBoxes, setPageBoxes] = useState<Map<number, PageBox>>(EMPTY_BOXES);
  const [status, setStatus] = useState<AsyncStatus>(() =>
    file ? "pending" : "idle",
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    const task = pdfjs.getDocument({ url: file });
    let loaded: PDFDocumentProxy | null = null;

    const load = async () => {
      loaded = await task.promise;
      if (cancelled) return;

      const boxes = new Map<number, PageBox>();
      for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber++) {
        const page = await loaded.getPage(pageNumber);
        if (cancelled) return;
        const { width, height } = page.getViewport({ scale: 1 });
        boxes.set(pageNumber, { pageNumber, width, height });
      }

      if (cancelled) return;
      setPdf(loaded);
      setPageBoxes(boxes);
      setStatus("completed");
    };

    load().catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err : new Error("Failed to load PDF"));
      setStatus("failed");
    });

    return () => {
      cancelled = true;
      task.destroy();
      loaded?.cleanup();

      // 2. Safely put the status back to idle or pending when the file unmounts/swaps
      setStatus(file ? "pending" : "idle");
    };
    // We include file in the dependency array to trigger updates safely when it alters
  }, [file]);

  return { pdf, numPages: pdf?.numPages ?? 0, pageBoxes, status, error };
}
