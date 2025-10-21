"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * AnalogClockSSE
 * React component that consumes a Server‑Sent Events stream where each message is a
 * JSON string with fields: { hour: number, minute: number, second: number }.
 * It draws the corresponding time as an analog clock on a <canvas>.
 *
 * - Default canvas CSS size is 400×400 but it will resize to fit the parent by default
 * - Hi‑DPI aware (uses devicePixelRatio for crisp lines)
 * - Minimal dependencies, pure Canvas 2D
 *
 * Example:
 *   <AnalogClockSSE url={process.env.NEXT_PUBLIC_STREAM_URL!} />
 */
export type AnalogClockSSEProps = {
  /** SSE endpoint URL (e.g., https://<cloud-run-service>/stream) */
  url: string;
  /** Pass through to EventSource for cookie‑based auth */
  withCredentials?: boolean;
  /** If true (default), canvas scales to the parent element size while keeping aspect ratio */
  responsive?: boolean;
  /** Fallback CSS size when responsive, or fixed CSS size when responsive=false */
  width?: number; // CSS pixels
  height?: number; // CSS pixels
  /** Draw face numerals 1..12 (default true) */
  showNumbers?: boolean;
  /** Extra class for outer wrapper */
  className?: string;
};

export default function AnalogClockSSE({
  url,
  withCredentials = false,
  responsive = true,
  width = 400,
  height = 400,
  showNumbers = true,
  className = "",
}: AnalogClockSSEProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error" | "paused">("idle");
  const [time, setTime] = useState<{ hour: number; minute: number; second: number } | null>(null);

  const cssSize = useMemo(() => ({ w: width, h: height }), [width, height]);

  // Maintain an EventSource connection
  useEffect(() => {
    if (!url) return;

    

    setStatus("connecting");
    const es = new EventSource(url, { withCredentials });

    es.onopen = () => setStatus("open");
    es.onerror = () => setStatus("error");

    es.onmessage = (evt) => {
      try {
        console.log(evt.data)
        const obj = JSON.parse(evt.data);
        // Accept numbers or numeric strings
        const h = (Number(obj.hour)-4)%12;
        const m = Number(obj.minute);
        const s = Number(obj.second);
        if ([h, m, s].every((n) => Number.isFinite(n))) {
          setTime({ hour: h, minute: m, second: s });
        }
      } catch {
        // ignore malformed payloads
      }
    };

    return () => es.close();
  }, [url, withCredentials]);

  // ResizeObserver to keep canvas crisp on Hi‑DPI and when parent resizes
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const setBackingStoreSize = () => {
      const cssW = responsive ? wrapper.clientWidth : cssSize.w;
      const cssH = responsive ? wrapper.clientHeight : cssSize.h;

      // Avoid zero sizes (e.g., hidden tabs)
      const W = Math.max(10, Math.floor(cssW));
      const H = Math.max(10, Math.floor(cssH));

      // Set the canvas internal resolution; CSS size is controlled by style
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale all draws by DPR

      // Redraw with latest time
      drawClock(canvas, time ?? { hour: 0, minute: 0, second: 0 }, showNumbers);
    };

    const ro = new ResizeObserver(setBackingStoreSize);
    ro.observe(wrapper);

    // Initial sizing
    setBackingStoreSize();

    return () => ro.disconnect();
  }, [responsive, cssSize.w, cssSize.h, showNumbers, time]);

  // Redraw when time changes
  useEffect(() => {
    console.log(time)
    const canvas = canvasRef.current;
    if (!canvas || !time) return;
    drawClock(canvas, time ?? { hour: 0, minute: 0, second: 0 }, showNumbers);
  }, [time, showNumbers]);

  return (
    <div
      ref={wrapperRef}
      className={
        "relative select-none " +
        (responsive ? "w-full aspect-square max-w-full " : "") +
        className
      }
      style={responsive ? undefined : { width, height }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: "block", width: "100%", height: "100%" }}
        aria-label="Analog clock"
      />

      {/* Small status dot in the corner */}
      <div
        title={status}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 10,
          height: 10,
          borderRadius: 999,
          background:
            status === "open"
              ? "#10b981" // green
              : status === "connecting"
              ? "#f59e0b" // amber
              : status === "paused"
              ? "#9ca3af" // gray
              : status === "error"
              ? "#ef4444" // red
              : "#d1d5db", // neutral
          boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
        }}
      />
    </div>
  );
}

/**
 * Draw the full analog clock for the given time.
 */
function drawClock(
  canvas: HTMLCanvasElement,
  t: { hour: number; minute: number; second: number },
  showNumbers: boolean
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = (canvas.style.width ? parseFloat(canvas.style.width) : canvas.width) || 400;
  const H = (canvas.style.height ? parseFloat(canvas.style.height) : canvas.height) || 400;
  const size = Math.min(W, H);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.45; // padding around

  // Clear
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to CSS pixels (after DPR set in effect)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);

  // Face background
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111827"; // slate-900
  ctx.stroke();

  // Minute & hour ticks
  for (let i = 0; i < 60; i++) {
    const isHour = i % 5 === 0;
    const angle = (i * Math.PI) / 30; // 360/60
    const r1 = radius - (isHour ? 14 : 8);
    const r2 = radius - 2;
    const x1 = r1 * Math.sin(angle);
    const y1 = -r1 * Math.cos(angle);
    const x2 = r2 * Math.sin(angle);
    const y2 = -r2 * Math.cos(angle);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = isHour ? 3 : 1;
    ctx.strokeStyle = "#111827";
    ctx.stroke();
  }

  // Numerals (1..12)
  if (showNumbers) {
    ctx.fillStyle = "#111827";
    ctx.font = `${Math.floor(radius * 0.16)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let n = 1; n <= 12; n++) {
      const angle = (n * Math.PI) / 6; // 360/12
      const r = radius * 0.78;
      const x = r * Math.sin(angle);
      const y = -r * Math.cos(angle);
      ctx.fillText(String(n), x, y);
    }
  }

  // Compute angles
  const h = ((t.hour % 12) + t.minute / 60 + t.second / 3600) * (Math.PI / 6); // 30° per hour
  const m = (t.minute + t.second / 60) * (Math.PI / 30); // 6° per minute
  const s = t.second * (Math.PI / 30); // 6° per second

  // Hour hand
  drawHand(ctx, h, radius * 0.5, 6, "#111827");
  // Minute hand
  drawHand(ctx, m, radius * 0.7, 4, "#1f2937");
  // Second hand
  drawHand(ctx, s, radius * 0.82, 2, "#ef4444");

  // Center cap
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();

  ctx.restore();
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  angleRad: number,
  length: number,
  width: number,
  color: string
) {
  ctx.save();
  ctx.rotate(angleRad);
  ctx.beginPath();
  ctx.moveTo(0, 8); // tail
  ctx.lineTo(0, -length);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

/**
 * Simple demo wrapper. Set NEXT_PUBLIC_STREAM_URL to your Cloud Run /stream endpoint.
 */
export function AnalogClockSSEDemo() {
  const url = process.env.NEXT_PUBLIC_STREAM_URL || "";

  return (
    <div style={{ maxWidth: 480, margin: "1rem auto", padding: "0 1rem" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        
      </div>

      <AnalogClockSSE url={url} responsive width={400} height={400} />
    </div>
  );
}
