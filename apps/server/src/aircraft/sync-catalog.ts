import { createDatabase } from "../database.js";
import { syncAircraftCatalog } from "./catalog.js";
const pool = createDatabase();
try {
  console.info(
    (await syncAircraftCatalog(pool, true)) ?? "Catalog sync already running.",
  );
} finally {
  await pool.end();
}
