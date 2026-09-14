import { test, expect } from "@playwright/test";

test("search finds an offscreen flight and route airports remain inspectable", async ({
  page,
}, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: { id: "test", email: "pilot@example.test" },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { message: "Ready" } }),
  );
  await page.route("**/maps/style.json", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#060e17" },
          },
        ],
      },
    }),
  );
  const timestamp = new Date().toISOString();
  const plane = {
    id: "abc123",
    callsign: "TEST123",
    category: "heavy",
    model: "Boeing 777",
    latitude: 48,
    longitude: 15,
    lastUpdated: timestamp,
    positionUpdatedAt: timestamp,
    altitudeMeters: 10000,
    speedMetersPerSecond: 200,
    headingDegrees: 90,
    verticalRateMetersPerSecond: 0,
    onGround: false,
    originCountry: "Austria",
  };
  let searches = 0;
  await page.route("**/api/aircraft?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const search = query.get("search");
    if (search) searches++;
    const visible =
      plane.latitude >= Number(query.get("minimumLatitude")) &&
      plane.latitude <= Number(query.get("maximumLatitude")) &&
      plane.longitude >= Number(query.get("minimumLongitude")) &&
      plane.longitude <= Number(query.get("maximumLongitude"));
    return route.fulfill({
      json: {
        aircraft: (search ? search.toUpperCase() === "TEST" : visible)
          ? [plane]
          : [],
        observedAt: timestamp,
        fetchedAt: timestamp,
        cached: true,
        stale: false,
        provider: "test",
        region: { name: "Worldwide", bounds: {} },
      },
    });
  });
  const airport = (
    icao: string,
    name: string,
    latitude: number,
    longitude: number,
  ) => ({
    icao,
    iata: null,
    name,
    city: "City",
    country: "Country",
    latitude,
    longitude,
  });
  await page.route("**/api/aircraft/abc123/route", (route) =>
    route.fulfill({
      json: {
        status: "available",
        callsign: "TEST123",
        source: "test",
        fetchedAt: timestamp,
        origin: airport("LOWW", "Vienna Airport", 48.11, 16.57),
        via: [airport("LPPT", "Lisbon Airport", 38.77, -9.13)],
        destination: airport("SBGR", "Guarulhos Airport", -23.43, -46.47),
        airline: "Test Airline",
        flightNumber: "T123",
      },
    }),
  );
  await page.goto("/app");
  const search = page.getByLabel("Find a flight");
  await expect(search).toBeVisible();
  await search.fill("NONE");
  await expect(
    page.getByRole("status").filter({ hasText: "No recent flights" }),
  ).toBeVisible();
  await search.fill("test");
  await page.getByRole("button", { name: "TEST123 · ABC123" }).click();
  await expect(page.getByLabel("Map zoom")).toHaveText("7.0 / 18");
  const panel = page.getByRole("complementary");
  await expect(panel).toContainText("Boeing 777");
  await expect(panel).toContainText("Test Airline");
  await expect(panel).toContainText("Lisbon Airport");
  await expect(panel).toContainText("current flight may differ");
  await expect(page.locator(".aircraft-feed")).toContainText("Live snapshot");
  // Selecting the same result must keep polling active even if bounds do not change.
  await search.fill("test");
  const sameView = page.waitForResponse((r) =>
    r.url().includes("minimumLatitude="),
  );
  await page.getByRole("button", { name: "TEST123 · ABC123" }).click();
  await sameView;
  await expect(page.getByLabel("Inspect aircraft")).toHaveValue("abc123");
  const response = page.waitForResponse((r) =>
    r.url().includes("minimumLatitude=-23"),
  );
  await page.getByRole("button", { name: "View SBGR on map" }).click();
  await response;
  await expect(page.getByLabel("Map zoom")).toHaveText("10.0 / 18");
  await expect(panel).toContainText("Guarulhos Airport");
  await expect(page.getByLabel("Inspect aircraft")).toHaveValue("abc123");
  await page.screenshot({
    path: testInfo.outputPath("flight-intelligence.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Close aircraft details" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "Close aircraft details" }).click();
  await expect(panel).toHaveCount(0);
  expect(searches).toBe(3);
  expect(failures).toEqual([]);
});
