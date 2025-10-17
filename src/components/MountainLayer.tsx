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
  colorPalette: Color[];
  mistColor: Color;
  seed: number;
  maxIndex: number;
  amplitude?: number; // uniform amplitude factor across layers; default matches previous closest layer
}

function MountainLayerImpl({
  width,
  height,
  layerIndex,
  referenceY,
  colorPalette,
  mistColor,
  seed,
  maxIndex,
  amplitude
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

    // Function to interpolate between multiple colors based on depth
    const getColorForDepth = (depth: number, palette: Color[]): Color => {
      if (depth <= 0) return palette[0];
      if (depth >= 1) return palette[palette.length - 1];
      
      const scaledDepth = depth * (palette.length - 1);
      const index = Math.floor(scaledDepth);
      const t = scaledDepth - index;
      
      if (index >= palette.length - 1) return palette[palette.length - 1];
      
      const c1 = palette[index];
      const c2 = palette[index + 1];
      
      return lerpColor(c1, c2, t);
    };

    // Generate random parameters for this mountain
    const a = Math.random() * width - width / 2;
    const b = Math.random() * width - width / 2;
    const cAmp = Math.random() * 2 + 2;
    const dAmp = Math.random() * 10 + 40;
    const e = Math.random() * width - width / 2;

    let dx = 0;
    const depth = Math.max(0.0001, layerIndex / maxIndex);
    // Uniform amplitude across layers; default equals previous closest layer (~9)
    const amplitudeFactor = amplitude ?? 9;

    // Draw mountain
    for (let x = 0; x < width; x++) {
      let y = referenceY;
      y += 10 * amplitudeFactor * Math.sin((2 * dx) / amplitudeFactor + a);
      y += cAmp * amplitudeFactor * Math.sin((5 * dx) / amplitudeFactor + b);
      y += dAmp * amplitudeFactor * noise.noise((1.2 * dx) / amplitudeFactor + e, 0);
      y += 1.7 * amplitudeFactor * noise.noise(10 * dx, 0);

      // Add horizontal color variation to reduce banding
      const horizontalVariation = noise.noise(dx * 0.1, layerIndex) * 0.1; // Small variation
      const t = Math.max(0, Math.min(1, depth + horizontalVariation));
      const lerped = getColorForDepth(t, colorPalette);
      
      ctx.strokeStyle = hsbToRgb(lerped.h, lerped.s, lerped.b, lerped.a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, height);
      ctx.stroke();

      dx += 0.02;
    }

    // Add mist effect that varies by layer depth
    const mistHeight = height - referenceY;
    const mistStartY = referenceY - (mistHeight * 0.2); // Start mist higher up
    const gradient = ctx.createLinearGradient(0, mistStartY, 0, height);
    
    // Make mist more prominent for closer layers (higher layerIndex)
    const mistIntensity = Math.min(1, (layerIndex / maxIndex) * 1.5); // Closer layers get more mist
    const baseOpacity = 40 + (mistIntensity * 60); // 40-100 range
    
    // Create smooth gradient stops with depth-based opacity
    for (let i = 0; i <= 20; i++) {
      const y = mistStartY + (height - mistStartY) * i / 20;
      const alfa = map(y, mistStartY, height, 0, baseOpacity);
      const normalizedAlfa = alfa / 360;
      gradient.addColorStop(i / 20, `rgba(255, 255, 255, ${normalizedAlfa})`);
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, mistStartY, width, height - mistStartY);

  }, [width, height, layerIndex, referenceY, colorPalette, mistColor, seed, maxIndex, amplitude]);

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
