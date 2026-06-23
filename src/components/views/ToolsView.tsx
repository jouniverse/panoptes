"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";
import type { LngLat, ToolMode } from "@/components/tools/ToolsMap";
import { effectRings, estimateSeverelyAffected } from "@/lib/nuclear";
import { haversineKm, bearingDeg, flightTimeMin } from "@/lib/ballistics";
import { WEAPON_PRESETS, MISSILE_PRESETS } from "@/config/presets";
import { representativePoint } from "@/lib/geo";
import { Stat, TacticalButton } from "@/components/ui/primitives";
import { fixed, downloadFile } from "@/lib/format";

const ToolsMap = dynamic(() => import("@/components/tools/ToolsMap"), {
  ssr: false,
  loading: () => (
    <div className="pan-grid flex h-full items-center justify-center">
      <span className="label-caps pan-pulse text-[var(--color-intel)]">LOADING MODEL SURFACE</span>
    </div>
  ),
});

interface Asset {
  label: string;
  layer: string;
  lon: number;
  lat: number;
  pop?: number;
}

const ASSET_LAYERS = [
  { id: "military-bases", file: "military-bases.geojson", label: ["name"] },
  { id: "major-ports", file: "major-ports.geojson", label: ["PORT_NAME"] },
  { id: "data-centers", file: "data-centers.geojson", label: ["name"] },
  { id: "populated-places", file: "populated-places.geojson", label: ["NAME", "name"] },
];

function useAssets() {
  return useQuery<Asset[]>({
    queryKey: ["tools-assets"],
    staleTime: Infinity,
    queryFn: async () => {
      const all: Asset[] = [];
      await Promise.all(
        ASSET_LAYERS.map(async (l) => {
          const fc = (await (await fetch(`/geo/${l.file}`)).json()) as FeatureCollection;
          for (const f of fc.features) {
            if (!f.geometry) continue;
            const pt = representativePoint(f.geometry);
            if (!pt) continue;
            const props = (f.properties ?? {}) as Record<string, unknown>;
            const label = l.label.map((k) => props[k]).find(Boolean);
            all.push({
              label: String(label ?? l.id),
              layer: l.id,
              lon: pt[0],
              lat: pt[1],
              pop: Number(props.POP_MAX ?? props.pop_max) || undefined,
            });
          }
        }),
      );
      return all;
    },
  });
}

export function ToolsView() {
  const [mode, setMode] = useState<ToolMode>("detonation");
  const [yieldKt, setYieldKt] = useState(300);
  const [burst, setBurst] = useState<"air" | "ground">("air");
  const [wind, setWind] = useState({ dirDeg: 90, speedKph: 25 });
  const [epicenter, setEpicenter] = useState<LngLat | null>([37.6, 55.75]);
  const [launch, setLaunch] = useState<LngLat | null>(null);
  const [target, setTarget] = useState<LngLat | null>(null);
  const [missileRangeKm, setMissileRangeKm] = useState(13000);

  const { data: assets } = useAssets();
  const rings = useMemo(() => effectRings(yieldKt), [yieldKt]);

  const affected = useMemo(() => {
    if (mode !== "detonation" || !epicenter || !assets) return null;
    const maxR = rings[0].radiusKm;
    const p5R = rings.find((r) => r.id === "p5")?.radiusKm ?? maxR;
    const within = assets
      .map((a) => ({ a, d: haversineKm(epicenter, [a.lon, a.lat]) }))
      .filter((x) => x.d <= maxR)
      .sort((x, y) => x.d - y.d);
    const popInP5 = within
      .filter((x) => x.d <= p5R && x.a.pop)
      .reduce((s, x) => s + (x.a.pop ?? 0), 0);
    return { within, p5R, popInP5 };
  }, [mode, epicenter, assets, rings]);

  const missile = useMemo(() => {
    if (mode !== "missile" || !launch || !target) return null;
    const dist = haversineKm(launch, target);
    return {
      dist,
      bearing: bearingDeg(launch, target),
      flight: flightTimeMin(dist),
      inRange: dist <= missileRangeKm,
    };
  }, [mode, launch, target, missileRangeKm]);

  const onMapClick = (ll: LngLat) => {
    if (mode === "detonation") setEpicenter(ll);
    else {
      if (!launch || (launch && target)) {
        setLaunch(ll);
        setTarget(null);
      } else setTarget(ll);
    }
  };

  const exportSitrep = () => {
    const now = new Date().toISOString();
    let md = `# PANOPTES SITREP\nGenerated: ${now}\nClassification: OSINT // ANALYTIC MODEL\n\n`;
    if (mode === "detonation" && epicenter) {
      md += `## Detonation Model\n`;
      md += `- Ground zero: ${epicenter[1].toFixed(4)}, ${epicenter[0].toFixed(4)}\n`;
      md += `- Yield: ${yieldKt} kt (${burst} burst)\n\n### Effect radii\n`;
      rings.forEach((r) => (md += `- ${r.label}: ${r.radiusKm.toFixed(2)} km — ${r.description}\n`));
      if (affected) {
        md += `\n### Estimated impact\n`;
        md += `- Population within 5 psi (named places): ~${affected.popInP5.toLocaleString()}\n`;
        md += `- Notable assets within outer radius: ${affected.within.length}\n\n`;
        affected.within.slice(0, 40).forEach(
          (x) => (md += `  - [${x.a.layer}] ${x.a.label} — ${x.d.toFixed(1)} km\n`),
        );
      }
    } else if (mode === "missile" && launch && target && missile) {
      md += `## Missile Trajectory Model\n`;
      md += `- Launch: ${launch[1].toFixed(4)}, ${launch[0].toFixed(4)}\n`;
      md += `- Target: ${target[1].toFixed(4)}, ${target[0].toFixed(4)}\n`;
      md += `- Range: ${missile.dist.toFixed(0)} km (platform max ${missileRangeKm} km — ${missile.inRange ? "IN RANGE" : "OUT OF RANGE"})\n`;
      md += `- Bearing: ${missile.bearing.toFixed(1)}°\n- Est. flight time: ${missile.flight} min\n`;
    }
    md += `\n---\nModels are approximations (Glasstone & Dolan scaling; great-circle ballistics). For analysis only.\n`;
    downloadFile(`panoptes-sitrep-${Date.now()}.md`, md, "text/markdown");
  };

  return (
    <div className="flex min-w-0 flex-1">
      {/* controls */}
      <aside className="pan-glass flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-outline-variant)]">
        <div className="border-b border-[var(--color-outline-variant)] p-3">
          <div className="headline-sm text-[var(--color-on-surface)]">ANALYTIC MODELS</div>
          <div className="mt-2 flex gap-1">
            {(["detonation", "missile"] as ToolMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${
                  mode === m
                    ? "border-[var(--color-intel)] text-[var(--color-intel)]"
                    : "border-[var(--color-outline-variant)] text-[var(--color-outline)]"
                }`}
              >
                {m === "detonation" ? "Detonation" : "Missile"}
              </button>
            ))}
          </div>
        </div>

        {mode === "detonation" ? (
          <div className="space-y-3 p-3">
            <div>
              <label className="label-caps">YIELD: {yieldKt.toLocaleString()} kt</label>
              <input
                type="range"
                min={1}
                max={50000}
                value={yieldKt}
                step={1}
                onChange={(e) => setYieldKt(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--color-alert)]"
              />
            </div>
            <select
              onChange={(e) => {
                const p = WEAPON_PRESETS.find((w) => w.id === e.target.value);
                if (p) setYieldKt(p.yieldKt);
              }}
              className="w-full border border-[var(--color-outline-variant)] bg-[var(--color-surface)] px-2 py-1 font-mono text-[11px] text-[var(--color-on-surface)]"
              defaultValue=""
            >
              <option value="" disabled>
                — weapon preset —
              </option>
              {WEAPON_PRESETS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.yieldKt}kt
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              {(["air", "ground"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBurst(b)}
                  className={`flex-1 border px-2 py-1 font-mono text-[10px] font-bold uppercase ${
                    burst === b
                      ? "border-[var(--color-gold)] text-[var(--color-gold)]"
                      : "border-[var(--color-outline-variant)] text-[var(--color-outline)]"
                  }`}
                >
                  {b} burst
                </button>
              ))}
            </div>
            {burst === "ground" && (
              <div className="space-y-2 border border-[var(--color-outline-variant)] p-2">
                <div className="label-caps text-[var(--color-friendly)]">FALLOUT WIND</div>
                <label className="label-caps">DIR: {wind.dirDeg}°</label>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={wind.dirDeg}
                  onChange={(e) => setWind({ ...wind, dirDeg: Number(e.target.value) })}
                  className="w-full accent-[var(--color-friendly)]"
                />
                <label className="label-caps">SPEED: {wind.speedKph} kph</label>
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={wind.speedKph}
                  onChange={(e) => setWind({ ...wind, speedKph: Number(e.target.value) })}
                  className="w-full accent-[var(--color-friendly)]"
                />
              </div>
            )}
            <p className="label-caps text-[var(--color-outline)]">CLICK MAP TO SET GROUND ZERO</p>
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <select
              onChange={(e) => {
                const p = MISSILE_PRESETS.find((m) => m.id === e.target.value);
                if (p) setMissileRangeKm(p.rangeKm);
              }}
              className="w-full border border-[var(--color-outline-variant)] bg-[var(--color-surface)] px-2 py-1 font-mono text-[11px] text-[var(--color-on-surface)]"
              defaultValue=""
            >
              <option value="" disabled>
                — missile preset —
              </option>
              {MISSILE_PRESETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.rangeKm}km
                </option>
              ))}
            </select>
            <div>
              <label className="label-caps">MAX RANGE: {missileRangeKm.toLocaleString()} km</label>
              <input
                type="range"
                min={100}
                max={20000}
                value={missileRangeKm}
                step={100}
                onChange={(e) => setMissileRangeKm(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--color-intel)]"
              />
            </div>
            <p className="label-caps text-[var(--color-outline)]">
              CLICK MAP: 1ST = LAUNCH, 2ND = TARGET
            </p>
            <TacticalButton onClick={() => { setLaunch(null); setTarget(null); }}>
              RESET POINTS
            </TacticalButton>
          </div>
        )}
      </aside>

      {/* map */}
      <div className="relative min-w-0 flex-1">
        <ToolsMap
          mode={mode}
          yieldKt={yieldKt}
          burst={burst}
          wind={wind}
          epicenter={epicenter}
          launch={launch}
          target={target}
          missileRangeKm={missileRangeKm}
          onMapClick={onMapClick}
        />
      </div>

      {/* readout */}
      <aside className="pan-glass flex w-[330px] shrink-0 flex-col border-l border-[var(--color-outline-variant)]">
        <header className="flex items-center justify-between border-b border-[var(--color-outline-variant)] px-3 py-2">
          <span className="label-caps text-[var(--color-outline)]">MODEL READOUT</span>
          <TacticalButton onClick={exportSitrep}>EXPORT SITREP</TacticalButton>
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {mode === "detonation" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Yield" value={`${yieldKt.toLocaleString()} kt`} accent="var(--color-alert)" />
                <Stat
                  label="Severe zone pop."
                  value={
                    affected
                      ? affected.popInP5.toLocaleString()
                      : estimateSeverelyAffected(yieldKt, 3000).toLocaleString()
                  }
                  accent="var(--color-gold)"
                  sub={affected ? "named places in 5 psi" : "@3k/km² proxy"}
                />
              </div>
              <div className="mt-3 border border-[var(--color-outline-variant)]">
                <div className="label-caps border-b border-[var(--color-outline-variant)] px-2 py-1">
                  EFFECT RADII
                </div>
                <ul className="divide-y divide-[var(--color-grid)]">
                  {rings.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5" style={{ background: r.color }} />
                        <span className="font-mono text-[11px] text-[var(--color-on-surface)]">{r.label}</span>
                      </div>
                      <span className="code-data text-[var(--color-intel)]">{fixed(r.radiusKm, 2)} km</span>
                    </li>
                  ))}
                </ul>
              </div>
              {affected && (
                <div className="mt-3 border border-[var(--color-outline-variant)]">
                  <div className="label-caps border-b border-[var(--color-outline-variant)] px-2 py-1">
                    ASSETS IN BLAST FOOTPRINT ({affected.within.length})
                  </div>
                  <ul className="max-h-64 divide-y divide-[var(--color-grid)] overflow-y-auto">
                    {affected.within.slice(0, 60).map((x, i) => (
                      <li key={i} className="flex items-center justify-between px-2 py-1">
                        <span className="truncate font-mono text-[11px] text-[var(--color-on-surface)]">
                          {x.a.label}
                        </span>
                        <span className="code-data text-[var(--color-outline)]">{x.d.toFixed(1)}km</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {mode === "missile" && (
            <>
              {!missile && (
                <p className="label-caps text-[var(--color-outline)]">
                  Set launch and target points on the map.
                </p>
              )}
              {missile && (
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Range" value={`${missile.dist.toFixed(0)} km`} accent="var(--color-intel)" />
                  <Stat
                    label="In range?"
                    value={missile.inRange ? "YES" : "NO"}
                    accent={missile.inRange ? "var(--color-friendly)" : "var(--color-alert)"}
                  />
                  <Stat label="Bearing" value={`${missile.bearing.toFixed(0)}°`} />
                  <Stat label="Flight time" value={`~${missile.flight} min`} accent="var(--color-gold)" />
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
