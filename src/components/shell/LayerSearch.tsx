"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAYERS_BY_ID } from "@/config/layer-registry";
import { useLayerSearch } from "@/hooks/useLayerSearch";
import { flyZoomForEntity, SEARCH_MIN_CHARS, type LayerSearchHit } from "@/lib/layer-search";
import { useStore } from "@/core/state/store";

function formatSubtitle(hit: LayerSearchHit): string {
  if (hit.matchField === "label") return hit.layerName;
  return `${hit.layerName} · ${hit.matchField}`;
}

export function LayerSearch() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const select = useStore((s) => s.select);
  const setViewState = useStore((s) => s.setViewState);
  const viewState = useStore((s) => s.viewState);

  const results = useLayerSearch(debounced);
  const hasQuery = debounced.trim().length >= SEARCH_MIN_CHARS;

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [debounced, results.length]);

  const pick = useCallback(
    (hit: LayerSearchHit) => {
      const zoom = flyZoomForEntity(hit.entity, viewState.zoom);
      setViewState({
        ...viewState,
        longitude: hit.entity.lon,
        latitude: hit.entity.lat,
        zoom,
      });
      select(hit.entity);
      setQuery("");
      setDebounced("");
      setOpen(false);
      inputRef.current?.blur();
    },
    [select, setViewState, viewState],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!hasQuery || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[activeIdx];
      if (hit) pick(hit);
    }
  };

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <div className="flex items-center gap-2 border-b-2 border-[var(--color-outline-variant)] px-2 py-1">
        <span className="text-[var(--color-outline)]">[</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="SEARCH LAYERS..."
          aria-label="Search enabled map layers"
          aria-expanded={open && hasQuery}
          aria-controls="layer-search-results"
          role="combobox"
          autoComplete="off"
          className="w-44 bg-transparent font-mono text-[11px] tracking-[0.1em] text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none"
        />
        <span className="text-[var(--color-outline)]">]</span>
      </div>

      {open && hasQuery && (
        <div
          id="layer-search-results"
          role="listbox"
          className="pan-glass absolute right-0 top-full z-50 mt-1 w-[min(360px,calc(100vw-2rem))] border border-[var(--color-outline-variant)] py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[10px] text-[var(--color-outline)]">
              No matches in enabled layers
            </div>
          ) : (
            results.map((hit, i) => {
              const layer = LAYERS_BY_ID[hit.layerId];
              const active = i === activeIdx;
              return (
                <button
                  key={`${hit.entity.layerId}-${hit.entity.id}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => pick(hit)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-[var(--color-surface-container-high)]"
                      : "hover:bg-[var(--color-surface-container)]"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0"
                      style={{ background: layer?.color ?? "var(--color-intel)" }}
                    />
                    <span className="truncate font-mono text-xs font-bold text-[var(--color-on-surface)]">
                      {hit.matchValue}
                    </span>
                  </span>
                  <span className="label-caps pl-3 text-[9px] text-[var(--color-outline)]">
                    {formatSubtitle(hit)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
