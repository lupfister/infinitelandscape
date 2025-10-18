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
  zIndex?: number; // actual z-index value - used for atmospheric perspective
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
  amplitude,
  zIndex
}: MountainLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapePathRef = useRef<Path2D | null>(null);
  const shapeGeneratedRef = useRef(false);

  // Generate mountain shape once and store it
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || shapeGeneratedRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const noise = new PerlinNoise(seed + layerIndex);


    // Generate random parameters for this mountain
    const a = Math.random() * width - width / 2;
    const b = Math.random() * width - width / 2;
    const cAmp = Math.random() * 2 + 2;
    const dAmp = Math.random() * 10 + 40;
    const e = Math.random() * width - width / 2;

    let dx = 0;
    // Uniform amplitude across layers; default equals previous closest layer (~9)
    const amplitudeFactor = amplitude ?? 9;

    // Create the mountain shape path
    const path = new Path2D();
    
    // Start from bottom left
    path.moveTo(0, height);
    
    // Draw mountain silhouette
    dx = 0;
    for (let x = 0; x < width; x++) {
      let y = referenceY;
      y += 10 * amplitudeFactor * Math.sin((2 * dx) / amplitudeFactor + a);
      y += cAmp * amplitudeFactor * Math.sin((5 * dx) / amplitudeFactor + b);
      y += dAmp * amplitudeFactor * noise.noise((1.2 * dx) / amplitudeFactor + e, 0);
      y += 1.7 * amplitudeFactor * noise.noise(10 * dx, 0);

      path.lineTo(x, y);
      dx += 0.02;
    }
    
    // Complete the shape by going to bottom right and back to start
    path.lineTo(width, height);
    path.closePath();
    
    // Store the shape path
    shapePathRef.current = path;
    shapeGeneratedRef.current = true;
  }, [width, height, layerIndex, referenceY, seed, maxIndex, amplitude]);

  // Color calculation functions (moved outside useEffect to avoid recreation)
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

  // Separate effect for color updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shapePathRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with transparency
    ctx.clearRect(0, 0, width, height);

    const depth = Math.max(0.0001, layerIndex / maxIndex);

    // Get color influenced by depth and nearby layers with some randomness
    const getInfluencedColor = (layerIndex: number, maxIndex: number, palette: Color[]): Color => {
      // Base color from depth
      const baseColor = getColorForDepth(depth, palette);
      
      // Add randomness based on layer index for consistency
      const randomSeed = seed + layerIndex;
      const random = new PerlinNoise(randomSeed);
      
      // Random variation in hue (±30 degrees), saturation (±20%), brightness (±15%)
      const hueVariation = (random.noise(layerIndex * 0.1, 0) - 0.5) * 60; // -30 to +30
      const satVariation = (random.noise(layerIndex * 0.1, 1) - 0.5) * 40; // -20 to +20
      const brightVariation = (random.noise(layerIndex * 0.1, 2) - 0.5) * 30; // -15 to +15
      
      // Influence from nearby layers (weighted average)
      const influenceRadius = 3; // How many layers to consider
      let influencedH = baseColor.h;
      let influencedS = baseColor.s;
      let influencedB = baseColor.b;
      
      // Look at nearby layers and blend their colors
      for (let i = Math.max(1, layerIndex - influenceRadius); i <= Math.min(maxIndex, layerIndex + influenceRadius); i++) {
        if (i === layerIndex) continue;
        
        const nearbyDepth = Math.max(0.0001, i / maxIndex);
        const nearbyColor = getColorForDepth(nearbyDepth, palette);
        
        // Weight decreases with distance
        const distance = Math.abs(i - layerIndex);
        const weight = Math.max(0, 1 - distance / influenceRadius) * 0.3; // Max 30% influence
        
        influencedH += (nearbyColor.h - baseColor.h) * weight;
        influencedS += (nearbyColor.s - baseColor.s) * weight;
        influencedB += (nearbyColor.b - baseColor.b) * weight;
      }
      
      // Apply random variations
      let finalH = (influencedH + hueVariation + 360) % 360;
      let finalS = Math.max(0, Math.min(100, influencedS + satVariation));
      let finalB = Math.max(0, Math.min(100, influencedB + brightVariation));
      
      // Apply atmospheric perspective based on z-index: lower z-index values (distant) become less saturated and more blue
      if (zIndex !== undefined) {
        // Normalize z-index to 0-1 range for atmospheric effect calculation
        // Lower z-index values should have stronger atmospheric effect
        // Assuming z-index ranges roughly from 1000 to 200000+ based on the App.tsx calculation
        const minZIndex = 1000;
        const maxZIndex = 200000;
        const normalizedZIndex = Math.max(0, Math.min(1, (zIndex - minZIndex) / (maxZIndex - minZIndex)));
        
        // Invert so that lower z-index (distant) gets higher atmospheric effect
        const atmosphericEffect = 1 - normalizedZIndex; // 1 for furthest (low z-index), 0 for closest (high z-index)
        
        // Only apply atmospheric effect if the layer is sufficiently distant
        const atmosphericThreshold = 0.3; // Only apply to layers with z-index in bottom 30%
        if (atmosphericEffect > atmosphericThreshold) {
          // Reduce saturation for distant layers
          const saturationReduction = (atmosphericEffect - atmosphericThreshold) / (1 - atmosphericThreshold) * 0.6; // Up to 60% reduction
          finalS = finalS * (1 - saturationReduction);
          
          // Shift hue towards blue for distant layers
          // Shift hue towards blue (around 240 degrees)
          const blueHue = 240;
          const hueDiff = ((blueHue - finalH + 180) % 360) - 180;
          const hueShift = (atmosphericEffect - atmosphericThreshold) / (1 - atmosphericThreshold) * 0.3;
          finalH = (finalH + hueDiff * hueShift + 360) % 360;
          
          // Slightly increase brightness for distant layers to simulate atmospheric scattering
          const brightnessIncrease = (atmosphericEffect - atmosphericThreshold) / (1 - atmosphericThreshold) * 0.1; // Up to 10% increase
          finalB = Math.min(100, finalB + brightnessIncrease * 100);
        }
      }
      
      return {
        h: finalH,
        s: finalS,
        b: finalB,
        a: baseColor.a
      };
    };
    
    const solidColor = getInfluencedColor(layerIndex, maxIndex, colorPalette);
    const solidColorRgb = hsbToRgb(solidColor.h, solidColor.s, solidColor.b, solidColor.a);

    // Draw mountain shape with solid color using stored path
    ctx.fillStyle = solidColorRgb;
    ctx.fill(shapePathRef.current!);

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

  }, [width, height, layerIndex, referenceY, colorPalette, mistColor, seed, maxIndex, zIndex]);

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
