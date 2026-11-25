'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import s from './org.module.css';
import { cx } from './Popover';
import { useCanvasScale } from './ZoomPanCanvas';

export interface Box {
  l: number; t: number; w: number; h: number;
  r: number; b: number; cx: number; cy: number;
}
export type Measure = (id: string) => Box | null;
export interface PathSpec {
  key: string;
  d: string;
  /** functional = solid grey · local = dashed teal (additional operational reporting) */
  kind: 'functional' | 'local';
  hot?: boolean;
}

/**
 * Draws the reporting lines as SVG on top of the DOM layout instead of fragile CSS borders.
 * Elements opt in with  data-node="<id>";  `build` receives a measure(id) → box (in layout px,
 * relative to the canvas) and returns the SVG paths. Re-measures after every render, on resize,
 * on font load and when the zoom changes; state only updates if the geometry actually changed.
 * Must be rendered as a direct child of a `position: relative` container (the canvas inner).
 */
export function ConnectorLayer({ build }: { build: (m: Measure) => PathSpec[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const buildRef = useRef(build);
  buildRef.current = build;
  const scale = useCanvasScale();
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [paths, setPaths] = useState<PathSpec[]>([]);
  const last = useRef('');

  const recalc = useCallback(() => {
    const root = svgRef.current?.parentElement;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const sc = scaleRef.current || 1;
    const measure: Measure = (id) => {
      const el = root.querySelector<HTMLElement>(`[data-node="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const l = Math.round((r.left - rr.left) / sc);
      const t = Math.round((r.top - rr.top) / sc);
      const w = Math.round(r.width / sc);
      const h = Math.round(r.height / sc);
      return { l, t, w, h, r: l + w, b: t + h, cx: l + Math.round(w / 2), cy: t + Math.round(h / 2) };
    };
    const next = buildRef.current(measure);
    const key = JSON.stringify(next);
    if (key !== last.current) {
      last.current = key;
      setPaths(next);
    }
  }, []);

  useLayoutEffect(() => {
    recalc();
  });

  useEffect(() => {
    const root = svgRef.current?.parentElement;
    if (!root) return;
    const ro = new ResizeObserver(recalc);
    ro.observe(root);
    document.fonts?.ready.then(recalc).catch(() => {});
    window.addEventListener('resize', recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recalc);
    };
  }, [recalc]);

  return (
    <svg ref={svgRef} className={s.connectors} aria-hidden="true">
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          className={cx(p.kind === 'local' ? s.cnLocal : s.cnFunc, p.hot && s.cnHot)}
        />
      ))}
    </svg>
  );
}
