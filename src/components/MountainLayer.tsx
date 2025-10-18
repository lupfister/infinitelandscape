import React, { useRef, useEffect, memo, useState } from 'react';
import PerlinNoise from '../utils/perlin';

interface Color {
  h: number;
  s: number;
  b: number;
  a: number;
}

// Group colors by hue families for clustering
const COLOR_FAMILIES = {
  blues: ['#293434', '#31475B', '#5C758E'],           // Blue-gray family
  browns: ['#5A3B24', '#8D5829', '#7F6734', '#9B7D4D'], // Brown family
  greens: ['#414C39', '#5C5D3A', '#7B7442']           // Green family
};

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
  const [rockTexture, setRockTexture] = useState<HTMLImageElement | null>(null);
  const [textureNoise, setTextureNoise] = useState<{ rotation: number; scale: number } | null>(null);

  // Load rock texture
  useEffect(() => {
    const img = new Image();
    img.onload = () => setRockTexture(img);
    img.src = '/rock.png';
  }, []);

  // Generate random rotation and scale noise for this layer instance
  useEffect(() => {
    const rotation = (Math.random() - 0.5) * 60; // -30 to +30 degrees
    const scale = (0.8 + Math.random() * 0.4) * 2; // 1.6 to 2.4 scale (2x overall)
    setTextureNoise({ rotation, scale });
  }, [layerIndex, seed]);

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

  const map = (value: number, start1: number, stop1: number, start2: number, stop2: number): number => {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
  };

  // Generate a random color for this layer based on layerIndex and seed
  // with clustering to make similar hues appear near each other
  const getRandomColorForLayer = (layerIndex: number, seed: number): string => {
    // Create a base seed for this layer
    const baseSeed = (layerIndex * 7 + seed) % 1000;
    
    // Determine which color family to use based on layer index and seed
    // This creates "zones" of similar colors
    const familySeed = Math.floor((layerIndex + seed * 0.1) / 3) % 3; // Changes every ~3 layers
    const familyNames = Object.keys(COLOR_FAMILIES);
    const selectedFamily = familyNames[familySeed] as keyof typeof COLOR_FAMILIES;
    const familyColors = COLOR_FAMILIES[selectedFamily];
    
    // Add some randomness within the family, but with bias towards similar colors
    const colorIndex = Math.floor((baseSeed + layerIndex * 0.3) % familyColors.length);
    
    // Occasionally (20% chance) pick from a different family for variety
    if (baseSeed % 100 < 20) {
      const otherFamilies = familyNames.filter(name => name !== selectedFamily);
      const randomFamily = otherFamilies[Math.floor(baseSeed / 100) % otherFamilies.length] as keyof typeof COLOR_FAMILIES;
      const randomFamilyColors = COLOR_FAMILIES[randomFamily];
      const randomColorIndex = Math.floor(baseSeed / 10) % randomFamilyColors.length;
      return randomFamilyColors[randomColorIndex];
    }
    
    return familyColors[colorIndex];
  };



  // Separate effect for color updates with caching
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shapePathRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Check if we need to redraw (only if color, z-index, or seed changed)
    const currentColor = lastColorRef.current;
    const currentZIndex = lastZIndexRef.current;
    const randomColor = getRandomColorForLayer(layerIndex, seed);
    
    if (currentColor && currentZIndex === zIndex && currentColor.includes(randomColor)) {
      return; // No need to redraw
    }

    // Clear canvas with transparency
    ctx.clearRect(0, 0, width, height);

    // Get gray color based on z-index (distance from camera)
    const getGrayColorForZIndex = (zIndex: number | undefined, palette: Color[]): Color => {
      if (zIndex === undefined) {
        // Fallback to middle gray if no z-index
        return palette[Math.floor(palette.length / 2)];
      }
      
      // Normalize z-index to 0-1 range for color selection
      // Higher z-index values (closer) should get darker grays
      // Lower z-index values (distant) should get lighter grays
      const minZIndex = 1000;
      const maxZIndex = 200000;
      const normalizedZIndex = Math.max(0, Math.min(1, (zIndex - minZIndex) / (maxZIndex - minZIndex)));
      
      // Map normalized z-index to palette index
      // Higher z-index (closer) maps to darker colors (lower palette index)
      // Lower z-index (distant) maps to lighter colors (higher palette index)
      const paletteIndex = Math.floor((1 - normalizedZIndex) * (palette.length - 1));
      const clampedIndex = Math.max(0, Math.min(palette.length - 1, paletteIndex));
      
      return palette[clampedIndex];
    };
    
    const solidColor = getGrayColorForZIndex(zIndex, colorPalette);
    const solidColorRgb = hsbToRgb(solidColor.h, solidColor.s, solidColor.b, solidColor.a);

    // Draw mountain shape with solid color using stored path
    ctx.fillStyle = solidColorRgb;
    ctx.fill(shapePathRef.current!);

    // Apply random color overlay with blend mode
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = randomColor;
    ctx.fill(shapePathRef.current!);
    
    // Apply rock texture with color dodge blend mode
    if (rockTexture && textureNoise) {
      ctx.globalCompositeOperation = 'color-dodge';
      ctx.globalAlpha = 0.1; // Reduce opacity by half
      ctx.save();
      ctx.clip(shapePathRef.current!);
      
      // Apply transformations for rotation and scale
      const centerX = width / 2;
      const centerY = height / 2;
      
      ctx.translate(centerX, centerY);
      ctx.rotate((textureNoise.rotation * Math.PI) / 180); // Convert degrees to radians
      ctx.scale(textureNoise.scale, textureNoise.scale);
      ctx.translate(-centerX, -centerY);
      
      ctx.drawImage(rockTexture, 0, 0, width, height);
      ctx.restore();
      ctx.globalAlpha = 1; // Reset alpha
    }
    
    // Reset blend mode for subsequent operations
    ctx.globalCompositeOperation = 'source-over';

    // Add mist effect that varies by layer depth
    const mistHeight = height - referenceY;
    const mistStartY = referenceY - (mistHeight * 0.2); // Start mist higher up
    const gradient = ctx.createLinearGradient(0, mistStartY, 0, height);
    
    // Make mist more prominent for closer layers (higher layerIndex)
    const mistIntensity = Math.min(1, (layerIndex / maxIndex) * 1.5); // Closer layers get more mist
    const baseOpacity = 40 + (mistIntensity * 60); // 40-100 range
    
    // Create simple 2-stop gradient
    const startOpacity = 0;
    const endOpacity = baseOpacity / 240;
    gradient.addColorStop(0, `rgba(255, 255, 255, ${startOpacity})`);
    gradient.addColorStop(1, `rgba(255, 255, 255, ${endOpacity})`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, mistStartY, width, height - mistStartY);

    // Update cache
    lastColorRef.current = `${solidColorRgb}-${randomColor}`;
    lastZIndexRef.current = zIndex || 0;

  }, [width, height, layerIndex, referenceY, colorPalette, mistColor, seed, maxIndex, zIndex, rockTexture, textureNoise]);

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
