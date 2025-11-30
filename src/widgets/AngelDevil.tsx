"use client"
import React, { useState, useRef, useEffect } from "react";
import clsx from "clsx";
// Conway's Angel Problem Interactive Widget
// The Angel moves up to 'power' squares away (Manhattan distance)
// The Devil eats one square per turn
// Angel wins by surviving indefinitely, Devil wins by trapping the Angel

type GridType = "square" | "hex";
type AngelType = "regular" | "nice" | "very-nice" | "fool" | "out-and-out-fool";
type Tool = "select" | "pan" | "highlight";
type AIStrategy = "random" | "greedy";
type Turn = "angel" | "devil";

interface Coord {
  q: number; // column for square grid, axial q for hex
  r: number; // row for square grid, axial r for hex
}

// Helper functions for coordinate systems
const coordKey = (coord: Coord) => `${coord.q},${coord.r}`;
const parseCoordKey = (key: string): Coord => {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
};

// Square grid: Chebyshev distance (king's move - includes diagonals)
const squareDistance = (a: Coord, b: Coord): number => {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
};

// Hex grid: Cube coordinate distance
const hexDistance = (a: Coord, b: Coord): number => {
  // Convert axial to cube coordinates
  const aq = a.q;
  const ar = a.r;
  const as = -aq - ar;
  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(as - bs)) / 2;
};

// Euclidean distance from origin
const euclideanDistance = (coord: Coord): number => {
  return Math.sqrt(coord.q * coord.q + coord.r * coord.r);
};

// Get all cells within power distance
const getCellsInRange = (
  center: Coord,
  power: number,
  gridType: GridType,
  gridSize: number
): Coord[] => {
  const cells: Coord[] = [];
  const distFn = gridType === "hex" ? hexDistance : squareDistance;
  const halfSize = Math.floor(gridSize / 2);

  for (let q = -halfSize; q <= halfSize; q++) {
    for (let r = -halfSize; r <= halfSize; r++) {
      const coord = { q, r };
      if (distFn(center, coord) <= power && distFn(center, coord) > 0) {
        cells.push(coord);
      }
    }
  }
  return cells;
};

// Hex to pixel conversion
const hexToPixel = (q: number, r: number, size: number): { x: number; y: number } => {
  const x = size * (3 / 2 * q);
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return { x, y };
};

// Generate hexagon path
const hexagonPath = (size: number): string => {
  const points: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    points.push([
      size * Math.cos(angle),
      size * Math.sin(angle),
    ]);
  }
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';
};

const ANGEL_TYPE_DESCRIPTIONS: Record<AngelType, string> = {
  "regular": "Standard angel: can move to any square within power distance.",
  "nice": "Never returns to a square it has already visited.",
  "very-nice": "Never visits squares that were reachable on previous turns.",
  "fool": "Always increases its y-coordinate (moves upward).",
  "out-and-out-fool": "Always increases distance from the origin.",
};

export default function AngelDevil() {
  // Grid settings
  const [gridType, setGridType] = useState<GridType>("square");
  const [gridSize] = useState(95); // Full grid is 95x95
  const [cellSize, setCellSize] = useState(28);

  // Zoom calculation constants
  const DEFAULT_VIEW_SIZE = 21; // Show 21x21 squares by default
  const MIN_VIEW_SIZE = 60; // Can zoom out to show max 60x60 squares
  const DEFAULT_ZOOM = gridSize / DEFAULT_VIEW_SIZE; // ~4.52 for 95/21
  const MIN_ZOOM = gridSize / MIN_VIEW_SIZE; // ~1.58 for 95/60

  // Game state
  const [angelPos, setAngelPos] = useState<Coord>({ q: 0, r: 0 });
  const [angelPower, setAngelPower] = useState(1);
  const [angelType, setAngelType] = useState<AngelType>("regular");
  const [eatenSquares, setEatenSquares] = useState<Set<string>>(new Set());
  const [visitedSquares, setVisitedSquares] = useState<Set<string>>(new Set([coordKey({ q: 0, r: 0 })]));
  const [reachableHistory, setReachableHistory] = useState<Set<string>[]>([]);
  const [highlightedSquares, setHighlightedSquares] = useState<Set<string>>(new Set());
  const [currentTurn, setCurrentTurn] = useState<Turn>("angel");
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<"angel" | "devil" | null>(null);

  // UI state
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStrategy, setAiStrategy] = useState<AIStrategy>("random");
  const [darkMode, setDarkMode] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Pan/zoom state
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Highlighting drag state
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [highlightMode, setHighlightMode] = useState<'add' | 'remove' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistanceRef = useRef<number | null>(null);

  // Responsive cell size
  useEffect(() => {
    const updateCellSize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setCellSize(18); // Mobile
      } else if (width < 1024) {
        setCellSize(24); // Tablet
      } else {
        setCellSize(28); // Desktop
      }
    };
    updateCellSize();
    window.addEventListener("resize", updateCellSize);
    return () => window.removeEventListener("resize", updateCellSize);
  }, []);

  // Auto-play AI when enabled and it's angel's turn
  useEffect(() => {
    if (aiEnabled && currentTurn === "angel" && !gameOver) {
      const timer = setTimeout(() => {
        makeAIMove();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [aiEnabled, currentTurn, gameOver, angelPos, eatenSquares]);

  // Prevent scroll on wheel event over the grid container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.max(MIN_ZOOM, Math.min(gridSize, prev * delta)));
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [MIN_ZOOM, gridSize]);

  // Reset game
  const resetGame = () => {
    setAngelPos({ q: 0, r: 0 });
    setEatenSquares(new Set());
    setVisitedSquares(new Set([coordKey({ q: 0, r: 0 })]));
    setReachableHistory([]);
    setHighlightedSquares(new Set());
    setCurrentTurn("angel");
    setGameOver(false);
    setWinner(null);
    setViewOffset({ x: 0, y: 0 });
    setZoom(DEFAULT_ZOOM);
  };

  // Handle grid type change
  const handleGridTypeChange = () => {
    setGridType(prev => prev === "square" ? "hex" : "square");
    resetGame();
  };

  // Get valid moves for the angel
  const getValidMoves = (pos: Coord): Coord[] => {
    const distFn = gridType === "hex" ? hexDistance : squareDistance;
    const allInRange = getCellsInRange(pos, angelPower, gridType, gridSize);

    let validMoves = allInRange.filter(coord => {
      const key = coordKey(coord);
      // Can't move to eaten squares
      if (eatenSquares.has(key)) return false;

      // Check angel type constraints
      if (angelType === "nice" && visitedSquares.has(key)) return false;
      if (angelType === "very-nice") {
        for (const reachable of reachableHistory) {
          if (reachable.has(key)) return false;
        }
      }
      if (angelType === "fool" && coord.r <= pos.r) return false;
      if (angelType === "out-and-out-fool" && euclideanDistance(coord) <= euclideanDistance(pos)) return false;

      return true;
    });

    return validMoves;
  };

  // Check if angel is trapped
  const checkAngelTrapped = (): boolean => {
    return getValidMoves(angelPos).length === 0;
  };

  // Make AI move
  const makeAIMove = () => {
    const validMoves = getValidMoves(angelPos);
    if (validMoves.length === 0) {
      setGameOver(true);
      setWinner("devil");
      return;
    }

    let chosenMove: Coord;

    if (aiStrategy === "random") {
      // Random strategy
      chosenMove = validMoves[Math.floor(Math.random() * validMoves.length)];
    } else {
      // Greedy strategy: maximize sum of distances to eaten squares
      let bestMove = validMoves[0];
      let bestScore = -Infinity;
      const distFn = gridType === "hex" ? hexDistance : squareDistance;

      for (const move of validMoves) {
        let score = 0;
        for (const eatenKey of eatenSquares) {
          const eatenCoord = parseCoordKey(eatenKey);
          score += distFn(move, eatenCoord);
        }
        // Add small bonus for distance from origin
        score += euclideanDistance(move) * 0.1;

        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }
      chosenMove = bestMove;
    }

    moveAngel(chosenMove);
  };

  // Move angel
  const moveAngel = (newPos: Coord) => {
    // Store current reachable squares for very-nice angel
    if (angelType === "very-nice") {
      const reachable = new Set(
        getCellsInRange(angelPos, angelPower, gridType, gridSize).map(coordKey)
      );
      setReachableHistory(prev => [...prev, reachable]);
    }

    setAngelPos(newPos);
    setVisitedSquares(prev => new Set([...prev, coordKey(newPos)]));
    setCurrentTurn("devil");
  };

  // Eat square (Devil's turn)
  const eatSquare = (coord: Coord) => {
    const key = coordKey(coord);
    if (eatenSquares.has(key)) return; // Already eaten
    if (coord.q === angelPos.q && coord.r === angelPos.r) return; // Can't eat angel's position

    setEatenSquares(prev => new Set([...prev, key]));
    setCurrentTurn("angel");

    // Check if angel is now trapped
    setTimeout(() => {
      if (checkAngelTrapped()) {
        setGameOver(true);
        setWinner("devil");
      }
    }, 100);
  };

  // Handle cell pointer down (starts highlight drag or handles select)
  const handleCellPointerDown = (coord: Coord, e: React.PointerEvent) => {
    if (gameOver) return;

    // Don't handle cell interactions in pan mode - let it bubble to container
    if (activeTool === "pan") return;

    e.preventDefault();
    e.stopPropagation();

    if (activeTool === "highlight") {
      const key = coordKey(coord);
      // Start highlighting drag - determine mode based on current state
      setIsHighlighting(true);
      const wasHighlighted = highlightedSquares.has(key);
      setHighlightMode(wasHighlighted ? 'remove' : 'add');

      setHighlightedSquares(prev => {
        const next = new Set(prev);
        if (wasHighlighted) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    } else if (activeTool === "select") {
      if (currentTurn === "angel") {
        const validMoves = getValidMoves(angelPos);
        const isValidMove = validMoves.some(m => m.q === coord.q && m.r === coord.r);
        if (isValidMove) {
          moveAngel(coord);
        }
      } else if (currentTurn === "devil") {
        eatSquare(coord);
      }
    }
  };

  // Handle cell enter (for drag highlighting)
  const handleCellEnter = (coord: Coord) => {
    if (gameOver) return;
    if (!isHighlighting || activeTool !== "highlight" || !highlightMode) return;

    const key = coordKey(coord);
    setHighlightedSquares(prev => {
      const next = new Set(prev);
      if (highlightMode === 'add') {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  // Pan/zoom handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activeTool === "pan") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewOffset.x, y: e.clientY - viewOffset.y });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    if (activePointersRef.current.size === 2) {
      const points = Array.from(activePointersRef.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      lastPinchDistanceRef.current = distance;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size === 2) {
      const points = Array.from(activePointersRef.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

      if (lastPinchDistanceRef.current) {
        const scaleFactor = distance / lastPinchDistanceRef.current;
        setZoom(prev => {
          const nextZoom = prev * scaleFactor;
          return Math.max(MIN_ZOOM, Math.min(gridSize, nextZoom));
        });
      }

      lastPinchDistanceRef.current = distance;
      return;
    }

    if (isPanning && activeTool === "pan") {
      setViewOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsPanning(false);
    setIsHighlighting(false);
    setHighlightMode(null);

    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      lastPinchDistanceRef.current = null;
    }
  };

  // Render grid
  const renderGrid = () => {
    const halfSize = Math.floor(gridSize / 2);
    const cells: React.ReactElement[] = [];
    const validMoves = currentTurn === "angel" && !gameOver ? getValidMoves(angelPos) : [];
    const validMoveKeys = new Set(validMoves.map(coordKey));

    if (gridType === "square") {
      for (let r = -halfSize; r <= halfSize; r++) {
        for (let q = -halfSize; q <= halfSize; q++) {
          const coord = { q, r };
          const key = coordKey(coord);
          const isAngel = angelPos.q === q && angelPos.r === r;
          const isEaten = eatenSquares.has(key);
          const isVisited = visitedSquares.has(key) && angelType !== "regular";
          const isHighlighted = highlightedSquares.has(key);
          const isValidMove = validMoveKeys.has(key);

          // Check if this square was reachable on a previous turn (for Very Nice Angel)
          const wasPreviouslyReachable = angelType === "very-nice" &&
            reachableHistory.some(reachableSet => reachableSet.has(key));

          let fill = darkMode ? "#1a1a1a" : "#ffffff";
          if (isEaten) fill = darkMode ? "#7f1d1d" : "#dc2626";
          else if (isHighlighted) fill = darkMode ? "#854d0e" : "#fbbf24";
          else if (isVisited) fill = darkMode ? "#164e63" : "#67e8f9";
          else if (wasPreviouslyReachable) fill = darkMode ? "#0c4a6e" : "#bae6fd";
          else if (isValidMove && activeTool === "select") fill = darkMode ? "#065f46" : "#86efac";

          const x = (q + halfSize) * cellSize;
          const y = (r + halfSize) * cellSize;

          cells.push(
            <g key={key}>
              <rect
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                fill={fill}
                stroke={darkMode ? "#404040" : "#d1d5db"}
                strokeWidth={1}
                style={{ cursor: activeTool === "select" ? "pointer" : activeTool === "highlight" ? "crosshair" : "grab" }}
                onPointerDown={(e) => handleCellPointerDown(coord, e)}
                onPointerEnter={() => handleCellEnter(coord)}
              />
              {showCoordinates && (
                <text
                  x={x + cellSize / 2}
                  y={y + cellSize / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={cellSize * 0.3}
                  fill={darkMode ? "#888" : "#666"}
                  pointerEvents="none"
                >
                  {q},{r}
                </text>
              )}
              {isAngel && (
                <circle
                  cx={x + cellSize / 2}
                  cy={y + cellSize / 2}
                  r={cellSize * 0.4}
                  fill={darkMode ? "#fbbf24" : "#f59e0b"}
                  stroke={darkMode ? "#fcd34d" : "#d97706"}
                  strokeWidth={2}
                />
              )}
              {isAngel && (
                <text
                  x={x + cellSize / 2}
                  y={y + cellSize / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={cellSize * 0.5}
                  pointerEvents="none"
                >
                  =
                </text>
              )}
            </g>
          );
        }
      }
    } else {
      // Hexagonal grid
      const hexSize = cellSize * 0.55;
      for (let r = -halfSize; r <= halfSize; r++) {
        for (let q = -halfSize; q <= halfSize; q++) {
          const coord = { q, r };
          const key = coordKey(coord);
          const isAngel = angelPos.q === q && angelPos.r === r;
          const isEaten = eatenSquares.has(key);
          const isVisited = visitedSquares.has(key) && angelType !== "regular";
          const isHighlighted = highlightedSquares.has(key);
          const isValidMove = validMoveKeys.has(key);

          // Check if this square was reachable on a previous turn (for Very Nice Angel)
          const wasPreviouslyReachable = angelType === "very-nice" &&
            reachableHistory.some(reachableSet => reachableSet.has(key));

          let fill = darkMode ? "#1a1a1a" : "#ffffff";
          if (isEaten) fill = darkMode ? "#7f1d1d" : "#dc2626";
          else if (isHighlighted) fill = darkMode ? "#854d0e" : "#fbbf24";
          else if (isVisited) fill = darkMode ? "#164e63" : "#67e8f9";
          else if (wasPreviouslyReachable) fill = darkMode ? "#0c4a6e" : "#bae6fd";
          else if (isValidMove && activeTool === "select") fill = darkMode ? "#065f46" : "#86efac";

          const { x, y } = hexToPixel(q, r, hexSize);
          const centerX = x + (gridSize * hexSize * 3 / 2) / 2;
          const centerY = y + (gridSize * hexSize * Math.sqrt(3)) / 2;

          cells.push(
            <g key={key} transform={`translate(${centerX}, ${centerY})`}>
              <path
                d={hexagonPath(hexSize)}
                fill={fill}
                stroke={darkMode ? "#404040" : "#d1d5db"}
                strokeWidth={1}
                style={{ cursor: activeTool === "select" ? "pointer" : activeTool === "highlight" ? "crosshair" : "grab" }}
                onPointerDown={(e) => handleCellPointerDown(coord, e)}
                onPointerEnter={() => handleCellEnter(coord)}
              />
              {showCoordinates && (
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={hexSize * 0.35}
                  fill={darkMode ? "#888" : "#666"}
                  pointerEvents="none"
                >
                  {q},{r}
                </text>
              )}
              {isAngel && (
                <circle
                  r={hexSize * 0.5}
                  fill={darkMode ? "#fbbf24" : "#f59e0b"}
                  stroke={darkMode ? "#fcd34d" : "#d97706"}
                  strokeWidth={2}
                />
              )}
              {isAngel && (
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={hexSize * 0.6}
                  pointerEvents="none"
                >
                  =
                </text>
              )}
            </g>
          );
        }
      }
    }

    return cells;
  };

  const svgSize = gridSize * cellSize;

  // Tailwind class helpers
  const buttonClass = `px-4 py-2 rounded font-medium transition-colors ${
    darkMode
      ? "bg-gray-700 text-gray-100 hover:bg-gray-600"
      : "bg-gray-200 text-gray-800 hover:bg-gray-300"
  }`;

  const activeButtonClass = `px-4 py-2 rounded font-medium transition-colors ${
    darkMode
      ? "bg-blue-600 text-white hover:bg-blue-500"
      : "bg-blue-500 text-white hover:bg-blue-600"
  }`;

  const inputClass = `px-3 py-2 rounded border ${
    darkMode
      ? "bg-gray-700 border-gray-600 text-gray-100"
      : "bg-white border-gray-300 text-gray-900"
  }`;

  const labelClass = `font-medium ${darkMode ? "text-gray-200" : "text-gray-700"}`;

  const panelClass = `p-4 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-50"}`;


  return (
    <div className={`w-full min-h-screen transition-colors ${
      darkMode ? "bg-gray-900" : "bg-white"
    }`}>
      {/* Header */}
      <div className="w-full border-b px-4 py-3" style={{ borderColor: darkMode ? "#374151" : "#e5e7eb" }}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className={`text-2xl font-bold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
              Conway&apos;s Angel Problem
            </h1>
            <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"} mt-1`}>
              The Angel tries to escape indefinitely. The Devil tries to trap it by eating squares.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className={`${buttonClass} lg:hidden`}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className={buttonClass}
            >
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal for Mobile */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className={`${panelClass} max-w-md w-full max-h-[80vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-bold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                Game Settings
              </h2>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className={buttonClass}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <button type="button" onClick={resetGame} className={`${activeButtonClass} w-full`}>
                Reset Game
              </button>

              <div>
                <label className={`${labelClass} block mb-2`}>Grid Type</label>
                <button
                  type="button"
                  onClick={handleGridTypeChange}
                  className={`${buttonClass} w-full`}
                >
                  {gridType === "square" ? "Square Grid" : "Hexagon Grid"}
                </button>
              </div>

              <div>
                <label className={`${labelClass} block mb-2`} htmlFor="angelPower">
                  Angel Power: {angelPower}
                </label>
                <input
                  id="angelPower"
                  type="number"
                  min={1}
                  max={10}
                  value={angelPower}
                  onChange={(e) => {
                    setAngelPower(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)));
                    resetGame();
                  }}
                  className={`${inputClass} w-full`}
                />
              </div>

              <div>
                <label className={`${labelClass} block mb-2`} htmlFor="angelType">
                  Angel Type
                </label>
                <select
                  id="angelType"
                  value={angelType}
                  onChange={(e) => {
                    setAngelType(e.target.value as AngelType);
                    resetGame();
                  }}
                  className={`${inputClass} w-full`}
                >
                  <option value="regular">Regular Angel</option>
                  <option value="nice">Nice Angel</option>
                  <option value="very-nice">Very Nice Angel</option>
                  <option value="fool">The Fool</option>
                  <option value="out-and-out-fool">Out-and-out Fool</option>
                </select>
                <p className={`text-xs mt-2 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  {ANGEL_TYPE_DESCRIPTIONS[angelType]}
                </p>
              </div>

              <div className="pt-2 border-t" style={{ borderColor: darkMode ? "#4b5563" : "#d1d5db" }}>
                <label className={`${labelClass} flex items-center gap-2 cursor-pointer`}>
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>Computer Angel</span>
                </label>
              </div>

              {aiEnabled && (
                <div>
                  <label className={`${labelClass} block mb-2`} htmlFor="aiStrategy">
                    AI Strategy
                  </label>
                  <select
                    id="aiStrategy"
                    value={aiStrategy}
                    onChange={(e) => setAiStrategy(e.target.value as AIStrategy)}
                    className={`${inputClass} w-full`}
                  >
                    <option value="random">Random</option>
                    <option value="greedy">Greedy</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row max-w-7xl mx-auto gap-6 p-4 lg:p-6">
        <div className="hidden lg:block flex-shrink-0 lg:w-80 space-y-4">
          <div className={panelClass}>
            <h2 className={`text-lg font-semibold mb-4 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
              Game Settings
            </h2>

            <div className="space-y-4">
              <button type="button" onClick={resetGame} className={`${activeButtonClass} w-full`}>
                Reset Game
              </button>

              <div>
                <label className={`${labelClass} block mb-2`}>Grid Type</label>
                <button
                  type="button"
                  onClick={handleGridTypeChange}
                  className={`${buttonClass} w-full`}
                >
                  {gridType === "square" ? "Square Grid" : "Hexagon Grid"}
                </button>
              </div>

              <div>
                <label className={`${labelClass} block mb-2`} htmlFor="angelPowerDesktop">
                  Angel Power: {angelPower}
                </label>
                <input
                  id="angelPowerDesktop"
                  type="number"
                  min={1}
                  max={10}
                  value={angelPower}
                  onChange={(e) => {
                    setAngelPower(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)));
                    resetGame();
                  }}
                  className={`${inputClass} w-full`}
                />
              </div>

              <div>
                <label className={`${labelClass} block mb-2`} htmlFor="angelTypeDesktop">
                  Angel Type
                </label>
                <select
                  id="angelTypeDesktop"
                  value={angelType}
                  onChange={(e) => {
                    setAngelType(e.target.value as AngelType);
                    resetGame();
                  }}
                  className={`${inputClass} w-full`}
                >
                  <option value="regular">Regular Angel</option>
                  <option value="nice">Nice Angel</option>
                  <option value="very-nice">Very Nice Angel</option>
                  <option value="fool">The Fool</option>
                  <option value="out-and-out-fool">Out-and-out Fool</option>
                </select>
                <p className={`text-xs mt-2 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  {ANGEL_TYPE_DESCRIPTIONS[angelType]}
                </p>
              </div>

              <div className="pt-2 border-t" style={{ borderColor: darkMode ? "#4b5563" : "#d1d5db" }}>
                <label className={`${labelClass} flex items-center gap-2 cursor-pointer`}>
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>Computer Angel</span>
                </label>
              </div>

              {aiEnabled && (
                <div>
                  <label className={`${labelClass} block mb-2`} htmlFor="aiStrategyDesktop">
                    AI Strategy
                  </label>
                  <select
                    id="aiStrategyDesktop"
                    value={aiStrategy}
                    onChange={(e) => setAiStrategy(e.target.value as AIStrategy)}
                    className={`${inputClass} w-full`}
                  >
                    <option value="random">Random</option>
                    <option value="greedy">Greedy</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className={panelClass}>
            <h2 className={`text-lg font-semibold mb-3 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
              Legend
            </h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded ${darkMode ? "bg-gray-700 border border-gray-500" : "bg-white border border-gray-300"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Empty</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded ${darkMode ? "bg-red-900" : "bg-red-600"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Eaten</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded ${darkMode ? "bg-cyan-900" : "bg-cyan-300"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded`} style={{ backgroundColor: darkMode ? "#0c4a6e" : "#bae6fd" }}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Prev. Reach.</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded ${darkMode ? "bg-yellow-900" : "bg-yellow-300"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Highlighted</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded ${darkMode ? "bg-green-900" : "bg-green-300"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Valid Move</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded ${darkMode ? "bg-yellow-700" : "bg-orange-500"} flex items-center justify-center text-xs`}>
                  😇
                </div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Angel</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-start">
          <div className={`w-full mb-4 ${panelClass}`}>
            <div className="flex flex-wrap items-center gap-3">
              {/* <span className={`${labelClass} font-semibold`}>Tools:</span> */}
              <button
                type="button"
                onClick={() => setActiveTool("select")}
                className={clsx(
                  "px-4 py-2 rounded-lg font-medium transition-colors",
                  activeTool === "select" && darkMode && "bg-blue-600 text-white hover:bg-blue-500",
                  activeTool === "select" && !darkMode && "bg-blue-500 text-white hover:bg-blue-600",
                  activeTool !== "select" && darkMode && "bg-gray-700 text-gray-100 hover:bg-gray-600",
                  activeTool !== "select" && !darkMode && "bg-gray-200 text-gray-800 hover:bg-gray-300"
                )}
              >
                Select
              </button>
              <button
                type="button"
                onClick={() => setActiveTool("pan")}
                className={clsx(
                  "px-4 py-2 rounded-lg font-medium transition-colors",
                  activeTool === "pan" && darkMode && "bg-blue-600 text-white hover:bg-blue-500",
                  activeTool === "pan" && !darkMode && "bg-blue-500 text-white hover:bg-blue-600",
                  activeTool !== "pan" && darkMode && "bg-gray-700 text-gray-100 hover:bg-gray-600",
                  activeTool !== "pan" && !darkMode && "bg-gray-200 text-gray-800 hover:bg-gray-300"
                )}
              >
                Pan/Zoom
              </button>
              <button
                type="button"
                onClick={() => setActiveTool("highlight")}
                className={clsx(
                  "px-4 py-2 rounded-lg font-medium transition-colors",
                  activeTool === "highlight" && darkMode && "bg-blue-600 text-white hover:bg-blue-500",
                  activeTool === "highlight" && !darkMode && "bg-blue-500 text-white hover:bg-blue-600",
                  activeTool !== "highlight" && darkMode && "bg-gray-700 text-gray-100 hover:bg-gray-600",
                  activeTool !== "highlight" && !darkMode && "bg-gray-200 text-gray-800 hover:bg-gray-300"
                )}
              >
                Highlight
              </button>
              <label className={`${labelClass} flex items-center gap-2 cursor-pointer ml-auto`}>
                <input
                  type="checkbox"
                  checked={showCoordinates}
                  onChange={(e) => setShowCoordinates(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Show Coordinates</span>
              </label>
            </div>
          </div>

          <div
            ref={containerRef}
            className={`relative overflow-hidden rounded-lg shadow-lg ${panelClass} mb-4`}
            style={{
              width: "100%",
              maxWidth: `${svgSize}px`,
              aspectRatio:"1/1",
            //   height: `${svgSize}px`,
              touchAction: "none",
              userSelect: "none",

            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={`0 0 ${svgSize} ${svgSize}`}
              style={{
                transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${zoom})`,
                transformOrigin: "center",
                transition: isPanning ? "none" : "transform 0.2s ease",
              }}
            >
              {renderGrid()}
            </svg>
          </div>

          <div className={`w-full ${panelClass}`} style={{ maxWidth: `${svgSize}px` }}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className={`${labelClass} text-sm`}>
                <span className="font-semibold">Turn:</span>{" "}
                <span className={darkMode ? "text-blue-400" : "text-blue-600"}>
                  {currentTurn === "angel" ? (aiEnabled ? "Computer Angel" : "Angel") : "Devil"}
                </span>
              </div>
              <div className={`${labelClass} text-sm`}>
                <span className="font-semibold">Squares Eaten:</span>{" "}
                <span className={darkMode ? "text-red-400" : "text-red-600"}>
                  {eatenSquares.size}
                </span>
              </div>
              {gameOver && (
                <div className={`font-bold text-sm ${winner === "devil" ? "text-red-600" : "text-green-600"} px-3 py-1.5 rounded w-full text-center`}
                  style={{ backgroundColor: winner === "devil" ? "rgba(220, 38, 38, 0.1)" : "rgba(34, 197, 94, 0.1)" }}
                >
                  {winner === "devil" ? "Devil Wins! Angel is trapped!" : "Angel Wins!"}
                </div>
              )}
            </div>
          </div>

          <div className={`w-full mt-4 ${panelClass} lg:hidden`} style={{ maxWidth: `${svgSize}px` }}>
            <h3 className={`text-sm font-semibold mb-2 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
              Legend
            </h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${darkMode ? "bg-gray-700 border border-gray-500" : "bg-white border border-gray-300"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Empty</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${darkMode ? "bg-red-900" : "bg-red-600"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Eaten</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${darkMode ? "bg-cyan-900" : "bg-cyan-300"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Visited</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded`} style={{ backgroundColor: darkMode ? "#0c4a6e" : "#bae6fd" }}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Prev. Reach.</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${darkMode ? "bg-yellow-900" : "bg-yellow-300"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Highlight</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${darkMode ? "bg-green-900" : "bg-green-300"}`}></div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Valid</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-4 h-4 rounded ${darkMode ? "bg-yellow-700" : "bg-orange-500"} flex items-center justify-center`} style={{ fontSize: "10px" }}>
                  😇
                </div>
                <span className={darkMode ? "text-gray-300" : "text-gray-700"}>Angel</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
