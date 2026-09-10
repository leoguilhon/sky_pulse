import { gunzipSync } from "node:zlib";
import type pg from "pg";
import type { AircraftPosition } from "./types.js";

export const CATALOG_SOURCE = "tar1090-db / Mictronics";
const AIRCRAFT_URL =
  "https://raw.githubusercontent.com/wiedehopf/tar1090-db/csv/aircraft.csv.gz";
const TYPES_URL =
  "https://raw.githubusercontent.com/Mictronics/readsb-protobuf/dev/webapp/src/db/types.json";
const MAX_AGE_MS = 7 * 86400000;

interface CatalogAircraft {
  icao24: string;
  registration: string | null;
  type_code: string | null;
  model: string | null;
  operator: string | null;
}
interface CatalogType {
  type_code: string;
  model: string;
  description: string | null;
  wake_category: string | null;
}

const clean = (value: string | undefined) =>
  value?.trim().slice(0, 200) || null;

export function parseAircraftCatalog(csv: string): CatalogAircraft[] {
  const aircraft = new Map<string, CatalogAircraft>();
  for (const line of csv.split(/\r?\n/)) {
    // Upstream uses semicolon CSV with backslash escaping and no quoted fields.
    const fields: string[] = [];
    let field = "";
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "\\" && i + 1 < line.length) field += line[++i];
      else if (line[i] === ";") {
        fields.push(field);
        field = "";
      } else field += line[i];
    }
    fields.push(field);
    const icao24 = fields[0]?.toLowerCase() ?? "";
    if (!/^[a-f0-9]{6}$/.test(icao24) || fields.length < 7) continue;
    const typeCode = clean(fields[2]);
    aircraft.set(icao24, {
      icao24,
      registration: clean(fields[1]),
      type_code: typeCode && /^[A-Z0-9]{2,4}$/.test(typeCode) ? typeCode : null,
      model: clean(fields[4]),
      operator: clean(fields[6]),
    });
  }
  return [...aircraft.values()];
}

export function parseAircraftTypes(value: unknown): CatalogType[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([type_code, row]) => {
    if (
      !/^[A-Z0-9]{2,4}$/.test(type_code) ||
      !Array.isArray(row) ||
      typeof row[0] !== "string" ||
      !row[0].trim()
    )
      return [];
    return [
      {
        type_code,
        model: row[0].trim().slice(0, 200),
        description:
          typeof row[1] === "string" && /^[A-Z][0-9C][A-Z-]$/.test(row[1])
            ? row[1]
            : null,
        wake_category:
          typeof row[2] === "string" && /^[LMHJ]$/.test(row[2]) ? row[2] : null,
      },
    ];
  });
}

async function download(url: string, maximumBytes: number): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok || !response.body)
    throw new Error(`Catalog download failed: HTTP ${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maximumBytes)
      throw new Error("Catalog download exceeds size limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function syncAircraftCatalog(pool: pg.Pool, force = false) {
  const current = await pool.query<{ fetched_at: Date }>(
    "SELECT fetched_at FROM aircraft_catalog_sync WHERE id = 1",
  );
  if (
    !force &&
    current.rows[0] &&
    Date.now() - current.rows[0].fetched_at.getTime() < MAX_AGE_MS
  )
    return;
  const [compressed, typesBuffer] = await Promise.all([
    download(AIRCRAFT_URL, 30000000),
    download(TYPES_URL, 5000000),
  ]);
  const aircraft = parseAircraftCatalog(
    gunzipSync(compressed, { maxOutputLength: 200000000 }).toString("utf8"),
  );
  const types = parseAircraftTypes(JSON.parse(typesBuffer.toString("utf8")));
  if (aircraft.length < 100000 || types.length < 1000)
    throw new Error(
      "Incomplete aircraft catalog; preserving the previous database.",
    );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(736592) AS locked",
    );
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return;
    }
    // Atomic replacement: readers continue seeing the previous committed catalog.
    await client.query("DELETE FROM aircraft_metadata");
    await client.query("DELETE FROM aircraft_types");
    await client.query(
      `INSERT INTO aircraft_types SELECT * FROM jsonb_to_recordset($1::jsonb)
      AS x(type_code text, model text, description text, wake_category text)`,
      [JSON.stringify(types)],
    );
    for (let offset = 0; offset < aircraft.length; offset += 2000) {
      await client.query(
        `INSERT INTO aircraft_metadata SELECT * FROM jsonb_to_recordset($1::jsonb)
        AS x(icao24 text, registration text, type_code text, model text, operator text)`,
        [JSON.stringify(aircraft.slice(offset, offset + 2000))],
      );
    }
    await client.query(
      `INSERT INTO aircraft_catalog_sync VALUES (1, NOW(), $1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET fetched_at = EXCLUDED.fetched_at,
      aircraft_count = EXCLUDED.aircraft_count, type_count = EXCLUDED.type_count, source = EXCLUDED.source`,
      [aircraft.length, types.length, CATALOG_SOURCE],
    );
    await client.query("COMMIT");
    return { aircraft: aircraft.length, types: types.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function enrichAircraft(
  pool: pg.Pool,
  aircraft: AircraftPosition[],
): Promise<AircraftPosition[]> {
  if (!aircraft.length) return aircraft;
  const result = await pool.query<{
    icao24: string;
    registration: string | null;
    type_code: string | null;
    model: string | null;
    operator: string | null;
    description: string | null;
    wake_category: string | null;
    fetched_at: Date;
  }>(
    `SELECT a.icao24, a.registration, a.type_code, COALESCE(a.model, t.model) AS model,
      a.operator, t.description, t.wake_category, s.fetched_at
    FROM aircraft_metadata a LEFT JOIN aircraft_types t USING(type_code)
    CROSS JOIN aircraft_catalog_sync s WHERE s.id = 1 AND a.icao24 = ANY($1::text[])`,
    [aircraft.map((position) => position.id)],
  );
  const byId = new Map(result.rows.map((row) => [row.icao24, row]));
  return aircraft.map((position) => {
    const row = byId.get(position.id);
    if (!row) return position;
    return {
      ...position,
      model: row.model ?? position.model,
      typeCode: row.type_code ?? position.typeCode,
      registration: row.registration,
      operator: row.operator,
      typeDescription: row.description,
      wakeCategory: row.wake_category,
      metadataSource: CATALOG_SOURCE,
      metadataUpdatedAt: row.fetched_at.toISOString(),
    };
  });
}
