"use client";

import { useStore, DEFAULT_VIEW } from "@/core/state/store";
import { useIsNarrow } from "@/hooks/useMobileLayout";

function Btn({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const narrow = useIsNarrow();
  const size = narrow ? "h-10 w-10 text-base" : "h-8 w-8 text-sm";
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex ${size} items-center justify-center border font-mono transition-colors ${
        disabled
          ? "cursor-not-allowed border-[var(--color-outline-variant)] bg-[rgba(12,14,18,0.5)] text-[var(--color-outline)] opacity-40"
          : active
            ? "border-[var(--color-intel)] bg-[rgba(0,209,255,0.15)] text-[var(--color-intel)]"
            : "border-[var(--color-outline-variant)] bg-[rgba(12,14,18,0.8)] text-[var(--color-on-surface-variant)] hover:text-[var(--color-intel)]"
      }`}
    >
      {children}
    </button>
  );
}

export function MapControls({ showLayerToggle = true }: { showLayerToggle?: boolean }) {
  const narrow = useIsNarrow();
  const projection = useStore((s) => s.projection);
  const setProjection = useStore((s) => s.setProjection);
  const basemapStyle = useStore((s) => s.basemapStyle);
  const setBasemapStyle = useStore((s) => s.setBasemapStyle);
  const view = useStore((s) => s.viewState);
  const setView = useStore((s) => s.setViewState);
  const toggleLeft = useStore((s) => s.toggleLeft);
  const toggleRight = useStore((s) => s.toggleRight);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const selected = useStore((s) => s.selected);

  const zoomBy = (d: number) =>
    setView({ ...view, zoom: Math.max(0, Math.min(20, view.zoom + d)) });

  const panelOpen = leftOpen || (rightOpen && !!selected);
  if (narrow && panelOpen) return null;

  return (
    <div
      className={`absolute right-3 top-3 flex flex-col gap-1.5 ${narrow ? "z-30" : "z-40"}`}
    >
      {showLayerToggle && (
        <>
          <Btn onClick={toggleLeft} active={leftOpen} title="Toggle layers panel">
            ☰
          </Btn>
          <Btn
            onClick={toggleRight}
            active={rightOpen && !!selected}
            disabled={!selected}
            title={selected ? "Toggle details panel" : "Select a map item for details"}
          >
            ◧
          </Btn>
          <div className="h-px w-8 bg-[var(--color-outline-variant)]" />
        </>
      )}
      <Btn
        onClick={() => setProjection("flat")}
        active={projection === "flat"}
        title="2D map"
      >
        ▭
      </Btn>
      <Btn
        onClick={() => !narrow && setProjection("globe")}
        active={projection === "globe"}
        disabled={narrow}
        title={narrow ? "3D globe unavailable on mobile" : "3D globe"}
      >
        ◍
      </Btn>
      <div className="h-px w-8 bg-[var(--color-outline-variant)]" />
      <Btn
        onClick={() => setBasemapStyle("strategic")}
        active={basemapStyle === "strategic"}
        title="Strategic basemap (dark)"
      >
        ▓
      </Btn>
      <Btn
        onClick={() => setBasemapStyle("satellite")}
        active={basemapStyle === "satellite"}
        title="Satellite imagery (Esri)"
      >
        ◉
      </Btn>
      <div className="h-px w-8 bg-[var(--color-outline-variant)]" />
      <Btn onClick={() => zoomBy(1)} title="Zoom in">
        +
      </Btn>
      <Btn onClick={() => zoomBy(-1)} title="Zoom out">
        −
      </Btn>
      <Btn onClick={() => setView({ ...DEFAULT_VIEW })} title="Reset view">
        ⌖
      </Btn>
    </div>
  );
}
