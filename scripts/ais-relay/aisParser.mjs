/**
 * Normalize AIS Stream JSON messages into client-friendly updates.
 * Handles `Message` / `message`, `Metadata` / `MetaData`, string or numeric MessageType,
 * and numeric fields sent as strings.
 * @param {unknown} raw
 * @returns {import('./types.d.ts').NormalizedVesselUpdate | null}
 */
export function normalizeAisMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const data = /** @type {Record<string, unknown>} */ (raw);

  if (data.Error != null || data.error != null) return null;

  const metadata = readMetadata(data);
  const message = readMessage(data);
  if (!message || typeof message !== "object") return null;

  let messageType = normalizeMessageType(data.MessageType);
  if (!messageType) {
    messageType = inferMessageTypeFromPayload(message);
  }

  const metaLat = numOrUndef(metadata.Latitude);
  const metaLon = numOrUndef(metadata.Longitude);
  const metaMmsi = metadataMmsi(metadata);

  /** @type {import('./types.d.ts').NormalizedVesselUpdate} */
  const base = {
    type: "vessel",
    messageType: messageType || "Unknown",
    mmsi: "",
    lat: metaLat,
    lon: metaLon,
    sog: undefined,
    cog: undefined,
    trueHeading: undefined,
    navStatus: undefined,
    name: strOrUndef(
      metadata.ShipName ?? metadata.shipName ?? metadata.Name
    ),
    destination: undefined,
    shipType: undefined,
    callSign: undefined,
    updatedAt: Date.now(),
  };

  if (messageType) {
    base.messageType = messageType;
  }

  if (!messageType) {
    const fb = fallbackPositionPayload(message, base, metaMmsi);
    if (fb) {
      return rowFromPositionBody(fb.body, fb.base, fb.metaMmsi);
    }
    return null;
  }

  const dynamicBody =
    message[messageType] && typeof message[messageType] === "object"
      ? /** @type {Record<string, unknown>} */ (message[messageType])
      : null;

  const posReport =
    message.PositionReport ??
    (messageType === "PositionReport" ? dynamicBody : null);
  if (messageType === "PositionReport" && posReport) {
    return rowFromPositionBody(
      /** @type {Record<string, unknown>} */ (posReport),
      base,
      metaMmsi
    );
  }

  const stdB =
    message.StandardClassBPositionReport ??
    (messageType === "StandardClassBPositionReport" ? dynamicBody : null);
  if (messageType === "StandardClassBPositionReport" && stdB) {
    return rowFromPositionBody(
      /** @type {Record<string, unknown>} */ (stdB),
      base,
      metaMmsi
    );
  }

  const extB =
    message.ExtendedClassBPositionReport ??
    (messageType === "ExtendedClassBPositionReport" ? dynamicBody : null);
  if (messageType === "ExtendedClassBPositionReport" && extB) {
    const p = /** @type {Record<string, unknown>} */ (extB);
    const row = rowFromPositionBody(p, base, metaMmsi);
    if (!row) return null;
    return {
      ...row,
      name: strOrUndef(p.Name) ?? row.name,
      shipType: intOrUndef(p.Type) ?? row.shipType,
    };
  }

  const shipStatic =
    message.ShipStaticData ??
    (messageType === "ShipStaticData" ? dynamicBody : null);
  if (messageType === "ShipStaticData" && shipStatic) {
    return rowFromStaticBody(
      /** @type {Record<string, unknown>} */ (shipStatic),
      base,
      metaMmsi
    );
  }

  const staticRep =
    message.StaticDataReport ??
    (messageType === "StaticDataReport" ? dynamicBody : null);
  if (messageType === "StaticDataReport" && staticRep) {
    return rowFromStaticDataReport(
      /** @type {Record<string, unknown>} */ (staticRep),
      base,
      metaMmsi
    );
  }

  const tried = tryPositionLike(dynamicBody, base, metaMmsi);
  if (tried) return tried;

  const fb = fallbackPositionPayload(message, base, metaMmsi);
  if (fb) {
    return rowFromPositionBody(fb.body, fb.base, fb.metaMmsi);
  }
  return null;
}

/** @param {unknown} v */
function normalizeMessageType(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

/** @param {Record<string, unknown>} message */
function inferMessageTypeFromPayload(message) {
  const order = [
    "PositionReport",
    "StandardClassBPositionReport",
    "ExtendedClassBPositionReport",
    "ShipStaticData",
    "StaticDataReport",
  ];
  for (const k of order) {
    if (message[k] && typeof message[k] === "object") return k;
  }
  return "";
}

/** @param {Record<string, unknown>} data */
function readMetadata(data) {
  const m =
    data.Metadata ?? data.MetaData ?? data.metaData;
  if (m && typeof m === "object") {
    return /** @type {Record<string, unknown>} */ (m);
  }
  return {};
}

/** @param {Record<string, unknown>} data */
function readMessage(data) {
  const m = data.Message ?? data.message;
  if (m && typeof m === "object") {
    return /** @type {Record<string, unknown>} */ (m);
  }
  return {};
}

/**
 * @param {Record<string, unknown>} message
 * @param {import('./types.d.ts').NormalizedVesselUpdate} base
 * @param {string | undefined} metaMmsi
 */
function fallbackPositionPayload(message, base, metaMmsi) {
  for (const v of Object.values(message)) {
    if (!v || typeof v !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (v);
    const lat = numOrUndef(o.Latitude);
    const lon = numOrUndef(o.Longitude);
    if (lat == null || lon == null) continue;
    const hasUid = o.UserID != null || o.userId != null;
    if (!hasUid && !metaMmsi) continue;
    return { body: o, base, metaMmsi };
  }
  return null;
}

/** @param {Record<string, unknown>} metadata */
function metadataMmsi(metadata) {
  const v =
    metadata.MMSI ??
    metadata.mmsi ??
    metadata.ShipMmsi ??
    metadata.shipMmsi ??
    metadata.ShipMMSI;
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

/**
 * @param {Record<string, unknown> | null} inner
 * @param {import('./types.d.ts').NormalizedVesselUpdate} base
 * @param {string | undefined} metaMmsi
 */
function tryPositionLike(inner, base, metaMmsi) {
  if (!inner) return null;
  return rowFromPositionBody(inner, base, metaMmsi);
}

/**
 * @param {Record<string, unknown>} p
 * @param {import('./types.d.ts').NormalizedVesselUpdate} base
 * @param {string | undefined} metaMmsi
 */
function rowFromPositionBody(p, base, metaMmsi) {
  const uid = p.UserID ?? p.userId;
  const mmsi =
    (uid != null ? String(uid) : undefined) ?? metaMmsi ?? base.mmsi;
  if (!mmsi) return null;
  const lat = numOrUndef(p.Latitude) ?? base.lat;
  const lon = numOrUndef(p.Longitude) ?? base.lon;
  if (lat == null || lon == null) return null;
  return {
    ...base,
    mmsi,
    lat,
    lon,
    sog: numOrUndef(p.Sog),
    cog: numOrUndef(p.Cog),
    trueHeading: intOrUndef(p.TrueHeading),
    navStatus: intOrUndef(p.NavigationalStatus ?? p.NavigationStatus ?? p.NavStatus),
  };
}

/**
 * ShipStaticData (AIS Message Type 5, Class A).
 * All fields live at the top level of the body.
 * @param {Record<string, unknown>} s
 * @param {import('./types.d.ts').NormalizedVesselUpdate} base
 * @param {string | undefined} metaMmsi
 */
function rowFromStaticBody(s, base, metaMmsi) {
  const uid = s.UserID ?? s.userId;
  const mmsi =
    (uid != null ? String(uid) : undefined) ?? metaMmsi ?? base.mmsi;
  if (!mmsi) return null;
  const lat = numOrUndef(s.Latitude) ?? base.lat;
  const lon = numOrUndef(s.Longitude) ?? base.lon;
  return {
    ...base,
    mmsi,
    lat,
    lon,
    name: strOrUndef(s.Name) ?? base.name,
    destination: strOrUndef(s.Destination),
    shipType: intOrUndef(s.Type ?? s.ShipType ?? s.ShipAndCargoType),
    callSign: strOrUndef(s.CallSign),
    imoNumber: positiveIntOrUndef(s.ImoNumber ?? s.IMONumber ?? s.IMO),
    maxDraught: positiveNumOrUndef(s.MaximumStaticDraught ?? s.Draught),
  };
}

/**
 * StaticDataReport (AIS Message Type 24, Class B).
 * Fields are split across ReportA (name) and ReportB (type, callsign, etc.).
 * Class B does NOT carry ImoNumber or MaximumStaticDraught.
 * @param {Record<string, unknown>} s
 * @param {import('./types.d.ts').NormalizedVesselUpdate} base
 * @param {string | undefined} metaMmsi
 */
function rowFromStaticDataReport(s, base, metaMmsi) {
  const uid = s.UserID ?? s.userId;
  const mmsi =
    (uid != null ? String(uid) : undefined) ?? metaMmsi ?? base.mmsi;
  if (!mmsi) return null;
  const lat = numOrUndef(s.Latitude) ?? base.lat;
  const lon = numOrUndef(s.Longitude) ?? base.lon;

  const reportA =
    s.ReportA && typeof s.ReportA === "object"
      ? /** @type {Record<string, unknown>} */ (s.ReportA)
      : {};
  const reportB =
    s.ReportB && typeof s.ReportB === "object"
      ? /** @type {Record<string, unknown>} */ (s.ReportB)
      : {};

  return {
    ...base,
    mmsi,
    lat,
    lon,
    name: strOrUndef(reportA.Name ?? s.Name) ?? base.name,
    destination: strOrUndef(s.Destination),
    shipType: intOrUndef(reportB.ShipType ?? s.Type ?? s.ShipType),
    callSign: strOrUndef(reportB.CallSign ?? s.CallSign),
  };
}

function numOrUndef(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function intOrUndef(v) {
  const n = numOrUndef(v);
  if (n == null) return undefined;
  return Math.round(n);
}

/** Like intOrUndef but treats 0 as "not available" (AIS sentinel). */
function positiveIntOrUndef(v) {
  const n = intOrUndef(v);
  return n != null && n > 0 ? n : undefined;
}

/** Like numOrUndef but treats 0 as "not available" (AIS sentinel). */
function positiveNumOrUndef(v) {
  const n = numOrUndef(v);
  return n != null && n > 0 ? n : undefined;
}

function strOrUndef(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}
