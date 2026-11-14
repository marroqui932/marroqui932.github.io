// Le décor : ciel (étoiles, lune, soleil, nuages), silhouette du village, brume et feu de camp.

import { useMemo } from "react";

export function Sky() {
  const stars = useMemo(
    () =>
      Array.from({ length: 110 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 62,
        s: Math.random() < 0.12 ? 2.6 : 1 + Math.random() * 1.2,
        d: Math.random() * 6,
        t: 2.5 + Math.random() * 4,
      })),
    [],
  );
  return (
    <div className="sky" aria-hidden>
      <div className="sky-layer sky-night" />
      <div className="sky-layer sky-dawn" />
      <div className="sky-layer sky-day" />
      <div className="stars">
        {stars.map((st, i) => (
          <i key={i} style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s`, animationDuration: `${st.t}s` }} />
        ))}
        <span className="shooting" />
      </div>
      <div className="moon">
        <span className="crater c1" />
        <span className="crater c2" />
        <span className="crater c3" />
      </div>
      <div className="sun" />
      <div className="cloud cl1" />
      <div className="cloud cl2" />
      <div className="cloud cl3" />
    </div>
  );
}

/** Silhouette du village, générée une fois : maisons, église, arbres, fenêtres allumées. */
export function Village() {
  const shapes = useMemo(() => {
    const houses: { x: number; w: number; h: number; roof: number; windows: { x: number; y: number }[] }[] = [];
    const trees: { x: number; h: number }[] = [];
    let x = -20;
    while (x < 1600) {
      if (Math.random() < 0.3) {
        trees.push({ x: x + 14, h: 60 + Math.random() * 70 });
        x += 26 + Math.random() * 20;
        continue;
      }
      const w = 50 + Math.random() * 60;
      const h = 40 + Math.random() * 50;
      const windows = Array.from({ length: Math.floor(Math.random() * 3) }, () => ({ x: 8 + Math.random() * (w - 22), y: 12 + Math.random() * (h - 30) }));
      houses.push({ x, w, h, roof: 18 + Math.random() * 22, windows });
      x += w + 4 + Math.random() * 18;
    }
    return { houses, trees };
  }, []);
  const base = 220;
  return (
    <svg className="village" viewBox="0 0 1600 220" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="hill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--hill-top)" />
          <stop offset="1" stopColor="var(--hill-bottom)" />
        </linearGradient>
      </defs>
      <path d="M0 150 Q 200 110 420 140 T 860 130 T 1300 120 T 1600 140 V220 H0 Z" className="hill-far" />
      {shapes.trees.map((t, i) => (
        <path key={`t${i}`} className="vshape" d={`M${t.x} ${base - t.h} L${t.x + 18} ${base - 20} L${t.x - 18} ${base - 20} Z M${t.x} ${base - t.h + 26} L${t.x + 24} ${base} L${t.x - 24} ${base} Z`} />
      ))}
      {/* L'église, sur la droite */}
      <g className="vshape" transform="translate(420 0)">
        <rect x="760" y={base - 120} width="80" height="120" />
        <path d={`M752 ${base - 120} L800 ${base - 170} L848 ${base - 120} Z`} />
        <rect x="785" y={base - 215} width="30" height="60" />
        <path d={`M780 ${base - 215} L800 ${base - 262} L820 ${base - 215} Z`} />
        <rect x="798.5" y={base - 282} width="3" height="22" />
        <rect x="791" y={base - 274} width="18" height="3" />
      </g>
      <circle cx="1220" cy={base - 188} r="8" className="window clock" />
      <path d={`M1208 ${base} V${base - 40} Q1220 ${base - 56} 1232 ${base - 40} V${base} Z`} className="window" />
      {shapes.houses
        .filter((h) => h.x + h.w < 1160 || h.x > 1280)
        .map((h, i) => (
          <g key={`h${i}`}>
            <path className="vshape" d={`M${h.x} ${base} V${base - h.h} L${h.x + h.w / 2} ${base - h.h - h.roof} L${h.x + h.w} ${base - h.h} V${base} Z`} />
            {h.windows.map((w, j) => (
              <rect key={j} className="window" x={h.x + w.x} y={base - h.h + w.y} width="9" height="11" rx="1" style={{ animationDelay: `${(i * 7 + j * 3) % 11}s` }} />
            ))}
          </g>
        ))}
      <rect x="0" y="214" width="1600" height="6" className="vshape" />
    </svg>
  );
}

export function Campfire() {
  const sparks = useMemo(() => Array.from({ length: 12 }, () => ({ x: -18 + Math.random() * 36, d: Math.random() * 3, t: 1.8 + Math.random() * 1.6 })), []);
  return (
    <div className="campfire" aria-hidden>
      <div className="fire-glow" />
      <div className="logs">
        <span />
        <span />
      </div>
      <div className="flames">
        <span className="f1" />
        <span className="f2" />
        <span className="f3" />
        <span className="f4" />
      </div>
      {sparks.map((s, i) => (
        <i key={i} className="spark" style={{ left: `calc(50% + ${s.x}px)`, animationDelay: `${s.d}s`, animationDuration: `${s.t}s` }} />
      ))}
    </div>
  );
}

export function Fog() {
  return (
    <div className="fog" aria-hidden>
      <span className="fog1" />
      <span className="fog2" />
    </div>
  );
}
