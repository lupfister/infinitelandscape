import { useRef, useEffect, useState, useCallback } from 'react';

interface UseAudioOptions {
  src: string;
  basePitch?: number;
  maxPitch?: number;
  autoPlay?: boolean;
  isMobile?: boolean;
}

interface UseAudioReturn {
  isPlaying: boolean;
  volume: number;
  pitch: number;
  play: () => void;
  pause: () => void;
  setVolume: (volume: number) => void;
  setPitch: (pitch: number) => void;
  setPitchFromVelocity: (velocity: number) => void;
}

export const useAudio = ({
  src,
  basePitch = 0.7,
  maxPitch = 1.0,
  autoPlay = false,
  isMobile = false
}: UseAudioOptions): UseAudioReturn => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.3);
  const [pitch, setPitchState] = useState(basePitch);
  const [useFallback, setUseFallback] = useState(false);

  // Initialize audio context (skip on mobile)
  useEffect(() => {
    if (isMobile) {
      console.log('Audio disabled on mobile device');
      return;
    }

    const initAudioContext = async () => {
      try {
        // Create audio context
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('Audio context created:', audioContextRef.current.state);
        
        // Create gain node for volume control
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        gainNodeRef.current.gain.value = volume;

        // Load audio file
        console.log('Loading audio file:', src);
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio file: ${response.status} ${response.statusText}. URL: ${src}`);
        }
        console.log('Audio file fetch successful, content-type:', response.headers.get('content-type'));
        const arrayBuffer = await response.arrayBuffer();
        console.log('Audio file array buffer size:', arrayBuffer.byteLength);
        audioBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer);
        console.log('Audio file decoded successfully, duration:', audioBufferRef.current.duration);

        if (autoPlay) {
          play();
        }
      } catch (error) {
        console.error('Failed to initialize Web Audio API:', error);
        console.log('Falling back to HTML5 Audio...');
        
        // Reset references on error
        audioContextRef.current = null;
        audioBufferRef.current = null;
        gainNodeRef.current = null;
        
        // Initialize fallback HTML5 Audio
        try {
          fallbackAudioRef.current = new Audio(src);
          fallbackAudioRef.current.loop = true;
          fallbackAudioRef.current.volume = volume;
          fallbackAudioRef.current.preload = 'auto';
          setUseFallback(true);
          console.log('HTML5 Audio fallback initialized successfully');
        } catch (fallbackError) {
          console.error('Failed to initialize HTML5 Audio fallback:', fallbackError);
        }
      }
    };

    initAudioContext();

    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [src, autoPlay, isMobile]);

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
    if (fallbackAudioRef.current) {
      fallbackAudioRef.current.volume = volume;
    }
  }, [volume]);

  const play = useCallback(async () => {
    if (isMobile) {
      console.log('Audio play blocked on mobile device');
      return;
    }

    if (isPlaying) {
      console.log('Audio already playing');
      return;
    }

    // Use fallback HTML5 Audio if Web Audio API failed
    if (useFallback && fallbackAudioRef.current) {
      try {
        console.log('Playing audio with HTML5 Audio fallback...');
        await fallbackAudioRef.current.play();
        setIsPlaying(true);
        console.log('HTML5 Audio playback started successfully');
        return;
      } catch (error) {
        console.error('Failed to play HTML5 Audio:', error);
        return;
      }
    }

    if (!audioContextRef.current || !audioBufferRef.current) {
      console.log('Audio play blocked:', {
        hasContext: !!audioContextRef.current,
        hasBuffer: !!audioBufferRef.current,
        useFallback
      });
      return;
    }

    try {
      console.log('Attempting to play audio with Web Audio API...');
      
      // Resume audio context if suspended (required for user interaction)
      if (audioContextRef.current.state === 'suspended') {
        console.log('Resuming suspended audio context...');
        await audioContextRef.current.resume();
      }

      // Stop any existing playback
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch (e) {
          // Ignore errors from stopping already stopped nodes
        }
        sourceNodeRef.current = null;
      }

      // Create new source node
      sourceNodeRef.current = audioContextRef.current.createBufferSource();
      sourceNodeRef.current.buffer = audioBufferRef.current;
      sourceNodeRef.current.playbackRate.value = pitch;
      sourceNodeRef.current.loop = true; // Loop the audio
      
      // Connect to gain node
      sourceNodeRef.current.connect(gainNodeRef.current!);
      
      // Handle end of playback
      sourceNodeRef.current.onended = () => {
        console.log('Audio playback ended');
        setIsPlaying(false);
        sourceNodeRef.current = null;
      };

      // Start playback
      sourceNodeRef.current.start();
      setIsPlaying(true);
      console.log('Web Audio API playback started successfully');
    } catch (error) {
      console.error('Failed to play audio with Web Audio API:', error);
    }
  }, [isPlaying, pitch, useFallback]);

  const pause = useCallback(() => {
    if (isMobile) {
      console.log('Audio pause blocked on mobile device');
      return;
    }

    if (useFallback && fallbackAudioRef.current && isPlaying) {
      fallbackAudioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (sourceNodeRef.current && isPlaying) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
      setIsPlaying(false);
    }
  }, [isPlaying, isMobile, useFallback]);

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(Math.max(0, Math.min(1, newVolume)));
  }, []);

  const setPitch = useCallback((newPitch: number) => {
    const clampedPitch = Math.max(0.1, Math.min(2, newPitch));
    setPitchState(clampedPitch);
    
    // Update playback rate if currently playing
    if (sourceNodeRef.current && isPlaying) {
      sourceNodeRef.current.playbackRate.value = clampedPitch;
    }
  }, [isPlaying]);

  const setPitchFromVelocity = useCallback((velocity: number) => {
    if (isMobile) {
      return; // Skip pitch adjustment on mobile
    }

    // Map velocity to pitch range
    // Base pitch is 0.5, max pitch is 1.0
    // Use absolute velocity for pitch calculation
    const absVelocity = Math.abs(velocity);
    const normalizedVelocity = Math.min(absVelocity / 50, 1); // Normalize to 0-1 range
    const newPitch = basePitch + (normalizedVelocity * (maxPitch - basePitch));
    
    setPitch(newPitch);
  }, [basePitch, maxPitch, setPitch, isMobile]);

  return {
    isPlaying,
    volume,
    pitch,
    play,
    pause,
    setVolume,
    setPitch,
    setPitchFromVelocity
  };
};
