import { useState, useEffect, useMemo, useRef } from 'react';
import MountainLayer from './components/MountainLayer';

interface Color {
  h: number;
  s: number;
  b: number;
  a: number;
}

// Define color palette for gradual earth tone transition
// Rich earthy progression: deep browns → warm oranges → golden yellows → olive greens → forest tones
const colorPalette: Color[] = [
  { h: 15, s: 45, b: 12, a: 360 },   // Deep reddish brown (furthest)
  { h: 25, s: 40, b: 15, a: 360 },   // Rich sienna brown
  { h: 30, s: 35, b: 18, a: 360 },   // Warm terracotta
  { h: 35, s: 40, b: 15, a: 360 },   // Dark earth orange
  { h: 40, s: 30, b: 27, a: 360 },   // Light muted orange
  { h: 45, s: 35, b: 18, a: 360 },   // Burnt orange
  { h: 50, s: 25, b: 30, a: 360 },   // Soft peachy orange
  { h: 55, s: 30, b: 21, a: 360 },   // Golden brown
  { h: 60, s: 20, b: 33, a: 360 },   // Light muted golden yellow
  { h: 65, s: 25, b: 24, a: 360 },   // Warm golden yellow
  { h: 70, s: 15, b: 36, a: 360 },   // Very light muted yellow
  { h: 75, s: 20, b: 21, a: 360 },   // Muted yellow-green
  { h: 80, s: 18, b: 30, a: 360 },   // Light olive yellow
  { h: 85, s: 25, b: 18, a: 360 },   // Olive green
  { h: 95, s: 30, b: 15, a: 360 },   // Deep olive
  { h: 110, s: 35, b: 18, a: 360 },  // Forest green
  { h: 130, s: 30, b: 15, a: 360 },  // Dark forest green
  { h: 150, s: 25, b: 18, a: 360 },  // Muted teal-green
  { h: 170, s: 20, b: 21, a: 360 },  // Blue-green
  { h: 20, s: 50, b: 11, a: 360 }    // Very dark reddish brown (closest)
];

const cMist: Color = { h: 0, s: 0, b: 100, a: 360 };

// Motion + cylinder parameters
const SCROLL_SENSITIVITY = 0.25; // maps input delta to our virtual scroll units
const EASE = 0.12;
const MOMENTUM_DECAY = 0.94; // 0..1, lower = faster stop
const MIN_VELOCITY = 0.02; // threshold to stop momentum
const HEIGHT_MULTIPLIER = 1.5; // increase mountain canvas height
const GLOBAL_VERTICAL_OFFSET = 700; // shift entire scene upward

// Cylinder layout controls
const ROTATION_SPEED = 0.0002; // radians per virtual scroll unit
// const DEPTH_SCALE_FACTOR = 0.5; // additional scale for front-most vs back-most (unused while layers are equal size)
const DEPTH_Y_PARALLAX = 0; // vertical parallax by depth (keep 0 to keep horizon stable)

// TEMP: Global debug scale for the whole scene (set to 1 to disable)
const DEBUG_SCENE_SCALE = 1;

// Oval shape controls
const OVAL_ELLIPTICAL_FACTOR = 3; // 0 = circular, 1 = very flat oval

// Culling controls
const CULLING_FRONTNESS_THRESHOLD = 0.1; // Hide layers with frontness below this value (0 = back, 1 = front)

// Uniform shape amplitude for all layers (default ~closest-layer amplitude)
const UNIFORM_MOUNTAIN_AMPLITUDE = 9;

// Cylinder radius controls (vertical rotation amplitude)
const CYLINDER_RADIUS_FRACTION = 10; // fraction of viewport height
const CYLINDER_RADIUS_MAX = 10000; // hard cap to avoid excessive travel

const NUM_LAYERS = 60;


// Function to get background color based on the current frontmost mountain layer
const getBackgroundColor = (currentScroll: number): string => {
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
  
  // Get the color for this depth using the same interpolation logic as MountainLayer
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
  
  const frontmostColor = getColorForDepth(depth, colorPalette);
  
  // Make it lighter by increasing brightness and reducing saturation
  const lighterColor = {
    h: frontmostColor.h,
    s: Math.max(0, frontmostColor.s * 0.3), // Reduce saturation to 30%
    b: Math.min(100, frontmostColor.b + 40), // Increase brightness by 40
    a: frontmostColor.a
  };
  
  // Convert HSB to RGB
  const h = lighterColor.h / 360;
  const s = lighterColor.s / 100;
  const b = lighterColor.b / 100;
  
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
  
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(bl * 255)})`;
};

export default function App() {
  const [seed, setSeed] = useState(Math.random() * 10000);
  const [virtualScroll, setVirtualScroll] = useState(0);
  const scrollTargetRef = useRef(0);
  const velocityRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  // Debug rotation state
  const [debugRotation, setDebugRotation] = useState(false);
  const [debugRotationAngle, setDebugRotationAngle] = useState(45); // degrees

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let rafId: number;
    const animate = () => {
      // Apply momentum to the target position
      if (velocityRef.current !== 0) {
        scrollTargetRef.current += velocityRef.current;

        // Decay velocity
        velocityRef.current *= MOMENTUM_DECAY;
        if (Math.abs(velocityRef.current) < MIN_VELOCITY) velocityRef.current = 0;
      }

      const target = scrollTargetRef.current;
      const next = virtualScroll + (target - virtualScroll) * EASE;
      if (Math.abs(next - virtualScroll) > 0.001) {
        setVirtualScroll(next);
      }
      rafId = window.requestAnimationFrame(animate);
    };
    rafId = window.requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [virtualScroll]);

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
  }, [viewport.width, viewport.height]);

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
      style={{ backgroundColor: getBackgroundColor(virtualScroll) }}
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
        } else if (e.key === 'd') {
          setDebugRotation(!debugRotation);
        } else if (e.key === 'r') {
          setDebugRotationAngle(prev => (prev + 15) % 360);
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
          return mountainLayers
            .map((layer) => {
              const baseAngle = (layer.index / maxIndex) * Math.PI * 2;
              const angle = baseAngle + baseRotation;
              const frontness = (Math.cos(angle) + 1) / 2; // 0 (back) .. 1 (front)
              
              // Cull layers at the bottom of the cylinder rotation
              if (frontness < CULLING_FRONTNESS_THRESHOLD) {
                return null;
              }
              
              // Create oval movement with slower, longer movement at top and bottom
              const normalizedAngle = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
              
              // Create oval mapping: slower movement at top (0°) and bottom (180°)
              // Use a modified sine function that creates longer plateaus at extremes
              const rawSin = Math.sin(normalizedAngle);
              const ovalVerticalPosition = Math.sign(rawSin) * Math.pow(Math.abs(rawSin), 1 / (1 + OVAL_ELLIPTICAL_FACTOR)) * (1 - OVAL_ELLIPTICAL_FACTOR * 0.3);
              const yOffset = ovalVerticalPosition * verticalAmplitude;
              
              const translateY = GLOBAL_VERTICAL_OFFSET + yOffset + (1 - frontness) * DEPTH_Y_PARALLAX;
              
              // Calculate horizontal offset for debug rotation
              let horizontalOffset = 0;
              if (debugRotation) {
                const rotationRad = (debugRotationAngle * Math.PI) / 180;
                // Apply horizontal rotation based on frontness and rotation angle
                // This creates a fake horizontal rotation effect
                const horizontalRotationFactor = Math.sin(rotationRad) * frontness;
                horizontalOffset = horizontalRotationFactor * viewport.width * 0.3;
              }
              
              // Base z-index on frontness with better separation to prevent z-fighting
              // Use higher precision and ensure each layer gets a unique z-index
              // Add depth-based offset for better layer separation during transitions
              const depthOffset = (maxIndex - layer.index) * 100;
              const zIndex = 1000 + Math.floor(frontness * 100000) + layer.index * 10 + depthOffset;
              
              // Calculate progressive scaling based on z-index
              // Higher z-index (closer layers) should be progressively bigger
              const baseScale = 1.0;
              const scaleIncrement = 0.015; // Each layer gets 1.5% bigger than the previous (subtle but visible)
              const maxScale = 1.3; // Maximum scale to prevent excessive growth
              const scaleFactor = Math.min(maxScale, baseScale + (layer.index - 1) * scaleIncrement);

              return {
                layer,
                frontness,
                translateY,
                horizontalOffset,
                zIndex,
                scaleFactor
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .map(({ layer, frontness, translateY, horizontalOffset, zIndex, scaleFactor }) => (
              <div
                key={layer.index}
                className="absolute top-0 left-0"
                style={{
                  width: `${viewport.width}px`,
                  height: `${layerHeight}px`,
                  zIndex,
                  transform: `translate3d(${horizontalOffset}px, ${translateY}px, 0) scale(${scaleFactor})`,
                  transformOrigin: 'center bottom',
                  willChange: 'transform'
                }}
              >
                <MountainLayer
                  width={viewport.width}
                  height={layerHeight}
                  layerIndex={layer.index}
                  referenceY={uniformReferenceY}
                  colorPalette={colorPalette}
                  mistColor={cMist}
                  seed={seed}
                  maxIndex={maxIndex}
                  amplitude={UNIFORM_MOUNTAIN_AMPLITUDE}
                  zIndex={zIndex}
                />
              </div>
            ));
        })()}
      </div>
      
      {/* Debug UI */}
      {debugRotation && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white p-4 rounded-lg font-mono text-sm">
          <div className="mb-2">
            <strong>Debug Rotation Mode</strong>
          </div>
          <div>Angle: {debugRotationAngle}°</div>
          <div className="text-xs text-gray-300 mt-2">
            Press 'D' to toggle debug mode<br/>
            Press 'R' to rotate (+15°)
          </div>
        </div>
      )}
      
      {/* Debug rotation indicator line */}
      {debugRotation && (
        <div 
          className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 opacity-50 pointer-events-none"
          style={{
            transform: `rotate(${debugRotationAngle}deg)`,
            transformOrigin: 'center',
            zIndex: 10000
          }}
        />
      )}
      
      {/* Animated grain overlay */}
      <div className="noise-overlay" />
    </div>
  );
}
