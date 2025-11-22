"use client"
import React, { useMemo, useRef, useState } from "react";

// 5x5 Orthogonal Drag-Select Grid
// - Press/click to start selecting
// - Drag across cells; a cell is added only if it is orthogonally adjacent
//   to ANY already-selected cell
// - Pointer up prints the selected cells to the console and ends the session
// - Pointer leaving the grid (or pointer cancel) aborts and clears selection
// - Works with mouse, pen, and touch via Pointer Events

export default function SquareFlipper({ rows = 5, cols = 5, cellSize = 64 }: {
  rows?: number;
  cols?: number;
  cellSize?: number;
}) {
  type Cell = { r: number; c: number };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const key = (r: number, c: number) => `${r},${c}`;
  const parseKey = (k: string): Cell => {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  };

  const neighbors = (r: number, c: number) => [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ];

  const isOrthAdjacentToAnySelected = (r: number, c: number, set: Set<string>) => {
    // If nothing is selected yet, allow the first selection anywhere
    if (set.size === 0) return true;
    for (const k of set) {
      const { r: rr, c: cc } = parseKey(k);
      if (Math.abs(rr - r) + Math.abs(cc - c) === 1) return true; // Manhattan distance = 1
    }
    return false;
  };

  const grid = useMemo(() => {
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ r, c }))
    );
  }, [rows, cols]);

  const handlePointerDown = (r: number, c: number, e: React.PointerEvent) => {
    e.preventDefault();
    // Begin a new selection session
    setSelected(new Set([key(r, c)]));
    setIsSelecting(true);
    // Capture pointer to receive up/cancel even if it leaves a child
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerEnter = (r: number, c: number, _e: React.PointerEvent) => {
    if (!isSelecting) return;
    setSelected(prev => {
      const next = new Set(prev);
      const k = key(r, c);
      if (!next.has(k) && isOrthAdjacentToAnySelected(r, c, next)) {
        next.add(k);
      }
      return next;
    });
  };

  const finishAndLog = () => {
    if (!isSelecting) return;
    // Print list of squares as array of {r, c}
    const list = Array.from(selected).map(parseKey);
    // Sort for readability (row-major)
    list.sort((a, b) => (a.r - b.r) || (a.c - b.c));
    // Log both raw list and as grid indices
    // Example: [{r:0,c:1}, ...]
    // Also log 1-based human-friendly coordinates
    /* eslint-disable no-console */
    console.log("Selected cells (0-based):", list);
    console.log(
      "Selected cells (1-based r,c):",
      list.map(({ r, c }) => ({ r: r + 1, c: c + 1 }))
    );
    /* eslint-enable no-console */
    setIsSelecting(false);
  };

  const cancelSelection = () => {
    if (!isSelecting) return;
    setIsSelecting(false);
    setSelected(new Set());
  };

  const onPointerUp = () => finishAndLog();
  const onPointerCancel = () => cancelSelection();
  const onPointerLeaveContainer = () => cancelSelection();

  return (
    <div className="w-full flex items-center justify-center py-6">
      <div
        ref={containerRef}
        className="relative select-none"
        style={{
          width: cols * cellSize,
          height: rows * cellSize,
          touchAction: "none", // enables smooth touch-drag capture
          userSelect: "none",
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeaveContainer}
      >
        {/* Grid */}
        {grid.map((row, rIdx) => (
          <div key={rIdx} className="flex">
            {row.map(({ r, c }) => {
              const k = key(r, c);
              const isActive = selected.has(k);
              return (
                <div
                  key={k}
                  onPointerDown={(e) => handlePointerDown(r, c, e)}
                  onPointerEnter={(e) => handlePointerEnter(r, c, e)}
                  className="box-border"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    border: "1px solid #ccc",
                    background: isActive ? "rgba(59,130,246,0.35)" : "white",
                    outline: isActive ? "2px solid rgba(59,130,246,0.9)" : "none",
                    outlineOffset: -2,
                    transition: isSelecting ? "none" : "background 120ms ease, outline-color 120ms ease",
                  }}
                />
              );
            })}
          </div>
        ))}

        {/* Status Overlay */}
        <div className="absolute left-2 top-2 text-xs bg-white/80 rounded px-2 py-1 shadow">
          {isSelecting ? "Selecting… (release to log)" : "Press & drag to select"}
        </div>
      </div>
    </div>
  );
}
