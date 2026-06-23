export interface WeaponPreset {
  id: string;
  name: string;
  yieldKt: number;
  note: string;
}

export const WEAPON_PRESETS: WeaponPreset[] = [
  { id: "hiroshima", name: "Little Boy (Hiroshima)", yieldKt: 15, note: "1945, US" },
  { id: "fatman", name: "Fat Man (Nagasaki)", yieldKt: 21, note: "1945, US" },
  { id: "w76", name: "W76 (Trident SLBM)", yieldKt: 100, note: "US, common SLBM" },
  { id: "w87", name: "W87 (Minuteman III)", yieldKt: 300, note: "US ICBM" },
  { id: "topol", name: "RS-24 Yars (per warhead)", yieldKt: 300, note: "Russia ICBM MIRV" },
  { id: "b83", name: "B83 (US gravity bomb)", yieldKt: 1200, note: "Largest US in service" },
  { id: "df5", name: "DF-5B (per warhead)", yieldKt: 3000, note: "China ICBM" },
  { id: "tsar", name: "Tsar Bomba (tested)", yieldKt: 50000, note: "1961, USSR — largest ever" },
];

export interface MissilePreset {
  id: string;
  name: string;
  rangeKm: number;
  note: string;
}

export const MISSILE_PRESETS: MissilePreset[] = [
  { id: "scud", name: "Scud-B (SRBM)", rangeKm: 300, note: "tactical" },
  { id: "iskander", name: "9K720 Iskander", rangeKm: 500, note: "Russia SRBM" },
  { id: "df21", name: "DF-21 (MRBM)", rangeKm: 1500, note: "China 'carrier killer'" },
  { id: "no_dong", name: "Nodong (MRBM)", rangeKm: 1300, note: "DPRK" },
  { id: "hwasong12", name: "Hwasong-12 (IRBM)", rangeKm: 4500, note: "DPRK" },
  { id: "minuteman", name: "Minuteman III (ICBM)", rangeKm: 13000, note: "US" },
  { id: "sarmat", name: "RS-28 Sarmat (ICBM)", rangeKm: 18000, note: "Russia heavy ICBM" },
  { id: "hwasong17", name: "Hwasong-17 (ICBM)", rangeKm: 15000, note: "DPRK" },
];
