import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LakesideScene, LakesideSceneStats } from './scene/LakesideScene';
import {
  computeSunState,
  DEFAULT_SUN_AZIMUTH,
  DEFAULT_SUN_ELEVATION,
  SUN_PRESETS,
  SunPresetId,
} from './utils/sunMath';
import { computeBreezeState } from './utils/waterRipples';
import { CameraPresetId } from './scene/cameraPresets';
import { ControlDock } from './components/ControlDock';

const DEFAULT_WIND_STRENGTH = 0.35;

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<LakesideScene | null>(null);

  const [elevation, setElevation] = useState<number>(DEFAULT_SUN_ELEVATION);
  const [azimuth, setAzimuth] = useState<number>(DEFAULT_SUN_AZIMUTH);
  const [windStrength, setWindStrength] = useState<number>(DEFAULT_WIND_STRENGTH);
  const [rippleCount, setRippleCount] = useState<number>(0);
  const [activePreset, setActivePreset] = useState<SunPresetId | null>(null);
  const [activeCamera, setActiveCamera] = useState<CameraPresetId>('panorama');
  const [isAutoOrbit, setIsAutoOrbit] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [sceneStats, setSceneStats] = useState<LakesideSceneStats | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const sunState = useMemo(
    () => computeSunState(elevation, azimuth),
    [elevation, azimuth],
  );
  const breezeState = useMemo(
    () => computeBreezeState(windStrength),
    [windStrength],
  );

  // Mount Three.js WebGL scene exactly once inside isolated ref container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    let instance: LakesideScene | null = null;
    try {
      instance = new LakesideScene({
        container: mountEl,
        initialElevation: DEFAULT_SUN_ELEVATION,
        initialAzimuth: DEFAULT_SUN_AZIMUTH,
        initialWindStrength: DEFAULT_WIND_STRENGTH,
        onReady: (stats) => {
          setSceneStats(stats);
        },
        onContextLost: () => {
          setContextError('Konteks WebGL terhenti sementara. Memulihkan tampilan 3D...');
        },
        onContextRestored: () => {
          setContextError(null);
        },
        onSunOrbitTick: (elev, az) => {
          setElevation(elev);
          setAzimuth(az);
          setActivePreset(null);
        },
        onWaterRipple: () => {
          setRippleCount((c) => c + 1);
        },
      });
      sceneRef.current = instance;
    } catch {
      setContextError(
        'Browser tidak mendukung WebGL2 untuk menampilkan lingkungan microvoxel 3D.',
      );
    }

    return () => {
      sceneRef.current = null;
      instance?.dispose();
    };
  }, []);

  const handleElevationChange = useCallback(
    (nextElev: number) => {
      setIsAutoOrbit(false);
      setActivePreset(null);
      setElevation(nextElev);
      sceneRef.current?.setAutoOrbit(false);
      sceneRef.current?.setSunPosition(nextElev, azimuth);
    },
    [azimuth],
  );

  const handleAzimuthChange = useCallback(
    (nextAz: number) => {
      setIsAutoOrbit(false);
      setActivePreset(null);
      setAzimuth(nextAz);
      sceneRef.current?.setAutoOrbit(false);
      sceneRef.current?.setSunPosition(elevation, nextAz);
    },
    [elevation],
  );

  const handleWindStrengthChange = useCallback((nextWind: number) => {
    setWindStrength(nextWind);
    sceneRef.current?.setWindStrength(nextWind);
  }, []);

  const handleSelectPreset = useCallback((presetId: SunPresetId) => {
    const preset = SUN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setIsAutoOrbit(false);
    setActivePreset(presetId);
    setElevation(preset.elevation);
    setAzimuth(preset.azimuth);
    sceneRef.current?.setAutoOrbit(false);
    sceneRef.current?.setSunPosition(preset.elevation, preset.azimuth);
  }, []);

  const handleSelectCamera = useCallback((cameraId: CameraPresetId) => {
    setActiveCamera(cameraId);
    sceneRef.current?.setCameraPreset(cameraId);
  }, []);

  const handleToggleAutoOrbit = useCallback(() => {
    setIsAutoOrbit((prev) => {
      const next = !prev;
      sceneRef.current?.setAutoOrbit(next);
      return next;
    });
  }, []);

  // Keyboard shortcuts: H hides/shows HUD, 1-4 switches camera presets
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setIsCollapsed((prev) => !prev);
      } else if (e.key === '1') {
        handleSelectCamera('panorama');
      } else if (e.key === '2') {
        handleSelectCamera('bangku');
      } else if (e.key === '3') {
        handleSelectCamera('tepi');
      } else if (e.key === '4') {
        handleSelectCamera('atas');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSelectCamera]);

  return (
    <main
      className="relative h-full w-full overflow-hidden bg-[#0c1118]"
      data-scene-ready={sceneStats ? 'true' : 'false'}
      data-sun-elevation={Math.round(elevation)}
      data-sun-azimuth={Math.round(azimuth)}
      data-ripple-count={rippleCount}
    >
      {/* Dedicated isolated WebGL canvas container */}
      <div
        ref={canvasMountRef}
        data-testid="microvoxel-canvas-container"
        className="absolute inset-0 h-full w-full"
      />

      {/* Minimal top-left editorial title overlay (zero pills, zero pulsing dots) */}
      <header className="pointer-events-none fixed top-4 left-4 sm:top-5 sm:left-6 z-10 max-w-[85vw]">
        <div className="inline-block rounded-xl bg-[#0e141d]/78 px-4 py-2.5 border border-white/12 shadow-lg">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white leading-tight">
            Danau Mikro
          </h1>
          <p className="mt-0.5 text-xs text-slate-300 leading-snug">
            Seret untuk memutar
            <span aria-hidden="true" className="mx-1.5 text-slate-500">
              ·
            </span>
            Klik air danau untuk riak
          </p>
        </div>
      </header>

      {/* Graceful WebGL error / fallback message */}
      {contextError && (
        <div
          role="alert"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#0c1118]/92 p-6"
        >
          <div className="max-w-md rounded-2xl bg-[#141c27] border border-white/14 p-6 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Tampilan 3D Terjeda</h2>
            <p className="mt-2 text-sm text-slate-300">{contextError}</p>
          </div>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock */}
      <ControlDock
        elevation={elevation}
        azimuth={azimuth}
        windStrength={windStrength}
        breezeLabel={breezeState.label}
        sunState={sunState}
        activePreset={activePreset}
        activeCamera={activeCamera}
        isAutoOrbit={isAutoOrbit}
        isCollapsed={isCollapsed}
        onElevationChange={handleElevationChange}
        onAzimuthChange={handleAzimuthChange}
        onWindStrengthChange={handleWindStrengthChange}
        onSelectPreset={handleSelectPreset}
        onSelectCamera={handleSelectCamera}
        onToggleAutoOrbit={handleToggleAutoOrbit}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
      />
    </main>
  );
}
