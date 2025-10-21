"use client"

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface FourierCoefficient {
  amplitude: number;
  phase: number;
  frequency: number;
}

const maxTraceLength = 10000;
const animationSpeed = .04;

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);

  if (length < 1) {
    return;
  }

  const previousStroke = ctx.strokeStyle;
  const previousFill = ctx.fillStyle;
  const headLength = Math.min(12, Math.max(6, length * 0.25));
  const angle = Math.atan2(dy, dx);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  const leftX = toX - headLength * Math.cos(angle - Math.PI / 8);
  const leftY = toY - headLength * Math.sin(angle - Math.PI / 8);
  const rightX = toX - headLength * Math.cos(angle + Math.PI / 8);
  const rightY = toY - headLength * Math.sin(angle + Math.PI / 8);

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = previousStroke;
  ctx.fillStyle = previousFill;
}

function computeFourier(
  points: Point[],
  width: number,
  height: number
): FourierCoefficient[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const centered = points.map(point => ({
    x: point.x - halfWidth,
    y: point.y - halfHeight
  }));

  const mirrored = centered.concat([...centered].reverse());
  const length = mirrored.length;
  const series: FourierCoefficient[] = [];

  for (let k = 0; k < length; k += 1) {
    let real = 0;
    let imaginary = 0;

    for (let n = 0; n < length; n += 1) {
      const point = mirrored[n];
      const angle = (-2 * Math.PI * k * n) / length;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);

      real += point.x * cosine - point.y * sine;
      imaginary += point.x * sine + point.y * cosine;
    }

    real /= length;
    imaginary /= length;

    const amplitude = Math.hypot(real, imaginary);
    const phase = Math.atan2(imaginary, real);
    const frequency = k <= length / 2 ? k / length : (k - length) / length;

    series.push({ amplitude, phase, frequency });
  }

  series.sort((a, b) => b.amplitude - a.amplitude);
  return series;
}

const EpicycleVisualizer: React.FC = () => {
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const epiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const epiCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const drawingRef = useRef(false);
  const sampledPointsRef = useRef<Point[]>([]);
  const sampleStepRef = useRef(0);
  const lastPointRef = useRef<Point | null>(null);
  const fourierSeriesRef = useRef<FourierCoefficient[]>([]);
  const signalLengthRef = useRef(0);
  const timeRef = useRef(0);
  const traceRef = useRef<Point[]>([]);

  const [epicycleLimit, setEpicycleLimit] = useState(1);
  const [sliderMax, setSliderMax] = useState(1);
  const [sliderDisabled, setSliderDisabled] = useState(true);

  const epicycleLimitRef = useRef(epicycleLimit);

  useEffect(() => {
    epicycleLimitRef.current = epicycleLimit;
  }, [epicycleLimit]);

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const clearEpicycleCanvas = useCallback(() => {
    const canvas = epiCanvasRef.current;
    const ctx = epiCtxRef.current;

    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const fillDrawBackground = useCallback(() => {
    const canvas = drawCanvasRef.current;
    const ctx = drawCtxRef.current;

    if (canvas && ctx) {
      const previousFill = ctx.fillStyle;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = previousFill;
    }
  }, []);

  const clearHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const drawCanvas = drawCanvasRef.current;
    const epiCanvas = epiCanvasRef.current;

    if (!drawCanvas || !epiCanvas) {
      return undefined;
    }

    const drawCtx = drawCanvas.getContext('2d');
    const epiCtx = epiCanvas.getContext('2d');

    if (!drawCtx || !epiCtx) {
      return undefined;
    }

    drawCtxRef.current = drawCtx;
    epiCtxRef.current = epiCtx;

    drawCtx.lineWidth = 4;
    drawCtx.lineCap = 'round';
    drawCtx.strokeStyle = '#222';
    drawCtx.fillStyle = '#fff';
    drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
    drawCtx.beginPath();

    epiCtx.lineCap = 'round';
    epiCtx.lineJoin = 'round';
    clearEpicycleCanvas();

    const getCanvasPosition = (event: PointerEvent, canvas: HTMLCanvasElement): Point => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
      };
    };

    const stepAnimation = () => {
      const ctx = epiCtxRef.current;
      const canvasRef = epiCanvasRef.current;

      if (!ctx || !canvasRef) {
        return;
      }

      clearEpicycleCanvas();

      const width = canvasRef.width;
      const height = canvasRef.height;
      const offsetX = width / 2;
      const offsetY = height / 2;

      let x = 0;
      let y = 0;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';

      const activeEpicycles = Math.min(epicycleLimitRef.current, fourierSeriesRef.current.length);

      for (let i = 0; i < activeEpicycles; i += 1) {
        const coefficient = fourierSeriesRef.current[i];
        const previousX = x;
        const previousY = y;
        const angle = 2 * Math.PI * coefficient.frequency * timeRef.current + coefficient.phase;

        x += coefficient.amplitude * Math.cos(angle);
        y += coefficient.amplitude * Math.sin(angle);

        if (coefficient.amplitude < 0.5) {
          continue;
        }

        ctx.beginPath();
        ctx.arc(previousX, previousY, coefficient.amplitude, 0, Math.PI * 2);
        ctx.stroke();

        drawArrow(ctx, previousX, previousY, x, y, '#0f7b0f');
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';

        ctx.fillStyle = '#005fb8';
        ctx.beginPath();
        ctx.arc(previousX, previousY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      const trace = traceRef.current;
      trace.push({ x: x + offsetX, y: y + offsetY });

      if (trace.length > maxTraceLength) {
        trace.shift();
      }

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0067c0';
      ctx.beginPath();

      trace.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });

      ctx.stroke();

      if (trace.length) {
        const tip = trace[trace.length - 1];
        ctx.fillStyle = '#0067c0';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      timeRef.current += animationSpeed;

      if (timeRef.current >= signalLengthRef.current) {
        timeRef.current = 0;
        trace.length = 0;
      }

      animationFrameRef.current = requestAnimationFrame(stepAnimation);
    };

    const startAnimation = () => {
      stopAnimation();
      animationFrameRef.current = requestAnimationFrame(stepAnimation);
    };

    const startDrawing = (event: PointerEvent) => {
      event.preventDefault();

      if (fourierSeriesRef.current.length) {
        stopAnimation();
        clearEpicycleCanvas();
      }

      drawingRef.current = true;
      sampledPointsRef.current = [];
      traceRef.current = [];
      sampleStepRef.current = 0;

      const point = getCanvasPosition(event, drawCanvas);
      lastPointRef.current = point;
      sampledPointsRef.current.push({ ...point });

      fillDrawBackground();
      drawCtx.beginPath();
      drawCtx.moveTo(point.x, point.y);
    };

    const draw = (event: PointerEvent) => {
      if (!drawingRef.current) {
        return;
      }

      const point = getCanvasPosition(event, drawCanvas);
      drawCtx.lineTo(point.x, point.y);
      drawCtx.stroke();

      sampleStepRef.current += 1;

      if (sampleStepRef.current % 3 === 0) {
        sampledPointsRef.current.push({ ...point });
      }

      lastPointRef.current = point;
    };

    const endDrawing = (event: PointerEvent) => {
      if (!drawingRef.current) {
        return;
      }

      drawingRef.current = false;

      if (event.type === 'pointerup') {
        const point = getCanvasPosition(event, drawCanvas);
        sampledPointsRef.current.push({ ...point });
      } else if (lastPointRef.current) {
        sampledPointsRef.current.push({ ...lastPointRef.current });
      }

      if (sampledPointsRef.current.length < 3) {
        sampledPointsRef.current = [];
        return;
      }

      const series = computeFourier(
        sampledPointsRef.current,
        drawCanvas.width,
        drawCanvas.height
      );

      fourierSeriesRef.current = series;
      signalLengthRef.current = sampledPointsRef.current.length * 2;
      timeRef.current = 0;
      traceRef.current = [];

      const maxEpicycles = Math.max(1, series.length);
      setSliderMax(maxEpicycles);
      setEpicycleLimit(maxEpicycles);
      setSliderDisabled(false);

      startAnimation();
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (
        drawingRef.current &&
        event.target instanceof HTMLCanvasElement &&
        event.target === drawCanvas
      ) {
        event.preventDefault();
      }
    };

    const resetAll = () => {
      stopAnimation();
      sampledPointsRef.current = [];
      fourierSeriesRef.current = [];
      traceRef.current = [];
      timeRef.current = 0;
      signalLengthRef.current = 0;
      lastPointRef.current = null;
      sampleStepRef.current = 0;

      setEpicycleLimit(1);
      setSliderMax(1);
      setSliderDisabled(true);

      fillDrawBackground();
      drawCtx.beginPath();
      clearEpicycleCanvas();
    };

    clearHandlerRef.current = resetAll;

    drawCanvas.addEventListener('pointerdown', startDrawing);
    drawCanvas.addEventListener('pointermove', draw);
    drawCanvas.addEventListener('pointerup', endDrawing);
    drawCanvas.addEventListener('pointerleave', endDrawing);
    drawCanvas.addEventListener('pointercancel', endDrawing);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      stopAnimation();

      drawCanvas.removeEventListener('pointerdown', startDrawing);
      drawCanvas.removeEventListener('pointermove', draw);
      drawCanvas.removeEventListener('pointerup', endDrawing);
      drawCanvas.removeEventListener('pointerleave', endDrawing);
      drawCanvas.removeEventListener('pointercancel', endDrawing);
      document.removeEventListener('touchmove', handleTouchMove);

      clearHandlerRef.current = null;
      drawCtxRef.current = null;
      epiCtxRef.current = null;
    };
  }, [clearEpicycleCanvas, fillDrawBackground, setEpicycleLimit, setSliderDisabled, setSliderMax, stopAnimation]);

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(event.target.value, 10);

    if (Number.isNaN(value)) {
      return;
    }

    const nextValue = Math.max(1, value);
    setEpicycleLimit(nextValue);
    timeRef.current = 0;
    traceRef.current = [];
    clearEpicycleCanvas();
  };

  const handleClearClick = () => {
    clearHandlerRef.current?.();
  };

  return (
    <main className="app">
      <section className="panel">
        <h1>Draw a shape</h1>
        <div className="canvas-stack">
          <canvas ref={drawCanvasRef} width={400} height={400} />
          <canvas ref={epiCanvasRef} width={400} height={400} style={{position: "absolute", inset: 0, pointerEvents: "none", background: "transparent", border: "none"}} />
        </div>
        <div className="controls">
          <button type="button" onClick={handleClearClick}>
            Clear
          </button>
          <span className="hint">Draw with your mouse or finger, release to animate.</span>
        </div>
        <div className="epi-controls">
          <label className="slider-label" htmlFor="epicycle-slider">
            Epicycles: <span>{epicycleLimit}</span>
          </label>
          <input
            id="epicycle-slider"
            className="slider"
            type="range"
            min={1}
            step={1}
            max={sliderMax}
            value={epicycleLimit}
            onChange={handleSliderChange}
            disabled={sliderDisabled}
          />
        </div>
      </section>
    </main>
  );
};

export default EpicycleVisualizer;