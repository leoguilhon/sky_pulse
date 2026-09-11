import { test, expect } from "@playwright/test";

test("aircraft can be inspected by click and keyboard with distinct silhouettes", async ({
  page,
}, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const initialTimestamp = new Date().toISOString();
  const base = {
    latitude: -23.5505,
    longitude: -46.6333,
    altitudeMeters: 10000,
    speedMetersPerSecond: 200,
    headingDegrees: 90,
    verticalRateMetersPerSecond: 0,
    onGround: false,
    originCountry: "Brazil",
    positionUpdatedAt: initialTimestamp,
    lastUpdated: initialTimestamp,
  };
  const aircraft = [
    {
      ...base,
      id: "abc001",
      callsign: "HEAVY1",
      category: "heavy",
      typeCode: "B77W",
      model: "Boeing 777-300ER",
    },
    {
      ...base,
      longitude: -46.61,
      id: "abc002",
      callsign: "ROTOR2",
      category: "rotorcraft",
      headingDegrees: 0,
    },
    {
      ...base,
      longitude: -46.65,
      id: "abc003",
      callsign: "SINGLE3",
      category: "light",
      typeCode: "C172",
    },
    {
      ...base,
      latitude: -23.57,
      id: "abc004",
      callsign: null,
      category: null,
      altitudeMeters: null,
      speedMetersPerSecond: null,
      headingDegrees: null,
      onGround: true,
    },
    {
      ...base,
      latitude: -23.53,
      id: "abc005",
      callsign: "JET5",
      category: "small",
      typeCode: "C525",
    },
  ];
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: { id: "test-user", email: "pilot@example.test" },
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      },
    }),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { message: "Ready" } }),
  );
  let updateTelemetry = false;
  await page.route("**/api/aircraft", (route) => {
    const timestamp = new Date(
      Date.parse(initialTimestamp) + 30000,
    ).toISOString();
    const responseAircraft = updateTelemetry
      ? aircraft.map((position) =>
          position.id === "abc001"
            ? {
                ...position,
                longitude: -46.6233,
                altitudeMeters: 9000,
                speedMetersPerSecond: 150,
                headingDegrees: 100,
                verticalRateMetersPerSecond: -10,
                positionUpdatedAt: timestamp,
                lastUpdated: timestamp,
              }
            : position,
        )
      : aircraft;
    const responseTimestamp = updateTelemetry ? timestamp : initialTimestamp;
    return route.fulfill({
      json: {
        aircraft: responseAircraft,
        observedAt: responseTimestamp,
        fetchedAt: responseTimestamp,
        provider: "Test provider",
        cached: true,
        stale: true,
        region: { name: "Test region", bounds: {} },
      },
    });
  });
  // Use a local empty basemap so interaction tests do not depend on tile services.
  await page.route("**/maps/style.json", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          places: {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#183443" },
          },
          { id: "place_test", type: "symbol", source: "places", layout: {} },
        ],
      },
    }),
  );
  await page.route("**/api/aircraft/*/route", (route) =>
    route.fulfill({
      json: {
        status: "available",
        callsign: "HEAVY1",
        source: "Test routes",
        fetchedAt: base.lastUpdated,
        origin: {
          icao: "SBRJ",
          iata: "SDU",
          name: "Santos Dumont Airport",
          city: "Rio de Janeiro",
          country: "Brazil",
        },
        destination: {
          icao: "SBSP",
          iata: "CGH",
          name: "Congonhas Airport",
          city: "Sao Paulo",
          country: "Brazil",
        },
        via: [],
        airline: "Test airline",
        flightNumber: "T1001",
      },
    }),
  );
  await page.clock.install();
  await page.goto("/app");
  await expect(page.getByLabel("Inspect aircraft")).toBeVisible();
  await page.getByRole("button", { name: "São Paulo", exact: true }).click();
  await expect(page.getByLabel("Map zoom")).toHaveText("11.0 / 18");
  await expect(page.getByLabel("Map detail status")).toHaveText(
    "Map details ready",
  );
  const canvas = page.getByRole("img", { name: "Interactive 3D Earth" });
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const panel = page.getByRole("complementary", { name: "HEAVY1" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Boeing 777-300ER");
  await expect(panel).toContainText("32,808 ft");
  await expect(panel).toContainText("389 kt");
  await expect(panel).toContainText("90 °");
  await expect(panel).toContainText("Stale snapshot");
  await expect(panel.getByLabel("Flight route")).toContainText(
    "Santos Dumont Airport",
  );
  await expect(panel.getByLabel("Flight route")).toContainText(
    "Congonhas Airport",
  );
  await expect(panel.getByLabel("Flight route")).toContainText(
    "current flight may differ",
  );
  await expect(page.getByLabel("Map detail status")).toHaveText(
    "Map details ready",
  );
  await page.screenshot({
    path: testInfo.outputPath("aircraft-inspection.png"),
  });
  await page.getByRole("button", { name: "Close aircraft details" }).click();
  await expect(panel).toHaveCount(0);
  await expect(canvas).toBeFocused();
  const picker = page.getByLabel("Inspect aircraft");
  await picker.selectOption("abc002");
  await expect(page.getByRole("complementary")).toContainText(
    "Helicopter / rotorcraft",
  );
  await picker.selectOption("abc003");
  await expect(page.getByRole("complementary")).toContainText(
    "Single-engine aircraft",
  );
  await picker.selectOption("abc005");
  await expect(page.getByRole("complementary")).toContainText("Jet");
  await picker.selectOption("abc004");
  await expect(page.getByRole("complementary")).toContainText("Unknown type");
  await expect(page.getByRole("complementary")).toContainText("Not available");
  await expect(page.getByRole("complementary")).toContainText("On ground");
  await expect(page.getByLabel("Flight route")).toContainText(
    "no flight callsign reported",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Close aircraft details" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: testInfo.outputPath("aircraft-mobile.png") });
  await page.getByRole("button", { name: "Close aircraft details" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await picker.selectOption("abc001");
  await canvas.focus();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveValue("");
  await picker.selectOption("abc001");
  updateTelemetry = true;
  const refresh = page.waitForResponse("**/api/aircraft");
  await page.clock.fastForward(121000);
  await refresh;
  await expect(picker).toHaveValue("abc001");
  await page.clock.fastForward(30000);
  await expect(page.getByRole("complementary")).toContainText("29,528 ft");
  await expect(page.getByRole("complementary")).toContainText("292 kt");
  await expect(page.getByRole("complementary")).toContainText("-1,969 ft/min");
  // Expiry must run independently of successful polling and clear inspection.
  await page.route("**/api/aircraft", (route) => route.abort());
  await page.clock.fastForward(10 * 60 * 1000);
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole("complementary")).toHaveCount(0);
  expect(failures).toEqual([]);
});
