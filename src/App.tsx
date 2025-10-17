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

// Simplified motion parameters
const SCALE_PER_SCROLL = 0.0002; // ~0.02 per 100 scroll units
const BASE_DEPTH_SCALE = 1.5; // up to +50% scale for closest layer
const TRANSLATE_PER_SCROLL = 0.2; // pixels moved per unit of virtual scroll
const SCROLL_SENSITIVITY = 1; // maps wheel deltaY to our virtual scroll units
const EASE = 0.12;
const MAX_VIRTUAL = 3000;
const HEIGHT_MULTIPLIER = 1.5; // increase mountain canvas height
const GLOBAL_VERTICAL_OFFSET = 500; // shift entire scene upward

export default function App() {
  const [seed, setSeed] = useState(Math.random() * 10000);
  const [virtualScroll, setVirtualScroll] = useState(0);
  const scrollTargetRef = useRef(0);
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
      const target = Math.max(-MAX_VIRTUAL, Math.min(MAX_VIRTUAL, scrollTargetRef.current));
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
    // Wheel up (negative deltaY) -> move down and scale up
    scrollTargetRef.current += -e.deltaY * SCROLL_SENSITIVITY;
    if (scrollTargetRef.current > MAX_VIRTUAL) scrollTargetRef.current = MAX_VIRTUAL;
    if (scrollTargetRef.current < -MAX_VIRTUAL) scrollTargetRef.current = -MAX_VIRTUAL;
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
    scrollTargetRef.current += delta * SCROLL_SENSITIVITY;
    touchStartYRef.current = currentY;
    if (scrollTargetRef.current > MAX_VIRTUAL) scrollTargetRef.current = MAX_VIRTUAL;
    if (scrollTargetRef.current < -MAX_VIRTUAL) scrollTargetRef.current = -MAX_VIRTUAL;
  };

  return (
    <div 
      className="h-screen w-screen overflow-hidden bg-gray-900"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      role="application"
      aria-label="Infinite landscape parallax viewer"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'w') {
          scrollTargetRef.current += 20;
        } else if (e.key === 'ArrowDown' || e.key === 's') {
          scrollTargetRef.current -= 20;
        }
      }}
    >
      <div className="relative h-full w-full">
        {(() => {
          // Only render the last 6 (closest) layers for performance and clarity
          const visibleLayers = mountainLayers.slice(-6);
          const maxIndex = NUM_LAYERS;
          return visibleLayers.map((layer) => {
            const depth = layer.index / maxIndex; // higher index is closer
            // Simplified linear scale and translate based solely on scroll
            const baseScale = 1 + BASE_DEPTH_SCALE * depth; // closer => larger
            const scale = baseScale * (1 + SCALE_PER_SCROLL * virtualScroll);
            const translateY = GLOBAL_VERTICAL_OFFSET + TRANSLATE_PER_SCROLL * virtualScroll;
            const layerHeight = viewport.height * HEIGHT_MULTIPLIER;

            // Simple culling in case a layer goes out of view from transforms
            const bottomY = translateY + layerHeight;
            const topY = bottomY - layerHeight * scale;
            const isVisible = topY < viewport.height && bottomY > 0;
            if (!isVisible) return null;

            return (
              <div
                key={layer.index}
                className="absolute top-0 left-0"
                style={{ 
                  width: `${viewport.width}px`, 
                  height: `${layerHeight}px`,
                  zIndex: layer.index,
                  transform: `translateY(${translateY}px) scale(${scale})`,
                  transformOrigin: 'center bottom',
                  willChange: 'transform'
                }}
              >
                <MountainLayer
                  width={viewport.width}
                  height={layerHeight}
                  layerIndex={layer.index}
                  referenceY={layer.referenceY}
                  closerColor={cCloser}
                  furtherColor={cFurther}
                  mistColor={cMist}
                  seed={seed}
                  maxIndex={maxIndex}
                />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
