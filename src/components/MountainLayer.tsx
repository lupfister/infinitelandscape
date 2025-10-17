import React, { useRef, useEffect, memo } from 'react';
import PerlinNoise from '../utils/perlin';

interface Color {
  h: number;
  s: number;
  b: number;
  a: number;
}

export interface MountainLayerProps {
  width: number;
  height: number;
  layerIndex: number;
  referenceY: number;
  closerColor: Color;
  furtherColor: Color;
  mistColor: Color;
  seed: number;
  maxIndex: number;
}

function MountainLayerImpl({
  width,
  height,
  layerIndex,
  referenceY,
  closerColor,
  furtherColor,
  mistColor,
  seed,
  maxIndex
}: MountainLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with transparency
    ctx.clearRect(0, 0, width, height);

    const noise = new PerlinNoise(seed + layerIndex);

    const hsbToRgb = (h: number, s: number, b: number, a: number = 360): string => {
      h = h / 360;
      s = s / 100;
      b = b / 100;
      const alpha = a / 360;

      let r = 0, g = 0, bl = 0;

      if (s === 0) {
        r = g = bl = b;
      } else {
        const hueToRgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };

        const q = b < 0.5 ? b * (1 + s) : b + s - b * s;
        const p = 2 * b - q;
        r = hueToRgb(p, q, h + 1/3);
        g = hueToRgb(p, q, h);
        bl = hueToRgb(p, q, h - 1/3);
      }

      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(bl * 255)}, ${alpha})`;
    };

    const map = (value: number, start1: number, stop1: number, start2: number, stop2: number): number => {
      return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
    };

    const lerpColor = (c1: Color, c2: Color, t: number): Color => {
      return {
        h: c1.h + (c2.h - c1.h) * t,
        s: c1.s + (c2.s - c1.s) * t,
        b: c1.b + (c2.b - c1.b) * t,
        a: c1.a + (c2.a - c1.a) * t
      };
    };

    // Generate random parameters for this mountain
    const a = Math.random() * width - width / 2;
    const b = Math.random() * width - width / 2;
    const cAmp = Math.random() * 2 + 2;
    const dAmp = Math.random() * 10 + 40;
    const e = Math.random() * width - width / 2;

    let dx = 0;
    const depth = Math.max(0.0001, layerIndex / maxIndex);
    // Scale depth to preserve previous visual proportions (baseline was 9 layers)
    const effectiveJ = depth * 9;

    // Draw mountain
    for (let x = 0; x < width; x++) {
      let y = referenceY;
      y += 10 * effectiveJ * Math.sin((2 * dx) / effectiveJ + a);
      y += cAmp * effectiveJ * Math.sin((5 * dx) / effectiveJ + b);
      y += dAmp * effectiveJ * noise.noise((1.2 * dx) / effectiveJ + e, 0);
      y += 1.7 * effectiveJ * noise.noise(10 * dx, 0);

      const t = depth;
      const lerped = lerpColor(furtherColor, closerColor, t);
      
      ctx.strokeStyle = hsbToRgb(lerped.h, lerped.s, lerped.b, lerped.a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, height);
      ctx.stroke();

      dx += 0.02;
    }

    // Add mist
    for (let i = height; i > referenceY; i -= 3) {
      const alfa = map(i, referenceY, height, 0, 360 / (effectiveJ + 1));
      ctx.strokeStyle = hsbToRgb(mistColor.h, mistColor.s, mistColor.b, alfa);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

  }, [width, height, layerIndex, referenceY, closerColor, furtherColor, mistColor, seed, maxIndex]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
    />
  );
}

const MemoMountainLayer = memo(MountainLayerImpl);
export default MemoMountainLayer as React.MemoExoticComponent<(props: MountainLayerProps) => JSX.Element>;
