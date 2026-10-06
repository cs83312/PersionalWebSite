'use client';

import { useEffect, useRef } from 'react';
import { readLightningColors, type LightningColors } from '@/lib/lightning';
import styles from './LightningCanvas.module.css';

type Pt = [number, number];
type Bolt = { main: Pt[]; forks: Pt[][]; t0: number; dur: number; fade: number };

function makePath(x0: number, y0: number, x1: number, spread: number, step: number, slope = 0): Pt[] {
  const pts: Pt[] = [[x0, y0]];
  let x = x0;
  let y = y0;
  while (x < x1) {
    const dx = step * (0.5 + Math.random());
    x += dx;
    y += dx * slope + (Math.random() - 0.5) * spread;
    pts.push([x, y]);
  }
  return pts;
}

// Background lightning striking top-left → bottom-right. Colors come from the
// site theme variables and are re-read whenever ThemeToggle changes data-theme.
export function LightningCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const root = document.documentElement;
    let colors: LightningColors = readLightningColors(getComputedStyle(root));
    let dark = root.dataset.theme === 'dark';
    const observer = new MutationObserver(() => {
      colors = readLightningColors(getComputedStyle(root));
      dark = root.dataset.theme === 'dark';
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    let bolts: Bolt[] = [];
    let next = performance.now() + 600;
    let raf = 0;

    const spawn = (w: number, h: number) => {
      const off = (Math.random() - 0.5) * 0.5;
      const x0 = -20 + Math.max(0, off) * w;
      const y0 = -20 + Math.max(0, -off) * h;
      const x1 = w + 20 - Math.max(0, -off) * w;
      const y1 = h + 20 - Math.max(0, off) * h;
      const main = makePath(x0, y0, x1, h * 0.07, Math.max(18, w / 40), (y1 - y0) / (x1 - x0));
      const forks: Pt[][] = [];
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n && main.length > 6; i++) {
        const p = main[2 + Math.floor(Math.random() * (main.length - 4))];
        const len = w * (0.06 + Math.random() * 0.14);
        const dir = Math.random() < 0.5 ? -1 : 1;
        forks.push(makePath(p[0], p[1], p[0] + len, h * 0.05, 14).map(([x, y], j) => [x, y + dir * j * 6] as Pt));
      }
      bolts.push({ main, forks, t0: performance.now(), dur: 520 + Math.random() * 220, fade: 650 });
    };

    const stroke = (pts: Pt[], upto: number, width: number, alpha: number) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) {
        if (p[0] > upto) break;
        ctx.lineTo(p[0], p[1]);
      }
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = colors.glow;
      ctx.lineWidth = width * 5;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 24;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colors.core;
      ctx.lineWidth = width;
      ctx.shadowBlur = 8;
      ctx.stroke();
    };

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (now > next) {
        spawn(w, h);
        next = now + 1800 + Math.random() * 2600;
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      bolts = bolts.filter((b) => now - b.t0 < b.dur + b.fade);
      for (const b of bolts) {
        const elapsed = now - b.t0;
        const progress = Math.min(1, elapsed / b.dur);
        const head = -20 + (w + 40) * (1 - Math.pow(1 - progress, 3));
        const alpha = elapsed < b.dur ? 1 : Math.max(0, 1 - (elapsed - b.dur) / b.fade);
        const flicker = 0.75 + Math.random() * 0.25;
        // Faint screen flash right after the strike lands.
        if (elapsed > b.dur && elapsed < b.dur + 120) {
          ctx.globalAlpha = (dark ? 0.06 : 0.04) * (1 - (elapsed - b.dur) / 120);
          ctx.shadowBlur = 0;
          ctx.fillStyle = colors.core;
          ctx.fillRect(0, 0, w, h);
        }
        stroke(b.main, head, 2.2, alpha * flicker);
        for (const f of b.forks) stroke(f, head, 1.1, alpha * flicker * 0.7);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={styles.canvas} aria-hidden="true" />;
}
