import { useState, useEffect, useMemo, useRef } from 'react';
import MountainLayer from './components/MountainLayer';
import GodRays from './components/GodRays';
import { useAudio } from './hooks/useAudio';

interface Color {
  h: number;
  s: number;
  b: number;
  a: number;
}

const NUM_LAYERS = 30;

// Generate color palette using calculation for ultra-smooth 60fps atmospheric perspective
// Creates an extremely subtle gradient from dark (closest) to light (furthest)
const generateColorPalette = (numLayers: number): Color[] => {
  const colors: Color[] = [];
  
  for (let i = 0; i < numLayers; i++) {
    // Calculate normalized position (0 = closest, 1 = furthest)
    const normalizedPosition = i / (numLayers - 1);
    
    // Use cubic curve for ultra-smooth 60fps transitions
    // Much smaller brightness range for imperceptible changes
    const brightness = 12 + (normalizedPosition * normalizedPosition * normalizedPosition * 28);
    
    // Extremely subtle blue tint that's barely detectable
    const hue = 220 + (normalizedPosition * 2); // Minimal hue shift from 220 to 222
    const saturation = normalizedPosition * 3; // Ultra-low saturation, max 3%
    
    colors.push({
      h: Math.round(hue),
      s: Math.round(saturation),
      b: Math.round(brightness),
      a: 360
    });
  }
  
  return colors;
};

const colorPalette: Color[] = generateColorPalette(NUM_LAYERS);

const cMist: Color = { h: 0, s: 0, b: 100, a: 360 };

// Motion + cylinder parameters
const SCROLL_SENSITIVITY = 0.6; // maps input delta to our virtual scroll units (increased for more immediate response)
const EASE = 0.25; // increased for less initial resistance and more responsive movement
const MOMENTUM_DECAY = 0.88; // 0..1, higher = slower stop (increased for sustained momentum)
const MIN_VELOCITY = 0.005; // threshold to stop momentum (lowered for longer momentum persistence)
const MAX_VELOCITY = 75; // maximum scrolling velocity to prevent excessive speed
const AUTO_SCROLL_SPEED = -1.5; // default auto-scroll speed (negative = downward, 4x faster)
const HEIGHT_MULTIPLIER = 1.5; // increase mountain canvas height
const GLOBAL_VERTICAL_OFFSET = 500; // shift entire scene upward

// Cylinder layout controls
const ROTATION_SPEED = 0.0005; // radians per virtual scroll unit
// const DEPTH_SCALE_FACTOR = 0.5; // additional scale for front-most vs back-most (unused while layers are equal size)
const DEPTH_Y_PARALLAX = 0; // vertical parallax by depth (keep 0 to keep horizon stable)

// TEMP: Global debug scale for the whole scene (set to 1 to disable)
const DEBUG_SCENE_SCALE = 1;

// Oval shape controls
const OVAL_ELLIPTICAL_FACTOR = 3; // 0 = circular, 1 = very flat oval

// Culling controls
const CULLING_FRONTNESS_THRESHOLD = 0.1; // Hide layers with frontness below this value (0 = back, 1 = front)
const MAX_VISIBLE_LAYERS = 50; // Maximum number of layers to render at once

// Uniform shape amplitude for all layers (default ~closest-layer amplitude)
const UNIFORM_MOUNTAIN_AMPLITUDE = 9;

// Cylinder radius controls (vertical rotation amplitude)
const CYLINDER_RADIUS_FRACTION = 10; // fraction of viewport height
const CYLINDER_RADIUS_MAX = 10000; // hard cap to avoid excessive travel


// Cached color calculations for performance - optimized for 120fps
const colorCache = new Map<string, string>();
const colorCalculationCache = new Map<number, Color>();
const layerDataCache = new Map<string, any>();
const lastCacheTime = new Map<string, number>();
// Removed unused CACHE_DURATION constant

// Optimized color calculation functions
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

const getColorForDepth = (depth: number, palette: Color[]): Color => {
  if (depth <= 0) return palette[0];
  if (depth >= 1) return palette[palette.length - 1];
  
  const scaledDepth = depth * (palette.length - 1);
  const index = Math.floor(scaledDepth);
  const t = scaledDepth - index;
  
  if (index >= palette.length - 1) return palette[palette.length - 1];
  
  const c1 = palette[index];
  const c2 = palette[index + 1];
  
  return {
    h: c1.h + (c2.h - c1.h) * t,
    s: c1.s + (c2.s - c1.s) * t,
    b: c1.b + (c2.b - c1.b) * t,
    a: c1.a + (c2.a - c1.a) * t
  };
};

// Function to get background color based on the current frontmost mountain layer
const getBackgroundColor = (currentScroll: number, isHighRefresh: boolean = false): string => {
  // Use adaptive precision based on refresh rate for better performance
  const precision = isHighRefresh ? 5 : 10; // Higher precision for 120fps
  const scrollKey = Math.floor(currentScroll * precision) / precision;
  const cacheKey = scrollKey.toString();
  
  // Check cache with time-based expiration
  const now = performance.now();
  const lastTime = lastCacheTime.get(cacheKey) || 0;
  const cacheDuration = isHighRefresh ? 8 : 16; // 8ms for 120fps, 16ms for 60fps
  
  if (colorCache.has(cacheKey) && (now - lastTime) < cacheDuration) {
    return colorCache.get(cacheKey)!;
  }
  
  // Calculate which layer is currently frontmost based on scroll position
  const baseRotation = ((currentScroll * ROTATION_SPEED) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  
  // Find the layer with the highest frontness (closest to 1)
  let maxFrontness = 0;
  let frontmostLayerIndex = 1;
  
  for (let j = 1; j <= NUM_LAYERS; j++) {
    const baseAngle = (j / NUM_LAYERS) * Math.PI * 2;
    const angle = baseAngle + baseRotation;
    const frontness = (Math.cos(angle) + 1) / 2; // 0 (back) .. 1 (front)
    
    if (frontness > maxFrontness) {
      maxFrontness = frontness;
      frontmostLayerIndex = j;
    }
  }
  
  // Calculate the depth for this layer (same logic as in MountainLayer)
  const depth = Math.max(0.0001, frontmostLayerIndex / NUM_LAYERS);
  
  // Check cache for color calculation
  const depthKey = Math.floor(depth * 1000) / 1000; // Round to 0.001 precision
  if (colorCalculationCache.has(depthKey)) {
    const frontmostColor = colorCalculationCache.get(depthKey)!;
    
    // Make it lighter by increasing brightness and reducing saturation
    const lighterColor = {
      h: frontmostColor.h,
      s: Math.max(0, frontmostColor.s * 0.3), // Reduce saturation to 30%
      b: Math.min(100, frontmostColor.b + 40), // Increase brightness by 40
      a: frontmostColor.a
    };
    
    const result = hsbToRgb(lighterColor.h, lighterColor.s, lighterColor.b, lighterColor.a);
    colorCache.set(cacheKey, result);
    lastCacheTime.set(cacheKey, now);
    return result;
  }
  
  const frontmostColor = getColorForDepth(depth, colorPalette);
  colorCalculationCache.set(depthKey, frontmostColor);
  
  // Make it lighter by increasing brightness and reducing saturation
  const lighterColor = {
    h: frontmostColor.h,
    s: Math.max(0, frontmostColor.s * 0.3), // Reduce saturation to 30%
    b: Math.min(100, frontmostColor.b + 40), // Increase brightness by 40
    a: frontmostColor.a
  };
  
  const result = hsbToRgb(lighterColor.h, lighterColor.s, lighterColor.b, lighterColor.a);
  colorCache.set(cacheKey, result);
  lastCacheTime.set(cacheKey, now);
  return result;
};

export default function App() {
  const [seed, setSeed] = useState(Math.random() * 10000);
  const [virtualScroll, setVirtualScroll] = useState(0);
  const scrollTargetRef = useRef(0);
  const velocityRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  // High refresh rate detection
  const [targetFPS, setTargetFPS] = useState(60);
  const [isHighRefreshRate, setIsHighRefreshRate] = useState(false);
  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Track layer regeneration state
  const [layerRegenerationKeys, setLayerRegenerationKeys] = useState<Map<number, number>>(new Map());
  const lastVisibleLayersRef = useRef<Set<number>>(new Set());
  const isInitializedRef = useRef(false);

  // Audio state
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audio = useAudio({
    src: '/TheLampIsLow.mp3',
    basePitch: 0.5,
    maxPitch: 1.0,
    autoPlay: false
  });

  // Detect high refresh rate displays - improved detection
  useEffect(() => {
    let frameCount = 0;
    let startTime = performance.now();
    let rafId: number;
    let measurements: number[] = [];
    let measurementCount = 0;
    const maxMeasurements = 3; // Take 3 measurements for accuracy

    const measureRefreshRate = () => {
      frameCount++;
      const currentTime = performance.now();
      const elapsed = currentTime - startTime;
      
      if (elapsed >= 2000) { // Measure for 2 seconds for better accuracy
        const fps = Math.round((frameCount * 1000) / elapsed);
        measurements.push(fps);
        measurementCount++;
        
        console.log(`Refresh rate measurement ${measurementCount}: ${fps}fps`);
        
        if (measurementCount < maxMeasurements) {
          // Reset for next measurement
          frameCount = 0;
          startTime = currentTime;
          rafId = requestAnimationFrame(measureRefreshRate);
        } else {
          // Calculate average of all measurements
          const avgFps = Math.round(measurements.reduce((a, b) => a + b, 0) / measurements.length);
          const isHighRefresh = avgFps >= 90; // Lowered threshold to 90fps for better detection
          
          setTargetFPS(isHighRefresh ? 120 : 60);
          setIsHighRefreshRate(isHighRefresh);
          console.log(`Final refresh rate detection: ${avgFps}fps (avg of ${measurements.join(', ')}), using ${isHighRefresh ? 120 : 60}fps target`);
        }
      } else {
        rafId = requestAnimationFrame(measureRefreshRate);
      }
    };

    // Delay the measurement to ensure the page is fully loaded
    const timeoutId = setTimeout(() => {
      rafId = requestAnimationFrame(measureRefreshRate);
    }, 1000);
    
    return () => {
      clearTimeout(timeoutId);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Clean up caches periodically to prevent memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      if (colorCache.size > 1000) {
        colorCache.clear();
      }
      if (colorCalculationCache.size > 1000) {
        colorCalculationCache.clear();
      }
    }, 30000); // Clean up every 30 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  useEffect(() => {
    let rafId: number;
    let lastUpdateTime = 0;
    const frameInterval = 1000 / targetFPS;
    
    const animate = (currentTime: number) => {
      
      // Throttle updates to target FPS
      if (currentTime - lastUpdateTime < frameInterval) {
        rafId = window.requestAnimationFrame(animate);
        return;
      }
      lastUpdateTime = currentTime;
      
      // Apply auto-scroll if enabled
      if (autoScroll) {
        scrollTargetRef.current += AUTO_SCROLL_SPEED;
        
        // Update audio pitch based on auto-scroll speed if audio is enabled
        if (audioEnabled) {
          audio.setPitchFromVelocity(AUTO_SCROLL_SPEED);
        }
      }

      // Apply momentum to the target position
      if (velocityRef.current !== 0) {
        // Clamp velocity to maximum speed
        velocityRef.current = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocityRef.current));
        
        scrollTargetRef.current += velocityRef.current;

        // Update audio pitch based on velocity if audio is enabled
        if (audioEnabled) {
          audio.setPitchFromVelocity(velocityRef.current);
        }

        // Decay velocity
        velocityRef.current *= MOMENTUM_DECAY;
        if (Math.abs(velocityRef.current) < MIN_VELOCITY) velocityRef.current = 0;
      }

      const target = scrollTargetRef.current;
      const next = virtualScroll + (target - virtualScroll) * EASE;
      
      // Only update state if there's a meaningful change
      // Use smaller threshold for higher refresh rates for smoother animation
      const changeThreshold = isHighRefreshRate ? 0.0005 : 0.001;
      if (Math.abs(next - virtualScroll) > changeThreshold) {
        setVirtualScroll(next);
      }
      
      rafId = window.requestAnimationFrame(animate);
    };
    rafId = window.requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [virtualScroll, targetFPS, isHighRefreshRate, autoScroll]);

  // Memoize mountain layers calculation so it doesn't recreate on every render
  const mountainLayers = useMemo(() => {
    // Base the vertical reference on height so ultrawide screens still show layers
    let y0 = Math.max(100, viewport.height - 200);
    const i0 = 80; // base spacing per layer (larger => more spread)
    const attenuation = 1.1; // growth of divisor per layer (smaller => more spread in the back)

    const cy: number[] = new Array(NUM_LAYERS + 1);
    for (let j = 0; j <= NUM_LAYERS; j++) {
      cy[NUM_LAYERS - j] = y0;
      y0 -= i0 / Math.pow(attenuation, j);
    }

    // Create layer data for mountains 1..NUM_LAYERS
    const layers: { index: number; referenceY: number }[] = [];
    for (let j = 1; j <= NUM_LAYERS; j++) {
      layers.push({
        index: j,
        referenceY: cy[j]
      });
    }

    return layers;
  }, [viewport.height]); // Only depend on height, not width

  // Reserved for future: manual seed regeneration (kept intentionally unused)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleRegenerate = () => {
    setSeed(Math.random() * 10000);
  };
  // Keep for future use without exposing to users
  void _handleRegenerate;

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    // Wheel up (negative deltaY) -> forward
    const delta = -e.deltaY * SCROLL_SENSITIVITY;
    
    // Apply speed multiplier based on current scroll position using oval movement
    const currentRotation = ((virtualScroll * ROTATION_SPEED) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const rawSin = Math.sin(currentRotation);
    const ovalVerticalPosition = Math.sign(rawSin) * Math.pow(Math.abs(rawSin), 1 / (1 + OVAL_ELLIPTICAL_FACTOR)) * (1 - OVAL_ELLIPTICAL_FACTOR * 0.3);
    const topThreshold = 0.6;
    const speedMultiplier = Math.abs(ovalVerticalPosition) > topThreshold 
      ? 1 - (Math.abs(ovalVerticalPosition) - topThreshold) / (1 - topThreshold) * 0.8
      : 1;
    
    velocityRef.current += delta * speedMultiplier;
  };

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (e.touches.length > 0) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (touchStartYRef.current == null) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - touchStartYRef.current;
    
    // Apply speed multiplier based on current scroll position using oval movement
    const currentRotation = ((virtualScroll * ROTATION_SPEED) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const rawSin = Math.sin(currentRotation);
    const ovalVerticalPosition = Math.sign(rawSin) * Math.pow(Math.abs(rawSin), 1 / (1 + OVAL_ELLIPTICAL_FACTOR)) * (1 - OVAL_ELLIPTICAL_FACTOR * 0.3);
    const topThreshold = 0.6;
    const speedMultiplier = Math.abs(ovalVerticalPosition) > topThreshold 
      ? 1 - (Math.abs(ovalVerticalPosition) - topThreshold) / (1 - topThreshold) * 0.8
      : 1;
    
    // Swipe up (negative delta) moves forward
    velocityRef.current += delta * SCROLL_SENSITIVITY * speedMultiplier;
    touchStartYRef.current = currentY;
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    touchStartYRef.current = null;
  };

  return (
    <div 
      className="h-screen w-screen overflow-hidden"
      style={{ backgroundColor: getBackgroundColor(virtualScroll, isHighRefreshRate) }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="application"
      aria-label="Infinite landscape parallax viewer"
      tabIndex={0}
      onKeyDown={(e) => {
        // Apply speed multiplier based on current scroll position using oval movement
        const currentRotation = ((virtualScroll * ROTATION_SPEED) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const rawSin = Math.sin(currentRotation);
        const ovalVerticalPosition = Math.sign(rawSin) * Math.pow(Math.abs(rawSin), 1 / (1 + OVAL_ELLIPTICAL_FACTOR)) * (1 - OVAL_ELLIPTICAL_FACTOR * 0.3);
        const topThreshold = 0.6;
        const speedMultiplier = Math.abs(ovalVerticalPosition) > topThreshold 
          ? 1 - (Math.abs(ovalVerticalPosition) - topThreshold) / (1 - topThreshold) * 0.8
          : 1;
        
        if (e.key === 'ArrowUp' || e.key === 'w') {
          velocityRef.current += 20 * speedMultiplier;
        } else if (e.key === 'ArrowDown' || e.key === 's') {
          velocityRef.current -= 20 * speedMultiplier;
        } else if (e.key === 'a') {
          setAutoScroll(!autoScroll);
        } else if (e.key === 'm') {
          setAudioEnabled(!audioEnabled);
          if (!audioEnabled) {
            audio.play();
          } else {
            audio.pause();
          }
        }
      }}
    >
      <div
        className="absolute"
        style={{
          top: '50%',
          left: '50%',
          width: `${viewport.width}px`,
          height: `${viewport.height * HEIGHT_MULTIPLIER}px`,
          transform: `translate(-50%, -50%) scale(${DEBUG_SCENE_SCALE})`,
          transformOrigin: 'center'
        }}
      >
        {(() => {
          const maxIndex = NUM_LAYERS;
          const layerHeight = viewport.height * HEIGHT_MULTIPLIER;
          const baseRotation = ((virtualScroll * ROTATION_SPEED) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const verticalAmplitude = Math.min(CYLINDER_RADIUS_MAX, viewport.height * CYLINDER_RADIUS_FRACTION);

          const uniformReferenceY = Math.max(100, viewport.height - 200);
          
          // Pre-calculate all layer data for better performance with caching
          const layerDataKey = `${baseRotation.toFixed(4)}-${maxIndex}`;
          const now = performance.now();
          const lastLayerDataTime = lastCacheTime.get(layerDataKey) || 0;
          const layerCacheDuration = 8; // Optimized for 120fps by default
          
          let layerData;
          if (layerDataCache.has(layerDataKey) && (now - lastLayerDataTime) < layerCacheDuration) {
            layerData = layerDataCache.get(layerDataKey);
          } else {
            layerData = mountainLayers
              .map((layer) => {
                const baseAngle = (layer.index / maxIndex) * Math.PI * 2;
                const angle = baseAngle + baseRotation;
                const frontness = (Math.cos(angle) + 1) / 2; // 0 (back) .. 1 (front)
                
                return {
                  layer,
                  frontness,
                  angle
                };
              })
              .filter(({ frontness }) => frontness > CULLING_FRONTNESS_THRESHOLD) // Early culling
              .sort((a, b) => b.frontness - a.frontness) // Sort by frontness (closest first)
              .slice(0, MAX_VISIBLE_LAYERS); // Limit visible layers
            
            // Cache the layer data
            layerDataCache.set(layerDataKey, layerData);
            lastCacheTime.set(layerDataKey, now);
          }
          
          // Track visible layers and trigger regeneration for newly visible layers
          const currentVisibleLayers = new Set<number>(layerData.map(({ layer }: any) => layer.index));
          const lastVisibleLayers = lastVisibleLayersRef.current;
          
          // Only check for regeneration after initial load
          if (isInitializedRef.current) {
            // Check for layers that became visible (were culled before, now visible)
            const newlyVisibleLayers = new Set<number>();
            currentVisibleLayers.forEach((layerIndex: number) => {
              if (!lastVisibleLayers.has(layerIndex)) {
                newlyVisibleLayers.add(layerIndex);
              }
            });
            
            // Update regeneration keys for newly visible layers
            if (newlyVisibleLayers.size > 0) {
              setLayerRegenerationKeys(prev => {
                const newKeys = new Map(prev);
                newlyVisibleLayers.forEach(layerIndex => {
                  const newKey = (newKeys.get(layerIndex) || 0) + 1;
                  newKeys.set(layerIndex, newKey);
                });
                return newKeys;
              });
            }
          } else {
            // Mark as initialized after first render
            isInitializedRef.current = true;
          }
          
          // Update the last visible layers reference
          lastVisibleLayersRef.current = currentVisibleLayers;
          
          // Continue with the mapping
          const processedLayerData = layerData.map(({ layer, frontness, angle }: any) => {
              // Calculate opacity based on frontness for atmospheric perspective
              let opacity = 1;
              
              // Create atmospheric perspective: distant layers (low frontness) have lower opacity
              const atmosphericFadeStart = 0.3; // Start fading distant layers when frontness < 0.3
              const atmosphericFadeEnd = 0.1; // Complete fade when frontness < 0.1
              const cullingFadeStart = CULLING_FRONTNESS_THRESHOLD;
              const cullingFadeEnd = Math.max(0, cullingFadeStart - 0.15);
              
              if (frontness <= cullingFadeEnd) {
                // Complete culling for very distant layers
                opacity = 0;
              } else if (frontness <= cullingFadeStart) {
                // Smooth fade-out for culling threshold
                opacity = (frontness - cullingFadeEnd) / (cullingFadeStart - cullingFadeEnd);
              } else if (frontness <= atmosphericFadeStart) {
                // Atmospheric perspective fade for distant layers
                const atmosphericOpacity = (frontness - atmosphericFadeEnd) / (atmosphericFadeStart - atmosphericFadeEnd);
                // Scale opacity from 0.3 to 1.0 for atmospheric effect
                opacity = 0.3 + (atmosphericOpacity * 0.7);
              } else {
                // Close layers maintain full opacity
                opacity = 1;
              }
              
              // Create oval movement with slower, longer movement at top and bottom
              const normalizedAngle = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
              
              // Create oval mapping: slower movement at top (0°) and bottom (180°)
              // Use a modified sine function that creates longer plateaus at extremes
              const rawSin = Math.sin(normalizedAngle);
              const ovalVerticalPosition = Math.sign(rawSin) * Math.pow(Math.abs(rawSin), 1 / (1 + OVAL_ELLIPTICAL_FACTOR)) * (1 - OVAL_ELLIPTICAL_FACTOR * 0.3);
              const yOffset = ovalVerticalPosition * verticalAmplitude;
              
              const translateY = GLOBAL_VERTICAL_OFFSET + yOffset + (1 - frontness) * DEPTH_Y_PARALLAX;
              
              // No horizontal offset needed
              const horizontalOffset = 0;
              
              // Base z-index on frontness with better separation to prevent z-fighting
              // Use higher precision and ensure each layer gets a unique z-index
              // Add depth-based offset for better layer separation during transitions
              const depthOffset = (maxIndex - layer.index) * 100;
              const zIndex = 1000 + Math.floor(frontness * 100000) + layer.index * 10 + depthOffset;
              
              // All layers use the same scale
              const scaleFactor = 1.0;

              return {
                layer,
                frontness,
                translateY,
                horizontalOffset,
                zIndex,
                scaleFactor,
                opacity
              };
            });
          
          return processedLayerData.map(({ layer, frontness, translateY, horizontalOffset, zIndex, scaleFactor, opacity }: any) => {
            const regenerationKey = layerRegenerationKeys.get(layer.index) || 0;
            
            // Calculate progressive blur based on distance (frontness)
            // Use a curve that ensures middle layers also get some blur
            const maxBlur = 8; // Maximum blur for the most distant layers
            const minBlur = 0.5; // Minimum blur for closest layers (ensures even closest layers have slight blur)
            const blurAmount = minBlur + (1 - frontness) * (maxBlur - minBlur); // Gradual blur from minBlur to maxBlur
            
            return (
            <div
              key={`${layer.index}-${regenerationKey}`}
              className="absolute top-0 left-0"
              style={{
                width: `${viewport.width}px`,
                height: `${layerHeight}px`,
                zIndex,
                transform: `translate3d(${horizontalOffset}px, ${translateY}px, 0) scale(${scaleFactor})`,
                transformOrigin: 'center bottom',
                willChange: 'transform, opacity',
                opacity,
                transition: 'opacity 0.3s ease-out',
                filter: `blur(${blurAmount}px)`
              }}
            >
              <MountainLayer
                width={viewport.width}
                height={layerHeight}
                layerIndex={layer.index}
                referenceY={uniformReferenceY}
                colorPalette={colorPalette}
                mistColor={cMist}
                seed={seed + regenerationKey * 1000} // Add regeneration key to seed for new mountain
                maxIndex={maxIndex}
                amplitude={UNIFORM_MOUNTAIN_AMPLITUDE}
                zIndex={zIndex}
              />
            </div>
            );
          });
        })()}
      </div>
      
      
      {/* Circular Mute/Unmute Button */}
      <button
        onClick={() => {
          setAudioEnabled(!audioEnabled);
          if (!audioEnabled) {
            audio.play();
          } else {
            audio.pause();
          }
        }}
        style={{
          position: 'absolute',
          top: '8px',
          right: '12px',
          width: '56px',
          height: '56px',
          backgroundColor: 'transparent',
          color: '#92400e',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          zIndex: 10000
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(0.9)';
          e.currentTarget.style.color = '#78350f';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.color = '#92400e';
        }}
        aria-label={audioEnabled ? "Mute audio" : "Unmute audio"}
        title={audioEnabled ? "Mute audio" : "Unmute audio"}
      >
        {audioEnabled ? (
          // Unmute icon (speaker with sound waves)
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        ) : (
          // Mute icon (speaker with X)
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>
        )}
      </button>

      
      {/* Animated grain overlay */}
      <div className="noise-overlay" />
      
      {/* God rays lighting effect */}
      <GodRays />
    </div>
  );
}
