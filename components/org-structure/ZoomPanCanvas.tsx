//components/org-structure/ZoomPanCanvas.tsx
'use client';

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import s from './org.module.css';
import { Icon } from './Icon';

const MIN = 0.5;
const MAX = 1.6;

const ScaleCtx = createContext(1);
/** Current canvas zoom — ConnectorLayer needs it to convert screen px → layout px. */
export const useCanvasScale = () => useContext(ScaleCtx);

export interface CanvasHandle {
  fit: () => void;
  zoomBy: (factor: number) => void;
}

/**
 * "Fit view" + zoom/pan container.
 *  - Content has a design width (`minWidth`); below that the canvas scales down to fit.
 *  - Zoom: − / + buttons or Ctrl/⌘ + wheel. Pan (when zoomed in): drag the background.
 *  - Height follows the scaled content, so the page itself scrolls vertically as normal.
 *  - The scaled layer is anchored at its top-left corner (transform-origin: 0 0);
 *    with the default centre origin, scaling below 100% pushed the body right/down.
 */
export const ZoomPanCanvas = forwardRef<CanvasHandle, { minWidth: number; children: ReactNode }>(
  function ZoomPanCanvas({ minWidth, children }, ref) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [vw, setVw] = useState(0);
    const [ih, setIh] = useState(0);
    const [scale, setScale] = useState(1);
    const [panX, setPanX] = useState(0);
    const [dragging, setDragging] = useState(false);
    const autoFitted = useRef(false);
    const live = useRef({ scale, panX, vw });
    live.current = { scale, panX, vw };

    const width = Math.max(minWidth, vw / scale || 0);

    const clampPan = useCallback(
      (x: number, sc: number, v: number) => {
        const content = Math.max(minWidth * sc, v);
        return Math.min(0, Math.max(v - content, x));
      },
      [minWidth],
    );

    const zoomTo = useCallback(
      (next: number) => {
        const { scale: sc, panX: px, vw: v } = live.current;
        const ns = Math.min(MAX, Math.max(MIN, next));
        const cx = v / 2;
        setScale(ns);
        setPanX(clampPan(cx - (cx - px) * (ns / sc), ns, v));
      },
      [clampPan],
    );

    useImperativeHandle(
      ref,
      () => ({
        fit: () => {
          setScale(Math.min(1, live.current.vw / minWidth || 1));
          setPanX(0);
        },
        zoomBy: (f) => zoomTo(live.current.scale * f),
      }),
      [minWidth, zoomTo],
    );

    // measure viewport width + content height
    useLayoutEffect(() => {
      const v = viewportRef.current;
      const i = innerRef.current;
      if (!v || !i) return;
      const measure = () => {
        setVw(v.clientWidth);
        setIh(i.offsetHeight);
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(v);
      ro.observe(i);
      return () => ro.disconnect();
    }, []);

    // first measurement on a narrow screen → start fitted
    useEffect(() => {
      if (!autoFitted.current && vw > 0) {
        autoFitted.current = true;
        if (vw < minWidth) setScale(vw / minWidth);
      }
    }, [vw, minWidth]);

    useEffect(() => {
      setPanX((p) => clampPan(p, live.current.scale, vw));
    }, [vw, clampPan]);

    // Ctrl/⌘ + wheel zoom (native listener: React's onWheel is passive)
    useEffect(() => {
      const v = viewportRef.current;
      if (!v) return;
      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoomTo(live.current.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      };
      v.addEventListener('wheel', onWheel, { passive: false });
      return () => v.removeEventListener('wheel', onWheel);
    }, [zoomTo]);

    // drag-to-pan
    const drag = useRef<{ x: number; pan: number } | null>(null);
    const overflowing = minWidth * scale > vw + 1;

    const onPointerDown = (e: React.PointerEvent) => {
      if (!overflowing || e.button !== 0) return;
      if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label,[role="menu"]')) return;
      drag.current = { x: e.clientX, pan: live.current.panX };
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
      if (!drag.current) return;
      setPanX(clampPan(drag.current.pan + (e.clientX - drag.current.x), live.current.scale, live.current.vw));
    };
    const endDrag = () => {
      drag.current = null;
      setDragging(false);
    };

    return (
      <div
        ref={viewportRef}
        className={cx2(s.canvasViewport, overflowing && s.canGrab, dragging && s.isGrabbing)}
        style={{ height: ih ? Math.ceil(ih * scale) : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          ref={innerRef}
          className={s.canvasInner}
          style={{
            width,
            transformOrigin: '0 0',
            transform: `translate(${panX}px, 0) scale(${scale})`,
          }}
        >
          <ScaleCtx.Provider value={scale}>{children}</ScaleCtx.Provider>
        </div>

        <div className={s.zoomControls} role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => zoomTo(scale / 1.15)} disabled={scale <= MIN}>
            <Icon name="minus" size={14} />
          </button>
          <span aria-live="polite">{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomTo(scale * 1.15)} disabled={scale >= MAX}>
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
    );
  },
);

const cx2 = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
