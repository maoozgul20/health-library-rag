"use client";

// See-through line illustrations behind the chat: a hospital along the bottom and a
// doctor with a stethoscope on the right. Both drift with the pointer (parallax); the
// hospital windows flicker on and off, the doctor breathes and blinks, and the
// stethoscope sways. Everything is drawn here as SVG, so there are no image files.

import { useEffect, useMemo, useRef } from "react";

function seeded(n: number) {
  let s = n;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type Block = { x: number; y: number; w: number; h: number; cols: number; rows: number };

const BLOCKS: Block[] = [
  { x: 40, y: 190, w: 210, h: 170, cols: 4, rows: 4 },
  { x: 270, y: 70, w: 360, h: 290, cols: 7, rows: 6 },
  { x: 650, y: 150, w: 210, h: 210, cols: 4, rows: 5 },
];

export function MedicalScene({ calm = false }: { calm?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  // pointer parallax through two CSS variables
  useEffect(() => {
    const el = ref.current!;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const move = (e: PointerEvent) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
    };
    const tick = () => {
      x += (tx - x) * 0.05;
      y += (ty - y) * 0.05;
      el.style.setProperty("--px", x.toFixed(4));
      el.style.setProperty("--py", y.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    addEventListener("pointermove", move);
    raf = requestAnimationFrame(tick);
    return () => {
      removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);

  const windows = useMemo(() => {
    const rnd = seeded(7);
    const out: { x: number; y: number; w: number; h: number; lit: boolean; delay: number; dur: number }[] = [];
    for (const b of BLOCKS) {
      const gx = b.w / b.cols, gy = (b.h - 40) / b.rows;
      for (let r = 0; r < b.rows; r++)
        for (let c = 0; c < b.cols; c++)
          out.push({
            x: b.x + c * gx + gx * 0.22,
            y: b.y + 18 + r * gy + gy * 0.2,
            w: gx * 0.56,
            h: gy * 0.55,
            lit: rnd() < 0.45,
            delay: -rnd() * 14,
            dur: 6 + rnd() * 12,
          });
    }
    return out;
  }, []);

  return (
    <div ref={ref} className={`med-scene ${calm ? "calm" : ""}`} aria-hidden="true">
      {/* ---------- hospital ---------- */}
      <svg className="hospital" viewBox="0 0 900 380" preserveAspectRatio="xMidYMax meet">
        <g className="h-fill">
          {BLOCKS.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="4" />
          ))}
        </g>
        <g className="h-line">
          {BLOCKS.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="4" />
          ))}
          {/* roof lines */}
          <path d="M30 190h230M260 70h380M640 150h230" />
          {/* entrance canopy and doors */}
          <path d="M380 300h140l14 18H366z" />
          <rect x="410" y="318" width="80" height="42" />
          <path d="M450 318v42" />
          {/* helipad on the right wing */}
          <ellipse cx="755" cy="146" rx="48" ry="7" />
          {/* ground */}
          <path d="M0 360h900" />
          {/* trees */}
          <circle cx="20" cy="330" r="22" />
          <path d="M20 352v8" />
          <circle cx="880" cy="326" r="26" />
          <path d="M880 352v8" />
          <circle cx="258" cy="336" r="16" />
          <path d="M258 352v8" />
        </g>
        {/* the cross sign on top of the main building */}
        <g className="h-cross">
          <rect x="425" y="18" width="50" height="50" rx="8" />
          <path d="M450 28v30M435 43h30" />
        </g>
        <g className="h-windows">
          {windows.map((w, i) => (
            <rect
              key={i}
              x={w.x}
              y={w.y}
              width={w.w}
              height={w.h}
              rx="2"
              className={w.lit ? "lit" : ""}
              style={{ animationDelay: `${w.delay}s`, animationDuration: `${w.dur}s` }}
            />
          ))}
        </g>
      </svg>

      {/* ---------- doctor with stethoscope ---------- */}
      <svg className="doctor" viewBox="0 0 320 520" preserveAspectRatio="xMidYMax meet">
        <g className="breathe">
          {/* coat body fill */}
          <path
            className="d-coat"
            d="M146 186C110 192 86 206 76 240L64 380L96 384L104 520H216L224 384L256 380L244 240C234 206 210 192 174 186L160 214Z"
          />
          <g className="d-line">
            {/* hair, back and ponytail */}
            <path d="M120 120C114 72 142 52 166 54C194 56 212 80 205 124C204 138 200 150 196 160" />
            <path d="M120 120C117 142 121 158 128 166" />
            <path d="M203 92C226 98 234 124 224 150C218 164 208 172 200 176" />
            {/* face */}
            <ellipse cx="161" cy="122" rx="37" ry="45" />
            <path d="M125 104C142 90 164 84 188 88C198 92 203 100 205 110" />
            <path d="M156 128l-3 11 6 1" />
            <path d="M151 150q9 7 18 0" />
            {/* neck */}
            <path d="M149 165l-2 21M173 165l2 21" />
            {/* coat outline, lapels, scrubs neckline */}
            <path d="M146 186C110 192 86 206 76 240L64 380L96 384L104 520" />
            <path d="M174 186C210 192 234 206 244 240L256 380L224 384L216 520" />
            <path d="M146 186L131 201L150 262L160 300M174 186L189 201L170 262L160 300" />
            <path d="M148 188L160 214L172 188" />
            <path d="M160 300V520" />
            <path d="M102 300l-2 82M218 300l2 82" />
            {/* chest pocket with pens, name badge */}
            <rect x="112" y="322" width="34" height="30" rx="3" />
            <path d="M120 322v-14M128 322v-10M136 322v-16" />
            <rect x="184" y="246" width="24" height="32" rx="3" />
            <path d="M190 258h12M190 266h8" />
            {/* hands */}
            <circle cx="80" cy="394" r="12" />
            <circle cx="240" cy="394" r="12" />
          </g>
          {/* eyes blink */}
          <g className="d-line eyes">
            <path d="M141 124q6-5 12 0M169 124q6-5 12 0" />
          </g>
          {/* stethoscope around the neck, swaying a little */}
          <g className="steth">
            <path d="M141 181C127 200 125 236 135 268C141 290 150 304 157 318" />
            <path d="M181 181C195 200 198 236 191 262C187 276 183 286 180 296" />
            <path d="M157 318C161 330 170 336 177 344" />
            <path d="M141 181C139 171 145 165 151 167M181 181C183 171 177 165 171 167" />
            <circle cx="183" cy="356" r="12" />
            <circle cx="183" cy="356" r="5" />
          </g>
        </g>
      </svg>
    </div>
  );
}
