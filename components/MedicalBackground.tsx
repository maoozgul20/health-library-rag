"use client";

// An animated, interactive medical background drawn on one canvas:
//  - red blood cells drifting in depth; they swerve away from the pointer
//  - a turning DNA double helix that twists faster when the pointer is near it
//  - a heart monitor (ECG) trace whose heart rate rises when you move the pointer quickly
//  - small plus signs rising and twinkling
// Clicking empty space sends out a pulse ring and an extra heartbeat. The page can
// also trigger a beat with: window.dispatchEvent(new Event("med-pulse")).

import { useEffect, useRef } from "react";

type Cell = { x: number; y: number; z: number; r: number; vx: number; vy: number; bx: number; by: number; t: number; ts: number; rot: number; rs: number };
type Plus = { x: number; y: number; s: number; v: number; ph: number };
type Ring = { x: number; y: number; t0: number };

const SKIP = "button, a, textarea, input, label, select, summary, details, pre, code, .msg, .sidebar, .sources, .dialog, .composer, .chip-btn";

function rgb(hex: string) {
  const h = hex.trim().replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** One heartbeat, t in [0,1): P wave, QRS spike, T wave. Returns -0.3..1. */
function ecg(t: number) {
  const g = (c: number, w: number, a: number) => a * Math.exp(-((t - c) ** 2) / (2 * w * w));
  return g(0.14, 0.025, 0.1) + g(0.265, 0.008, -0.14) + g(0.29, 0.009, 1) + g(0.318, 0.01, -0.28) + g(0.5, 0.045, 0.22);
}

export function MedicalBackground({ calm = false }: { calm?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const calmRef = useRef(calm);
  calmRef.current = calm;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = 1;
    let cells: Cell[] = [];
    let pluses: Plus[] = [];
    const rings: Ring[] = [];
    let colors = { pulse: "224,71,91", accent: "10,143,135", ink: "15,37,48" };

    // heart monitor state
    let trace = new Float32Array(0);
    let head = 0;
    let beatT = 0; // position within the current beat, 0..1
    let bpm = 68;
    let targetBpm = 68;

    // pointer
    let px = -9999, py = -9999, ox = 0, oy = 0, sox = 0, soy = 0, speed = 0;
    let lastMove = 0;

    const readColors = () => {
      const s = getComputedStyle(document.documentElement);
      colors = {
        pulse: rgb(s.getPropertyValue("--pulse") || "#e0475b"),
        accent: rgb(s.getPropertyValue("--accent") || "#0a8f87"),
        ink: rgb(s.getPropertyValue("--ink") || "#0f2530"),
      };
    };

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth;
      H = innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(26, Math.max(9, (W * H) / 52000)));
      const scale = W < 700 ? 0.75 : 1;
      cells = Array.from({ length: n }, () => {
        const z = 0.35 + Math.random() * 0.65;
        const bx = (0.08 + Math.random() * 0.22) * z * (Math.random() < 0.5 ? 1 : -1);
        const by = (Math.random() - 0.5) * 0.12;
        return {
          x: Math.random() * W,
          y: Math.random() * H,
          z,
          r: (12 + 30 * z) * scale,
          vx: bx,
          vy: by,
          bx,
          by,
          t: Math.random() * Math.PI * 2,
          ts: 0.004 + Math.random() * 0.01,
          rot: Math.random() * Math.PI,
          rs: (Math.random() - 0.5) * 0.004,
        };
      });
      cells.sort((a, b) => a.z - b.z);
      pluses = Array.from({ length: Math.round(n * 0.8) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        s: 3 + Math.random() * 4,
        v: 0.1 + Math.random() * 0.25,
        ph: Math.random() * Math.PI * 2,
      }));
      trace = new Float32Array(Math.ceil(W / 2) + 2).fill(0);
      head = 0;
      readColors();
    };

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (px > -9000) {
        const d = Math.hypot(e.clientX - px, e.clientY - py);
        const dt = Math.max(8, now - lastMove);
        speed = Math.min(4, speed * 0.7 + (d / dt) * 0.3);
      }
      lastMove = now;
      px = e.clientX;
      py = e.clientY;
      ox = px / W - 0.5;
      oy = py / H - 0.5;
    };
    const onLeave = () => {
      px = py = -9999;
    };
    const beat = () => {
      beatT = 0.2; // jump straight to the spike
      targetBpm = Math.min(150, targetBpm + 6);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.(SKIP)) return;
      rings.push({ x: e.clientX, y: e.clientY, t0: performance.now() });
      for (const c of cells) {
        const dx = c.x - e.clientX, dy = c.y - e.clientY;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 260) {
          const f = (1 - d / 260) * 4;
          c.vx += (dx / d) * f;
          c.vy += (dy / d) * f;
        }
      }
      beat();
    };
    const onPulse = () => beat();

    const drawCell = (c: Cell, a: number, glow: number) => {
      const x = c.x + sox * c.z * 30;
      const y = c.y + soy * c.z * 22;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.rot);
      ctx.scale(1, 0.32 + 0.68 * Math.abs(Math.cos(c.t)));
      const r = c.r;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      const al = a * (1 + glow);
      g.addColorStop(0, `rgba(${colors.pulse},${0.1 * al})`);
      g.addColorStop(0.5, `rgba(${colors.pulse},${0.2 * al})`);
      g.addColorStop(0.8, `rgba(${colors.pulse},${0.42 * al})`);
      g.addColorStop(0.95, `rgba(${colors.pulse},${0.3 * al})`);
      g.addColorStop(1, `rgba(${colors.pulse},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawHelix = (time: number, k: number) => {
      // sits in the gap between the sidebar and the centred content (the doctor is on the right)
      const side = W > 860 ? 272 : 0;
      const contentLeft = side + (W - side) / 2 - 380;
      const gapW = contentLeft - side;
      if (gapW < 120) return;
      const cx = side + gapW / 2 + sox * 18;
      const amp = Math.min(46, gapW * 0.28);
      const wave = 240;
      const near = px > -9000 ? Math.max(0, 1 - Math.abs(px - cx) / 260) : 0;
      helixPhase += (0.012 + near * 0.05) * k;
      const step = 15;
      for (let y = -30; y < H + 30; y += step) {
        const th = (y / wave) * Math.PI * 2 + helixPhase;
        const xa = cx + amp * Math.sin(th);
        const xb = cx + amp * Math.sin(th + Math.PI);
        const da = (Math.cos(th) + 1) / 2;
        const db = 1 - da;
        if (Math.round(y / step) % 2 === 0) {
          ctx.strokeStyle = `rgba(${colors.accent},${0.1 * k})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(xa, y);
          ctx.lineTo(xb, y);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${colors.accent},${(0.12 + 0.3 * da) * k})`;
        ctx.beginPath();
        ctx.arc(xa, y, 1.6 + 2.4 * da, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${colors.pulse},${(0.1 + 0.26 * db) * k})`;
        ctx.beginPath();
        ctx.arc(xb, y, 1.6 + 2.4 * db, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    let helixPhase = 0;

    const drawEcg = (k: number, dt: number) => {
      const base = calmRef.current ? H - 64 : H * 0.93;
      const amp = Math.min(60, H * 0.07);
      // advance the sweep: one screen width every 3.2 s, sampled every 2px
      const cols = trace.length;
      const adv = (dt / 3200) * cols;
      const beatsPerMs = bpm / 60000;
      let steps = Math.max(1, Math.round(adv));
      while (steps-- > 0) {
        beatT += (beatsPerMs * dt) / Math.max(1, Math.round(adv));
        if (beatT >= 1) beatT -= 1;
        head = (head + 1) % cols;
        trace[head] = ecg(beatT);
      }
      const gap = 18; // erased columns ahead of the pen, like a real monitor
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.shadowColor = `rgba(${colors.pulse},${0.6 * k})`;
      ctx.shadowBlur = 8;
      let started = false;
      ctx.beginPath();
      for (let i = 0; i < cols; i++) {
        const age = (head - i + cols) % cols; // 0 at the pen
        if (age > cols - gap) {
          started = false;
          continue;
        }
        const x = i * 2;
        const y = base - trace[i] * amp;
        if (!started) {
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${colors.pulse},${0.55 * k})`;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // the bright pen tip
      const hx = head * 2, hy = base - trace[head] * amp;
      ctx.fillStyle = `rgba(${colors.pulse},${0.9 * k})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fill();
      // heart-rate readout
      ctx.font = `500 11px ui-monospace, "JetBrains Mono", Menlo, monospace`;
      ctx.fillStyle = `rgba(${colors.pulse},${0.7 * k})`;
      ctx.textAlign = "right";
      ctx.fillText(`♥ ${Math.round(bpm)} BPM`, W - 20, base - amp - 14);
    };

    let raf = 0;
    let last = performance.now();
    let running = true;

    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const k = calmRef.current ? 0.5 : 1;
      ctx.clearRect(0, 0, W, H);

      sox += (ox - sox) * 0.05;
      soy += (oy - soy) * 0.05;
      speed *= 0.96;
      targetBpm += (68 + speed * 22 - targetBpm) * 0.01;
      bpm += (targetBpm - bpm) * 0.05;

      // plus signs
      ctx.lineWidth = 1.4;
      for (const p of pluses) {
        p.y -= p.v * (dt / 16);
        if (p.y < -10) {
          p.y = H + 10;
          p.x = Math.random() * W;
        }
        const tw = 0.5 + 0.5 * Math.sin(now * 0.002 + p.ph);
        ctx.strokeStyle = `rgba(${colors.accent},${(0.08 + 0.22 * tw) * k})`;
        ctx.beginPath();
        ctx.moveTo(p.x - p.s, p.y);
        ctx.lineTo(p.x + p.s, p.y);
        ctx.moveTo(p.x, p.y - p.s);
        ctx.lineTo(p.x, p.y + p.s);
        ctx.stroke();
      }

      drawHelix(now, k);

      // cells
      for (const c of cells) {
        const sx = c.x + sox * c.z * 30, sy = c.y + soy * c.z * 22;
        let glow = 0;
        if (px > -9000) {
          const dx = sx - px, dy = sy - py;
          const d = Math.hypot(dx, dy) || 1;
          const R = 150 + c.r;
          if (d < R) {
            const f = (1 - d / R) * 0.35;
            c.vx += (dx / d) * f;
            c.vy += (dy / d) * f;
            glow = (1 - d / R) * 0.8;
          }
        }
        c.vx += (c.bx - c.vx) * 0.02;
        c.vy += (c.by - c.vy) * 0.02;
        c.x += c.vx * (dt / 16);
        c.y += c.vy * (dt / 16);
        c.t += c.ts * (dt / 16);
        c.rot += c.rs * (dt / 16);
        const m = c.r + 40;
        if (c.x < -m) c.x = W + m;
        if (c.x > W + m) c.x = -m;
        if (c.y < -m) c.y = H + m;
        if (c.y > H + m) c.y = -m;
        drawCell(c, (0.35 + 0.65 * c.z) * k, glow);
      }

      // click rings
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const t = (now - r.t0) / 900;
        if (t >= 1) {
          rings.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(${colors.accent},${(1 - t) * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 10 + t * 170, 0, Math.PI * 2);
        ctx.stroke();
      }

      drawEcg(k, dt);
      if (running) raf = requestAnimationFrame(frame);
    };

    const onVis = () => {
      if (reduce) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => readColors();

    resize();
    addEventListener("resize", resize);
    scheme.addEventListener?.("change", onScheme);
    if (reduce) {
      // one still frame with a filled-in trace
      running = false;
      for (let i = 0; i < 400; i++) frame(last + 16 * i);
    } else {
      addEventListener("pointermove", onMove);
      document.addEventListener("pointerleave", onLeave);
      addEventListener("click", onClick);
      addEventListener("med-pulse", onPulse);
      document.addEventListener("visibilitychange", onVis);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      removeEventListener("click", onClick);
      removeEventListener("med-pulse", onPulse);
      document.removeEventListener("visibilitychange", onVis);
      scheme.removeEventListener?.("change", onScheme);
    };
  }, []);

  return <canvas ref={ref} className="med-bg" aria-hidden="true" />;
}
