import { GodRays as GodRays1 } from '@paper-design/shaders-react';

/**
 * GodRays component using Paper shaders
 * Code exported from Paper
 * https://app.paper.design/file/01K3M7BSDPKG8E6RAAVT410MQ4?node=01K7TZPQEW7YYGG0GVJ34G0E36
 * on Oct 17, 2025 at 11:23 PM.
 */
export default function GodRays() {
  // Adjustable intensity settings - modify these values:
  const INTENSITY = 0.4;        // Main intensity (0.1 = subtle, 0.5 = moderate, 0.8 = strong)
  const MID_INTENSITY = 0.5;    // Mid-range intensity (0.3 = subtle, 0.6 = moderate, 0.9 = strong)
  const BLOOM = 0.6;            // Bloom intensity (0.3 = subtle, 0.6 = moderate, 1.0 = strong)
  const DENSITY = 0.08;         // Ray density (0.05 = sparse, 0.1 = moderate, 0.15 = dense)
  
  return (
    <GodRays1 
      colorBack="#00000000" 
      colors={['#FFFFFF1F', '#FFFFFF3D', '#FFFFFF29']} 
      colorBloom="#FFE19C" 
      offsetX={0} 
      offsetY={-0.65} 
      intensity={INTENSITY} 
      spotty={0.59} 
      midSize={1} 
      midIntensity={MID_INTENSITY} 
      density={DENSITY} 
      bloom={BLOOM} 
      speed={1.28} 
      scale={1} 
      frame={16742.770000000215} 
      style={{ 
        backgroundColor: '#00000000', 
        height: '100vh', 
        width: '100vw',
        position: 'absolute',
        top: 0,
        left: 0,
        mixBlendMode: 'multiply',
        pointerEvents: 'none',
        zIndex: 1000
      }} 
    />
  );
}
