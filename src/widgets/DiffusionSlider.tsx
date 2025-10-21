//@ts-nocheck
"use client"

import React, { useMemo, useState } from "react";

/**
 * WrappedGaussianDial
 * Visualizes the wrapped Gaussian density on a circular dial (period L),
 * at a single time t. A slider lets you adjust t.
 *
 * Angle θ corresponds to clock position in [0, L) seconds.
 * Radius encodes the density at that θ (scaled to fit the SVG nicely).
 *
 * Defaults correspond to the drift/diffusion from your ±1 / +3 example:
 *   μ = 1, σ = 2, L = 60.
 */
export default function WrappedGaussianDial({
  L = 60,
  mu = 1,
  sigma = 2,
  width = 520,
  height = 560,
  nTheta = 720,
  stdCoverage = 5,
  baseRadius = 150,
  ringThickness = 28
}: {
  L?: number;
  mu?: number;
  sigma?: number;
  width?: number;
  height?: number;
  nTheta?: number;
  stdCoverage?: number;
  baseRadius?: number;
  ringThickness?: number;
}) {
  const [t, setT] = useState(5);

  const cx = width / 2;
  const cy = (height - 60) / 2 + 10; // room for legend/controls under SVG

  const { densities, maxDensity, minDensity, meanDensity } = useMemo(() => {
    const twoPi = Math.PI * 2;
    const theta = new Float64Array(nTheta);
    const thetaSec = new Float64Array(nTheta);
    for (let i = 0; i < nTheta; i++) {
      theta[i] = (i / nTheta) * twoPi;                 // 0..2π (clock seconds)
      thetaSec[i] = (theta[i] / twoPi) * L;           // map to seconds on dial
    }
    const dens = wrappedGaussianDensity(thetaSec, t, mu, sigma, L, stdCoverage);
    let maxD = 0, minD = Number.POSITIVE_INFINITY, sumD = 0;
    for (let i = 0; i < nTheta; i++) {
      const d = dens[i];
      if (d > maxD) maxD = d;
      if (d < minD) minD = d;
      sumD += d;
    }
    return { densities: dens, maxDensity: maxD, minDensity: minD, meanDensity: sumD / nTheta };
  }, [L, mu, sigma, t, nTheta, stdCoverage]);

  // Color mapping: normalize by max density for a vivid heat map
  const colorFor = (d: number) => hslHeat(d / Math.max(1e-12, maxDensity));

  // Build ring segments as tiny quads between angles [i, i+1]
  const segments: { path: string; color: string }[] = [];
  const rOuter = baseRadius + ringThickness / 2;
  const rInner = baseRadius - ringThickness / 2;

  for (let i = 0; i < nTheta; i++) {
    const th0 = (i / nTheta) * 2 * Math.PI;
    const th1 = ((i + 1) / nTheta) * 2 * Math.PI;
    // Geometry angle: 0 at top and increasing CLOCKWISE
    const phi0 = Math.PI / 2 - th0;
    const phi1 = Math.PI / 2 - th1;

    const [x0o, y0o] = polarToXY(cx, cy, rOuter, phi0);
    const [x1o, y1o] = polarToXY(cx, cy, rOuter, phi1);
    const [x1i, y1i] = polarToXY(cx, cy, rInner, phi1);
    const [x0i, y0i] = polarToXY(cx, cy, rInner, phi0);

    const d = `M ${x0o} ${y0o} L ${x1o} ${y1o} L ${x1i} ${y1i} L ${x0i} ${y0i} Z`;
    segments.push({ path: d, color: colorFor(densities[i]) });
  }

  // Tick marks every 5 seconds, labels every 10
  const tickEvery = 5;
  const ticks: { x1: number; y1: number; x2: number; y2: number; label?: string; lx?: number; ly?: number }[] = [];
  for (let s = 0; s < L; s += tickEvery) {
    const th = (2 * Math.PI) * (s / L);
    const phi = Math.PI / 2 - th; // top and clockwise
    const inner = baseRadius - ringThickness / 2 - 10;
    const outer = baseRadius - ringThickness / 2 - 2;
    const [x1, y1] = polarToXY(cx, cy, inner, phi);
    const [x2, y2] = polarToXY(cx, cy, outer, phi);
    const item: any = { x1, y1, x2, y2 };
    if (s % 10 === 0) {
      const [lx, ly] = polarToXY(cx, cy, inner - 12, phi);
      item.label = `${s}s`;
      item.lx = lx; item.ly = ly;
    }
    ticks.push(item);
  }

  return (
    <div className="w-full max-w-[820px] mx-auto p-4">
      <div className="flex items-end justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl font-semibold">Wrapped Gaussian Clock Heat Ring</h2>
          <p className="text-sm text-gray-600">μ = {mu}, σ = {sigma}, L = {L}s · 0 at 12 o'clock · clockwise seconds</p>
        </div>
        <div className="text-sm text-gray-600">
          <div>t = <span className="font-medium">{t.toFixed(1)}</span> s</div>
          <div className="opacity-80">max ρ ≈ {maxDensity.toFixed(3)} · mean ρ ≈ {meanDensity.toFixed(3)} {minDensity}</div>
        </div>
      </div>

      <div className="relative bg-white rounded-2xl shadow p-3">
        <svg width={width} height={height - 60} viewBox={`0 0 ${width} ${height - 60}`}>
          {/* Base dial guide */}
          <circle cx={cx} cy={cy} r={baseRadius} fill="none" stroke="#e5e7eb" strokeWidth={2} />

          {/* Tick marks & labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#9ca3af" strokeWidth={t.label ? 2 : 1} />
              {t.label && (
                <text x={t.lx} y={t.ly} fontSize={10} textAnchor="middle" dominantBaseline="middle" fill="#6b7280">
                  {t.label}
                </text>
              )}
            </g>
          ))}

          {/* Heat map ring (many tiny quads) */}
          {segments.map((seg, idx) => (
            <path key={idx} d={seg.path} fill={seg.color} stroke="none" />
          ))}

          {/* Center dot */}
          <circle cx={cx} cy={cy} r={3} fill="#111827" />
        </svg>

        {/* Legend */}
        <div className="mt-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">low</span>
            <div className="h-3 flex-1 rounded-full overflow-hidden" style={{
              background: `linear-gradient(90deg, ${hslHeat(0)}, ${hslHeat(0.25)}, ${hslHeat(0.5)}, ${hslHeat(0.75)}, ${hslHeat(1)})`
            }} />
            <span className="text-xs text-gray-600">high</span>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center gap-3">
          <label className="text-sm font-medium w-24">Time (s)</label>
          <input
            placeholder="time"
            type="range"
            min={0.1}
            max={120}
            step={0.1}
            value={t}
            onChange={(e) => setT(parseFloat(e.target.value))}
            className="w-full accent-blue-600"
          />
          <div className="w-16 text-right tabular-nums text-sm">{t.toFixed(1)}</div>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-600">
        Color encodes density along the rim (blue→red). Angle 0s is at the top; angles increase clockwise. At time t, the
        wrapped Gaussian has mean μ·t (mod L) and variance σ²·t.
      </p>
    </div>
  );
}

/** Helpers */
function polarToXY(cx: number, cy: number, r: number, phi: number): [number, number] {
  const x = cx + r * Math.cos(phi);
  const y = cy - r * Math.sin(phi); // SVG y axis down
  return [x, y];
}

// Simple blue→cyan→yellow→red heat scale in HSL
function hslHeat(u01: number): string {
  const u = Math.max(0, Math.min(1, u01));
  const hue = 240 * (1 - u); // 240 (blue) → 0 (red)
  const sat = 100;           // %
  const light = 50;          // %
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/** Compute wrapped Gaussian density on [0, L): vectorized over thetaSec[] */
function wrappedGaussianDensity(
  thetaSec: Float64Array,
  t: number,
  mu: number,
  sigma: number,
  L: number,
  stdCoverage = 5
): Float64Array {
  const out = new Float64Array(thetaSec.length);
  const varT = Math.max(1e-9, sigma * sigma * Math.max(t, 1e-9));
  const std = Math.sqrt(varT);
  const M = Math.ceil((stdCoverage * std) / L) + 1;
  const coeff = 1 / Math.sqrt(2 * Math.PI * varT);
  for (let i = 0; i < thetaSec.length; i++) {
    const th = thetaSec[i];
    let sum = 0;
    for (let m = -M; m <= M; m++) {
      const x = th + m * L;
      const z = (x - mu * t);
      sum += Math.exp(-0.5 * (z * z) / varT);
    }
    out[i] = coeff * sum;
  }
  return out;
}
