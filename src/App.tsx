import { useState, useEffect, useMemo, useRef } from 'react';
import MountainLayer from './components/MountainLayer';

interface Color {
  h: number;
  s: number;
  b: number;
  a: number;
}

// Define colors outside component to keep them stable
const cFurther: Color = { h: 230, s: 25, b: 90, a: 360 };
const cCloser: Color = { h: 210, s: 70, b: 10, a: 360 };
const cMist: Color = { h: 0, s: 0, b: 100, a: 360 };

// Motion + cylinder parameters
const SCROLL_SENSITIVITY = 1; // maps input delta to our virtual scroll units
const EASE = 0.12;
const MOMENTUM_DECAY = 0.94; // 0..1, lower = faster stop
const MIN_VELOCITY = 0.02; // threshold to stop momentum
const HEIGHT_MULTIPLIER = 1.5; // increase mountain canvas height
const GLOBAL_VERTICAL_OFFSET = 1000; // shift entire scene upward

// Cylinder layout controls
const ROTATION_SPEED = 0.0002; // radians per virtual scroll unit
// const DEPTH_SCALE_FACTOR = 0.5; // additional scale for front-most vs back-most (unused while layers are equal size)
const DEPTH_Y_PARALLAX = 0; // vertical parallax by depth (keep 0 to keep horizon stable)

// TEMP: Global debug scale for the whole scene (set to 1 to disable)
const DEBUG_SCENE_SCALE = .9;

// Uniform shape amplitude for all layers (default ~closest-layer amplitude)
const UNIFORM_MOUNTAIN_AMPLITUDE = 9;

// Cylinder radius controls (vertical rotation amplitude)
const CYLINDER_RADIUS_FRACTION = 3; // fraction of viewport height
const CYLINDER_RADIUS_MAX = 1500; // hard cap to avoid excessive travel

export default function App() {
  const [seed, setSeed] = useState(Math.random() * 10000);
  const [virtualScroll, setVirtualScroll] = useState(0);
  const scrollTargetRef = useRef(0);
  const velocityRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });

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

  const NUM_LAYERS = 30;

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
    velocityRef.current += delta;
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
    // Swipe up (negative delta) moves forward
    velocityRef.current += delta * SCROLL_SENSITIVITY;
    touchStartYRef.current = currentY;
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    touchStartYRef.current = null;
  };

  return (
    <div 
      className="h-screen w-screen overflow-hidden bg-gray-900"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="application"
      aria-label="Infinite landscape parallax viewer"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'w') {
          velocityRef.current += 20;
        } else if (e.key === 'ArrowDown' || e.key === 's') {
          velocityRef.current -= 20;
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
          const rotation = ((virtualScroll * ROTATION_SPEED) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const verticalAmplitude = Math.min(CYLINDER_RADIUS_MAX, viewport.height * CYLINDER_RADIUS_FRACTION);

          const uniformReferenceY = Math.max(100, viewport.height - 200);
          return mountainLayers.map((layer) => {
            const angle = ((layer.index / maxIndex) * Math.PI * 2) + rotation;
            const frontness = (Math.cos(angle) + 1) / 2; // 0 (back) .. 1 (front)
            const yOffset = Math.sin(angle) * verticalAmplitude;
            const translateY = GLOBAL_VERTICAL_OFFSET + yOffset + (1 - frontness) * DEPTH_Y_PARALLAX;
            // keep all layers same height/size

            const zIndex = 100 + Math.round(frontness * 1000) + layer.index; // stable tie-breaker

            return (
              <div
                key={layer.index}
                className="absolute top-0 left-0"
                style={{
                  width: `${viewport.width}px`,
                  height: `${layerHeight}px`,
                  zIndex,
                  transform: `translateY(${translateY}px)`,
                  transformOrigin: 'center bottom',
                  willChange: 'transform'
                }}
              >
                <MountainLayer
                  width={viewport.width}
                  height={layerHeight}
                  layerIndex={layer.index}
                  referenceY={uniformReferenceY}
                  closerColor={cCloser}
                  furtherColor={cFurther}
                  mistColor={cMist}
                  seed={seed}
                  maxIndex={maxIndex}
                  amplitude={UNIFORM_MOUNTAIN_AMPLITUDE}
                />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
