"use client";

// The animated, interactive background: a bright, softly blurred hospital room with
// floating glass crosses, a glowing heart orb that beats (faster when you ask), a heart
// monitor, capsules, a glass sphere and drifting bokeh lights. Every layer moves with
// the pointer at its own depth, so the room feels 3D.

import { useEffect, useRef } from "react";

const BOKEH = Array.from({ length: 22 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 97.13 + n * 13.7) * 10000;
    return x - Math.floor(x);
  };
  return { left: r(1) * 100, top: r(2) * 100, size: 6 + r(3) * 26, dur: 14 + r(4) * 18, delay: -r(5) * 20, o: 0.25 + r(6) * 0.5 };
});

function GlassCross({ className }: { className: string }) {
  return (
    <svg className={`gcross ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`gc-${className}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bff3fa" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#4fd0e0" stopOpacity="0.7" />
          <stop offset="1" stopColor="#1a9fb4" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <path
        d="M38 8h24a6 6 0 016 6v18a6 6 0 006 6h18a6 6 0 016 6v12a6 6 0 01-6 6H74a6 6 0 00-6 6v18a6 6 0 01-6 6H38a6 6 0 01-6-6V74a6 6 0 00-6-6H8a6 6 0 01-6-6V44a6 6 0 016-6h18a6 6 0 006-6V14a6 6 0 016-6z"
        fill={`url(#gc-${className})`}
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.5"
      />
      <path d="M40 14h16" stroke="rgba(255,255,255,0.9)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function AmbientScene({ beat = 0 }: { beat?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const heart = useRef<HTMLDivElement>(null);

  // pointer parallax through CSS variables
  useEffect(() => {
    // set on the page root so the doctor and the heart can use them too
    const el = document.documentElement;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const move = (e: PointerEvent) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
    };
    const tick = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
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

  // the heart races for a moment whenever a question is asked or answered
  useEffect(() => {
    if (!beat || !heart.current) return;
    const h = heart.current;
    h.classList.remove("racing");
    void h.offsetWidth;
    h.classList.add("racing");
    const t = setTimeout(() => h.classList.remove("racing"), 3200);
    return () => clearTimeout(t);
  }, [beat]);

  return (
    <>
    <div ref={ref} className="ambient" aria-hidden="true">
      {/* the room, far away and blurred */}
      <div className="room depth-1">
        <span className="light l1" />
        <span className="light l2" />
        <span className="light l3" />
        <span className="window w1" />
        <span className="window w2" />
        <span className="window w3" />
        <span className="door" />
        <span className="plant">
          <i />
          <i />
          <i />
          <b />
        </span>
        <span className="floor" />
      </div>

      {/* heart monitor on the right wall */}
      <div className="monitor depth-2">
        <svg viewBox="0 0 300 160">
          <rect x="1" y="1" width="298" height="158" rx="14" className="mon-frame" />
          <path className="mon-grid" d="M0 40h300M0 80h300M0 120h300M60 0v160M120 0v160M180 0v160M240 0v160" />
          <polyline className="mon-ecg" points="0,92 40,92 52,92 60,70 68,112 76,40 86,120 94,92 130,92 142,84 154,92 190,92 202,92 210,70 218,112 226,40 236,120 244,92 300,92" />
        </svg>
      </div>

      {/* faint heartbeat line across the left wall */}
      <svg className="wall-ecg depth-2" viewBox="0 0 600 120" preserveAspectRatio="none">
        <polyline points="0,70 120,70 150,70 165,40 180,100 195,15 212,110 228,70 300,70 330,62 350,70 600,70" />
      </svg>

      {/* bokeh lights */}
      <div className="bokeh depth-2">
        {BOKEH.map((b, i) => (
          <i
            key={i}
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: b.size,
              height: b.size,
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.delay}s`,
              opacity: b.o,
            }}
          />
        ))}
      </div>

      {/* floating glass crosses */}
      <div className="depth-3">
        <GlassCross className="c1" />
        <GlassCross className="c2" />
        <GlassCross className="c3" />
        <GlassCross className="c4" />
        <GlassCross className="c5" />
      </div>

      {/* capsules and a glass sphere, bottom right */}
      <div className="depth-4">
        <span className="capsule cap1">
          <i />
        </span>
        <span className="capsule cap2">
          <i />
        </span>
        <span className="sphere" />
      </div>
    </div>

      {/* the glowing heart orb, bottom left, in front of the doctor */}
      <div ref={heart} className="heart-orb" aria-hidden="true">
        <span className="orbit o1" />
        <span className="orbit o2" />
        <span className="pad" />
        <svg viewBox="0 0 200 180" className="heart">
          <defs>
            <radialGradient id="hg" cx="0.35" cy="0.3" r="0.85">
              <stop offset="0" stopColor="#e6fcff" />
              <stop offset="0.35" stopColor="#6fe0ee" />
              <stop offset="0.8" stopColor="#1c9fbe" />
              <stop offset="1" stopColor="#0d6f93" />
            </radialGradient>
          </defs>
          <path
            d="M100 170C60 140 8 108 8 60 8 30 32 8 60 8c18 0 32 9 40 24C108 17 122 8 140 8c28 0 52 22 52 52 0 48-52 80-92 110z"
            fill="url(#hg)"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="2"
          />
          <ellipse cx="62" cy="44" rx="26" ry="14" fill="rgba(255,255,255,0.55)" transform="rotate(-25 62 44)" />
          <polyline className="heart-ecg" points="22,92 66,92 78,92 88,66 100,120 112,50 124,106 132,92 178,92" />
        </svg>
      </div>
    </>
  );
}
