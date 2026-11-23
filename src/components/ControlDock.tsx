import React, { useRef } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Sun } from 'lucide-react';
import {
  SUN_PRESETS,
  SunEnvironmentState,
  SunPresetId,
  normalizeAzimuth,
} from '../utils/sunMath';
import { CameraPresetId, getCameraPresets } from '../scene/cameraPresets';

interface ControlDockProps {
  elevation: number;
  azimuth: number;
  windStrength: number;
  breezeLabel: string;
  sunState: SunEnvironmentState;
  activePreset: SunPresetId | null;
  activeCamera: CameraPresetId;
  isAutoOrbit: boolean;
  isCollapsed: boolean;
  onElevationChange: (value: number) => void;
  onAzimuthChange: (value: number) => void;
  onWindStrengthChange: (value: number) => void;
  onSelectPreset: (presetId: SunPresetId) => void;
  onSelectCamera: (cameraId: CameraPresetId) => void;
  onToggleAutoOrbit: () => void;
  onToggleCollapse: () => void;
}

const CAMERA_PRESETS = getCameraPresets();

export const ControlDock: React.FC<ControlDockProps> = ({
  elevation,
  azimuth,
  windStrength,
  breezeLabel,
  sunState,
  activePreset,
  activeCamera,
  isAutoOrbit,
  isCollapsed,
  onElevationChange,
  onAzimuthChange,
  onWindStrengthChange,
  onSelectPreset,
  onSelectCamera,
  onToggleAutoOrbit,
  onToggleCollapse,
}) => {
  const skyPadRef = useRef<HTMLDivElement | null>(null);

  // Interactive 2D sky hemisphere pad: drag directly to aim sun azimuth & elevation
  const updateSunFromPointer = (clientX: number, clientY: number) => {
    const rect = skyPadRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2 - 6;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.min(radius, Math.hypot(dx, dy));

    // North is up (-dy), East is right (+dx)
    const angleRad = Math.atan2(dx, -dy);
    const newAz = Math.round(normalizeAzimuth((angleRad * 180) / Math.PI));
    const normDist = dist / Math.max(1, radius);
    const newEl = Math.round((1 - normDist) * 84 * 2) / 2;

    onAzimuthChange(newAz);
    onElevationChange(Math.max(0, Math.min(85, newEl)));
  };

  const handlePadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSunFromPointer(e.clientX, e.clientY);
  };

  const handlePadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    updateSunFromPointer(e.clientX, e.clientY);
  };

  // Compute sun dot position inside the 2D compass pad (radius 30px in a 72px circle)
  const padRadius = 27;
  const clampedElev = Math.max(0, Math.min(85, elevation));
  const radialFrac = 1 - clampedElev / 85;
  const azRad = (azimuth * Math.PI) / 180;
  const sunDotX = 36 + Math.sin(azRad) * radialFrac * padRadius;
  const sunDotY = 36 - Math.cos(azRad) * radialFrac * padRadius;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-20 w-[min(920px,94vw)] -translate-x-1/2 pointer-events-none"
      data-testid="control-dock-wrapper"
    >
      <div className="flex flex-col items-center">
        {/* Collapse / Expand toggle tab attached neatly to the top edge of the dock */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Tampilkan kontrol pencahayaan' : 'Sembunyikan kontrol pencahayaan'}
          className="pointer-events-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#10161f]/92 px-3.5 py-1.5 text-xs font-medium text-slate-200 border border-white/15 shadow-lg hover:bg-[#192230] hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>Tampilkan Kontrol</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>Sembunyikan Kontrol</span>
            </>
          )}
        </button>

        {/* Main unified control panel (zero backdrop-filter for crisp software-WebGL FPS) */}
        <section
          aria-label="Kontrol Matahari, Angin, dan Kamera"
          aria-hidden={isCollapsed}
          className={`w-full rounded-2xl bg-[#0e141d]/92 border border-white/14 shadow-2xl transition-all duration-200 ease-out overflow-hidden ${
            isCollapsed
              ? 'max-h-0 opacity-0 translate-y-4 border-transparent pointer-events-none'
              : 'max-h-[420px] opacity-100 translate-y-0 pointer-events-auto'
          }`}
        >
          <div className="p-3 sm:px-5 sm:py-4 flex flex-col gap-2.5 sm:gap-3.5">
            {/* Row 1: Interactive Sun Compass + Elevation/Azimuth/Breeze Sliders + Auto Orbit */}
            <div className="flex flex-col md:flex-row md:items-center gap-2.5 sm:gap-4">
              {/* Interactive 2D Sky Hemisphere Sun Pad (shown on sm+) + Live Sun Phase & Auto Orbit */}
              <div className="flex items-center justify-between sm:justify-start gap-3.5 shrink-0">
                <div
                  ref={skyPadRef}
                  onPointerDown={handlePadPointerDown}
                  onPointerMove={handlePadPointerMove}
                  role="application"
                  aria-label="Kompas posisi matahari interaktif, seret untuk memindahkan matahari"
                  className="hidden sm:block relative h-[72px] w-[72px] rounded-full bg-[#151e2b] border border-white/15 cursor-crosshair select-none shrink-0 touch-none"
                >
                  <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
                  <div className="pointer-events-none absolute inset-[26px] rounded-full border border-white/10" />
                  <span className="pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-slate-400">
                    U
                  </span>
                  <span className="pointer-events-none absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-slate-400">
                    S
                  </span>
                  <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-medium text-slate-400">
                    T
                  </span>
                  <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-medium text-slate-400">
                    B
                  </span>
                  <div
                    className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 border-2 border-amber-50 shadow-[0_0_8px_rgba(251,191,36,0.85)]"
                    style={{ left: `${sunDotX}px`, top: `${sunDotY}px` }}
                  />
                </div>

                {/* Quiet unboxed live sun metrics */}
                <div className="flex sm:flex-col items-center sm:items-start justify-between w-full sm:w-auto sm:min-w-[116px] gap-2 sm:gap-0">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                      <Sun className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                      <span data-testid="sun-phase-label">{sunState.phaseLabel}</span>
                    </div>
                    <div
                      className="mt-0.5 sm:mt-1 font-mono-tabular text-xs text-slate-300"
                      data-testid="sun-readout"
                    >
                      {Math.round(elevation)}° elev · {Math.round(azimuth)}° {sunState.compassLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleAutoOrbit}
                    className={`sm:mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 sm:py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400 ${
                      isAutoOrbit
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        : 'bg-white/10 text-slate-200 hover:bg-white/16'
                    }`}
                  >
                    {isAutoOrbit ? (
                      <>
                        <Pause className="h-3 w-3" aria-hidden="true" />
                        <span>Jeda Matahari</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" aria-hidden="true" />
                        <span>Putar Matahari</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Precision Sliders for Real-Time Elevation, Azimuth & Environmental Breeze */}
              <div className="flex-1 grid grid-cols-3 gap-2.5 sm:gap-3.5">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="sun-elevation-slider" className="font-medium text-slate-200 truncate">
                      Elevasi
                    </label>
                    <span className="font-mono-tabular text-amber-300">
                      {Math.round(elevation)}°
                    </span>
                  </div>
                  <input
                    id="sun-elevation-slider"
                    type="range"
                    min={-1}
                    max={85}
                    step={0.5}
                    value={elevation}
                    onChange={(e) => onElevationChange(parseFloat(e.target.value))}
                    className="sun-slider w-full h-5"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="sun-azimuth-slider" className="font-medium text-slate-200 truncate">
                      Azimut
                    </label>
                    <span className="font-mono-tabular text-amber-300">
                      {Math.round(azimuth)}° {sunState.compassLabel}
                    </span>
                  </div>
                  <input
                    id="sun-azimuth-slider"
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={azimuth}
                    onChange={(e) => onAzimuthChange(parseFloat(e.target.value))}
                    className="sun-slider w-full h-5"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="wind-breeze-slider" className="font-medium text-slate-200 truncate">
                      Angin
                    </label>
                    <span className="font-mono-tabular text-sky-300 truncate" data-testid="breeze-label">
                      {breezeLabel}
                    </span>
                  </div>
                  <input
                    id="wind-breeze-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={windStrength}
                    onChange={(e) => onWindStrengthChange(parseFloat(e.target.value))}
                    className="sun-slider w-full h-5"
                  />
                </div>
              </div>
            </div>

            {/* Hairline divider */}
            <div className="h-px w-full bg-white/10" />

            {/* Row 2: Time-of-Day Presets & Camera Views */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {/* Time-of-day quick lighting presets */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden sm:inline text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
                  Waktu
                </span>
                <div
                  className="grid grid-cols-5 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-lg bg-[#161f2c] p-1 border border-white/8"
                  role="group"
                  aria-label="Preset waktu matahari"
                >
                  {SUN_PRESETS.map((preset) => {
                    const isActive = activePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSelectPreset(preset.id)}
                        aria-pressed={isActive}
                        className={`rounded-md px-1.5 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer text-center focus-visible:outline-2 focus-visible:outline-amber-400 ${
                          isActive
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white hover:bg-white/8'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Smoothly damped camera preset controls */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden sm:inline text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
                  Kamera
                </span>
                <div
                  className="grid grid-cols-4 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-lg bg-[#161f2c] p-1 border border-white/8"
                  role="group"
                  aria-label="Sudut pandang kamera"
                >
                  {CAMERA_PRESETS.map((cam) => {
                    const isActive = activeCamera === cam.id;
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => onSelectCamera(cam.id)}
                        aria-pressed={isActive}
                        className={`rounded-md px-1.5 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer text-center focus-visible:outline-2 focus-visible:outline-amber-400 ${
                          isActive
                            ? 'bg-slate-100 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white hover:bg-white/8'
                        }`}
                      >
                        {cam.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
