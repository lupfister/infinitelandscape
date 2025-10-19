import { useState, useEffect, useMemo, useRef } from 'react';
import MountainLayer from './components/MountainLayer';
import GodRays from './components/GodRays';
import { useAudio } from './hooks/useAudio';
import rockTexture from '/rock.png';

interface Color {
  h: number;
  s: number;
  b: number;
  a: number;
}

const NUM_LAYERS = 30;

// Mobile detection
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
         window.innerWidth <= 768;
};

// Generate color palette using the original COLOR_FAMILIES palette
const generateColorPalette = (numLayers: number, seed: number): Color[] => {
  const colors: Color[] = [];
  
  // Original color families from MountainLayer
  const COLOR_FAMILIES = {
    blues: ['#293434', '#31475B', '#5C758E'],           // Blue-gray family
    browns: ['#5A3B24', '#8D5829', '#7F6734', '#9B7D4D'], // Brown family
    greens: ['#414C39', '#5C5D3A', '#7B7442']           // Green family
  };
  
  // Convert hex colors to HSB for consistency
  const hexToHsb = (hex: string): Color => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    let h = 0;
    let s = max === 0 ? 0 : diff / max;
    let brightness = max;
    
    if (diff !== 0) {
      if (max === r) h = ((g - b) / diff) % 6;
      else if (max === g) h = (b - r) / diff + 2;
      else h = (r - g) / diff + 4;
    }
    
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    
    return {
      h: Math.round(h),
      s: Math.min(100, Math.round(s * 100 * 2.2)), // Increase saturation by 120%
      b: Math.round(brightness * 35), // Reduce brightness to 35% for much darker colors
      a: 360
    };
  };
  
  // Convert all colors to HSB format with varying saturation and lightness levels for contrast
  const colorFamilies = {
    blues: COLOR_FAMILIES.blues.map(color => {
      const hsb = hexToHsb(color);
      return { 
        ...hsb, 
        s: Math.min(100, hsb.s * 1.8), // High saturation for blues
        b: Math.min(100, hsb.b * 0.8)  // Lighter blues (80% brightness)
      };
    }),
    browns: COLOR_FAMILIES.browns.map(color => {
      const hsb = hexToHsb(color);
      return { 
        ...hsb, 
        s: Math.min(100, hsb.s * 3.0), // Very high saturation for browns
        b: Math.min(100, hsb.b * 0.25) // Very dark browns (25% brightness)
      };
    }),
    greens: COLOR_FAMILIES.greens.map(color => {
      const hsb = hexToHsb(color);
      return { 
        ...hsb, 
        s: Math.min(100, hsb.s * 1.2), // Lower saturation for greens
        b: Math.min(100, hsb.b * 0.5)  // Medium darkness greens (50% brightness)
      };
    })
  };
  
  const familyNames = Object.keys(colorFamilies);
  
  for (let i = 0; i < numLayers; i++) {
    // Create a base seed for this layer
    const baseSeed = (i * 7 + seed) % 1000;
    
    // Determine which color family to use based on layer index and seed
    // This creates "zones" of similar colors
    const familySeed = Math.floor((i + seed * 0.1) / 4) % familyNames.length; // Changes every 4 layers
    const selectedFamily = familyNames[familySeed] as keyof typeof colorFamilies;
    const familyColors = colorFamilies[selectedFamily];
    
    // Add some randomness within the family, but with bias towards similar colors
    const colorIndex = Math.floor((baseSeed + i * 0.3) % familyColors.length);
    
    // Occasionally (20% chance) pick from a different family for variety
    let finalColor = familyColors[colorIndex];
    if (baseSeed % 100 < 20) {
      const otherFamilies = familyNames.filter(name => name !== selectedFamily);
      const randomFamily = otherFamilies[Math.floor(baseSeed / 100) % otherFamilies.length] as keyof typeof colorFamilies;
      const randomFamilyColors = colorFamilies[randomFamily];
      const randomColorIndex = Math.floor(baseSeed / 10) % randomFamilyColors.length;
      finalColor = randomFamilyColors[randomColorIndex];
    }
    
    colors.push(finalColor);
  }
  
  return colors;
};

// Color palette will be generated dynamically based on mobile status

const cMist: Color = { h: 0, s: 0, b: 100, a: 360 };

// Motion + cylinder parameters
const SCROLL_SENSITIVITY = 0.6; // maps input delta to our virtual scroll units (increased for more immediate response)
const EASE = 0.25; // increased for less initial resistance and more responsive movement
const MOMENTUM_DECAY = 0.90; // 0..1, higher = slower stop (increased for sustained momentum)
const MIN_VELOCITY = 0.015; // threshold to stop momentum (lowered for longer momentum persistence)
const MAX_VELOCITY = 95; // maximum scrolling velocity to prevent excessive speed
const AUTO_SCROLL_SPEED = -1.5; // default auto-scroll speed (negative = downward, 4x faster)
const HEIGHT_MULTIPLIER = 1.5; // increase mountain canvas height
const GLOBAL_VERTICAL_OFFSET_DESKTOP = 500; // shift entire scene upward for desktop
const GLOBAL_VERTICAL_OFFSET_MOBILE = 500; // shift entire scene upward for mobile

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
const getMaxVisibleLayers = (isMobile: boolean) => isMobile ? 8 : 24; // More aggressive culling on mobile

// Uniform shape amplitude for all layers (default ~closest-layer amplitude)
const UNIFORM_MOUNTAIN_AMPLITUDE = 9;

// Cylinder radius controls (vertical rotation amplitude)
const CYLINDER_RADIUS_FRACTION = 10; // fraction of viewport height
const CYLINDER_RADIUS_MAX = 10000; // hard cap to avoid excessive travel


// Cached layer data for performance - optimized for 120fps
const layerDataCache = new Map<string, any>();
const lastCacheTime = new Map<string, number>();
// Removed unused CACHE_DURATION constant

export default function App() {
  const [seed, setSeed] = useState(Math.random() * 10000);
  const [virtualScroll, setVirtualScroll] = useState(0);
  const scrollTargetRef = useRef(0);
  const velocityRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [isMobileDevice, setIsMobileDevice] = useState(isMobile());
  
  // High refresh rate detection
  const [targetFPS, setTargetFPS] = useState(60);
  const [isHighRefreshRate, setIsHighRefreshRate] = useState(false);
  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Error state for debugging
  const [error, setError] = useState<string | null>(null);

  // Debug logging for deployment
  useEffect(() => {
    try {
      console.log('App component mounted');
      console.log('Environment:', process.env.NODE_ENV);
      console.log('Rock texture loaded:', rockTexture);
    } catch (err) {
      console.error('Error in App mount:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);
  
  // Track layer regeneration state
  const [layerRegenerationKeys, setLayerRegenerationKeys] = useState<Map<number, number>>(new Map());
  const lastVisibleLayersRef = useRef<Set<number>>(new Set());
  const isInitializedRef = useRef(false);

  // Audio state
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audio = useAudio({
    src: '/infinitelandscape.js/TheLampIsLow.mp3',
    basePitch: 0.5,
    maxPitch: 1.0,
    autoPlay: false,
    isMobile: isMobileDevice
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
      setIsMobileDevice(isMobile());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Clean up caches periodically to prevent memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      if (layerDataCache.size > 1000) {
        layerDataCache.clear();
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
    const maxLayers = isMobileDevice ? 10 : NUM_LAYERS;
    
    // Base the vertical reference on height so ultrawide screens still show layers
    let y0 = Math.max(100, viewport.height - 200);
    const i0 = 80; // base spacing per layer (larger => more spread)
    const attenuation = 1.1; // growth of divisor per layer (smaller => more spread in the back)

    const cy: number[] = new Array(maxLayers + 1);
    for (let j = 0; j <= maxLayers; j++) {
      cy[maxLayers - j] = y0;
      y0 -= i0 / Math.pow(attenuation, j);
    }

    // Create layer data for mountains 1..maxLayers
    const layers: { index: number; referenceY: number }[] = [];
    for (let j = 1; j <= maxLayers; j++) {
      layers.push({
        index: j,
        referenceY: cy[j]
      });
    }

    return layers;
  }, [viewport.height, isMobileDevice]); // Depend on height and mobile status

  // Reserved for future: manual seed regeneration (kept intentionally unused)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleRegenerate = () => {
    setSeed(Math.random() * 10000);
  };
  // Keep for future use without exposing to users
  void _handleRegenerate;

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    // Disable scroll on mobile devices
    if (isMobileDevice) {
      e.preventDefault();
      return;
    }
    
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
    // Disable touch scrolling on mobile devices
    if (isMobileDevice) {
      e.preventDefault();
      return;
    }
    
    if (e.touches.length > 0) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    // Disable touch scrolling on mobile devices
    if (isMobileDevice) {
      e.preventDefault();
      return;
    }
    
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
    // Disable touch scrolling on mobile devices
    if (isMobileDevice) {
      return;
    }
    
    touchStartYRef.current = null;
  };

  // Error boundary for debugging
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-100">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-red-800 mb-4">Error Loading App</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => setError(null)} 
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-screen w-screen overflow-hidden"
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
        } else if (e.key === 'm' && !isMobileDevice) {
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
          const maxIndex = isMobileDevice ? 10 : NUM_LAYERS;
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
              .slice(0, getMaxVisibleLayers(isMobileDevice)); // Limit visible layers
            
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
              
              const globalVerticalOffset = isMobileDevice ? GLOBAL_VERTICAL_OFFSET_MOBILE : GLOBAL_VERTICAL_OFFSET_DESKTOP;
              const translateY = globalVerticalOffset + yOffset + (1 - frontness) * DEPTH_Y_PARALLAX;
              
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
                colorPalette={generateColorPalette(maxIndex, seed)}
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
      
      
      {/* Circular Mute/Unmute Button - Hidden on mobile */}
      {!isMobileDevice && (
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
      )}

      
      {/* Animated grain overlay */}
      <div className="noise-overlay" />
      
      {/* Rock texture overlay */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundImage: `url(${rockTexture})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.1,
          mixBlendMode: 'overlay',
          zIndex: 999, // Underneath god rays
          pointerEvents: 'none'
        }}
      />
      
      {/* God rays lighting effect */}
      <GodRays />
    </div>
  );
}
