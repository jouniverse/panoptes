import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchJSON } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";

export interface FactbookProfile {
  naturalResources?: string;
  industries?: string;
  exportsCommodities?: string;
  importsCommodities?: string;
}

interface SlugFile {
  [iso3: string]: string;
}

interface ProfileFile {
  profiles: Record<string, FactbookProfile>;
}

let slugMap: Record<string, string> | null = null;
let profileFile: ProfileFile | null = null;

function loadSlugs(): Record<string, string> {
  if (slugMap) return slugMap;
  const p = join(process.cwd(), "public/data/worldfactbook-slugs.json");
  if (!existsSync(p)) return {};
  slugMap = JSON.parse(readFileSync(p, "utf8")) as SlugFile;
  return slugMap;
}

function loadProfiles(): ProfileFile | null {
  if (profileFile) return profileFile;
  const p = join(process.cwd(), "public/data/worldfactbook-profiles.json");
  if (!existsSync(p)) return null;
  profileFile = JSON.parse(readFileSync(p, "utf8")) as ProfileFile;
  return profileFile;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldText(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const t = (obj as { text?: string }).text;
  return t ? stripHtml(t) : undefined;
}

function extractFactbook(json: Record<string, unknown>): FactbookProfile {
  const geo = (json.geography ?? {}) as Record<string, unknown>;
  const econ = (json.economy ?? {}) as Record<string, unknown>;
  return {
    naturalResources: fieldText(geo["Natural resources"]),
    industries: fieldText(econ.Industries),
    exportsCommodities: fieldText(econ["Exports - commodities"]),
    importsCommodities: fieldText(econ["Imports - commodities"]),
  };
}

export async function factbookForIso(iso3: string): Promise<FactbookProfile | null> {
  const cached = cacheGet<FactbookProfile>(`factbook:${iso3}`);
  if (cached && cached.age < cacheTtl("worldfactbook:country")) return cached.data;

  const fromFile = loadProfiles()?.profiles[iso3];
  if (fromFile && Object.values(fromFile).some(Boolean)) {
    cacheSet(`factbook:${iso3}`, fromFile);
    return fromFile;
  }

  const slug = loadSlugs()[iso3];
  if (!slug) return null;

  try {
    const json = await fetchJSON<Record<string, unknown>>(
      `https://worldfactbook.io/api/v1/countries/${slug}/`,
      {},
      20_000,
    );
    const profile = extractFactbook(json);
    cacheSet(`factbook:${iso3}`, profile);
    return profile;
  } catch {
    return null;
  }
}
