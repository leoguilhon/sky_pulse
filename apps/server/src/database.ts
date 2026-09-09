import pg from "pg";
export function createDatabase() {
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) throw new Error("POSTGRES_PASSWORD is required.");
  return new pg.Pool({
    host: process.env.DB_HOST ?? "database",
    port: 5432,
    database: "skypulse",
    user: "skypulse",
    password,
    max: 10,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    statement_timeout: 3000,
  });
}
