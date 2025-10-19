import React, { useRef, useEffect, memo, useState } from 'react';
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
  const lastColorRef = useRef<string | null>(null);
  const lastZIndexRef = useRef<number | null>(null);
  const [mistTexture, setMistTexture] = useState<HTMLImageElement | null>(null);
  const [mistVariation, setMistVariation] = useState<{ 
    scale: number; 
    rotation: number; 
    offsetX: number; 
    offsetY: number; 
    flipHorizontal: boolean 
  } | null>(null);


  // Load mist texture
  useEffect(() => {
    const img = new Image();
    img.onload = () => setMistTexture(img);
    img.src = '/mist.png';
  }, []);


  // Generate random mist variation parameters for this layer instance
  useEffect(() => {
    const scale = (0.8 + Math.random() * 0.4) * 1.5; // 1.2 to 1.8 scale (1.5x multiplier)
    const rotation = (Math.random() - 0.5) * 20; // -10 to +10 degrees
    const offsetX = (Math.random() - 0.5) * 100; // ±50px max
    const offsetY = (Math.random() - 0.5) * 100; // ±50px max
    const flipHorizontal = Math.random() > 0.5; // 50% chance to flip
    
    setMistVariation({ scale, rotation, offsetX, offsetY, flipHorizontal });
  }, [layerIndex, seed, width, height]);

  // Generate mountain shape once and store it
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset generation state when seed changes (for regeneration)
    shapeGeneratedRef.current = false;
    lastColorRef.current = null;
    lastZIndexRef.current = null;

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


  // Helper function to blend two colors smoothly
  const blendColors = (color1: string, color2: string, ratio: number): string => {
    // Extract RGB values from rgba strings
    const extractRgb = (color: string) => {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [0, 0, 0];
    };
    
    const [r1, g1, b1] = extractRgb(color1);
    const [r2, g2, b2] = extractRgb(color2);
    
    const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
    const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
    const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
    
    return `rgba(${r}, ${g}, ${b}, 1)`;
  };




  // Separate effect for color updates with caching - optimized for 120fps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shapePathRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Check if we need to redraw (only if color, z-index, or seed changed)
    const currentColor = lastColorRef.current;
    const currentZIndex = lastZIndexRef.current;
    
    // More aggressive caching for 120fps - only redraw when absolutely necessary
    if (currentColor && currentZIndex === zIndex) {
      return; // No need to redraw
    }

    // Clear canvas with transparency
    ctx.clearRect(0, 0, width, height);

    // Get color based on layer index (each layer gets its own color from the palette)
    const getColorForLayer = (layerIndex: number, palette: Color[]): Color => {
      // Use layer index to select color from palette
      const paletteIndex = Math.min(layerIndex - 1, palette.length - 1); // layerIndex starts at 1
      const clampedIndex = Math.max(0, Math.min(palette.length - 1, paletteIndex));
      
      return palette[clampedIndex];
    };
    
    const solidColor = getColorForLayer(layerIndex, colorPalette);
    const solidColorRgb = hsbToRgb(solidColor.h, solidColor.s, solidColor.b, solidColor.a);

    // Draw mountain shape with gradient from current color at top to white at bottom
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, solidColorRgb); // Current color at top
    gradient.addColorStop(0.5, solidColorRgb); // Keep original color until 80% down
    gradient.addColorStop(1, blendColors(solidColorRgb, 'rgba(255, 255, 255, 1)', 0.8)); // 20% white blend
    
    ctx.fillStyle = gradient;
    ctx.fill(shapePathRef.current!);
    
    
    // Reset blend mode for subsequent operations
    ctx.globalCompositeOperation = 'source-over';

    // Add mist effect using mist.png image with variation
    if (mistTexture && mistVariation) {
      const mistHeight = height - referenceY;
      const mistStartY = referenceY - (mistHeight * 0.2); // Start mist higher up
      
      // Make mist more prominent for closer layers (higher layerIndex)
      const mistIntensity = Math.min(1, (layerIndex / maxIndex) * 1.5); // Closer layers get more mist
      const baseOpacity = 40 + (mistIntensity * 60); // 40-100 range
      
      ctx.save();
      ctx.globalAlpha = baseOpacity / 240; // Convert to 0-1 range
      ctx.globalCompositeOperation = 'screen'; // Use screen blend mode for mist effect
      
      // Apply transformations for mist variation
      const centerX = width / 2 + mistVariation.offsetX;
      const centerY = height / 2 + mistVariation.offsetY;
      
      ctx.translate(centerX, centerY);
      ctx.rotate((mistVariation.rotation * Math.PI) / 180); // Convert degrees to radians
      ctx.scale(mistVariation.scale, mistVariation.scale);
      
      // Apply horizontal flip if needed
      if (mistVariation.flipHorizontal) {
        ctx.scale(-1, 1);
      }
      
      ctx.translate(-centerX, -centerY);
      
      // Draw mist texture covering the mist area
      ctx.drawImage(
        mistTexture, 
        0, mistStartY, 
        width, height - mistStartY
      );
      
      ctx.restore();
    }

    // Update cache
    lastColorRef.current = solidColorRgb;
    lastZIndexRef.current = zIndex || 0;

  }, [width, height, layerIndex, referenceY, colorPalette, mistColor, seed, maxIndex, zIndex, mistTexture, mistVariation]);

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
