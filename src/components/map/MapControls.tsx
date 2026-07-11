"use client";

import { useStore, DEFAULT_VIEW } from "@/core/state/store";

function Btn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-8 w-8 items-center justify-center border font-mono text-sm transition-colors ${
        active
          ? "border-[var(--color-intel)] bg-[rgba(0,209,255,0.15)] text-[var(--color-intel)]"
          : "border-[var(--color-outline-variant)] bg-[rgba(12,14,18,0.8)] text-[var(--color-on-surface-variant)] hover:text-[var(--color-intel)]"
      }`}
    >
      {children}
    </button>
  );
}

export function MapControls({ showLayerToggle = true }: { showLayerToggle?: boolean }) {
  const projection = useStore((s) => s.projection);
  const setProjection = useStore((s) => s.setProjection);
  const basemapStyle = useStore((s) => s.basemapStyle);
  const setBasemapStyle = useStore((s) => s.setBasemapStyle);
  const view = useStore((s) => s.viewState);
  const setView = useStore((s) => s.setViewState);
  const toggleLeft = useStore((s) => s.toggleLeft);
  const leftOpen = useStore((s) => s.leftOpen);

  const zoomBy = (d: number) =>
    setView({ ...view, zoom: Math.max(0, Math.min(20, view.zoom + d)) });

  return (
    <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
      {showLayerToggle && (
        <>
          <Btn onClick={toggleLeft} active={leftOpen} title="Toggle layers">
            ☰
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
        onClick={() => setProjection("globe")}
        active={projection === "globe"}
        title="3D globe"
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
