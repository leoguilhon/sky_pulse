import { test, expect } from "@playwright/test";

// MVT with a single clockwise polygon covering the entire water tile.
const oceanTile = Buffer.from(
  "GiJ4AQoFd2F0ZXIogCASFBIAGAMiDgkAABqAQAAAgED/PwAP",
  "base64",
);

test("world coverage survives rapid rotation while detailed tiles are stalled", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: { id: "test-user", email: "pilot@example.test" },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    }),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { message: "Ready" } }),
  );
  await page.route("**/api/aircraft?*", (route) =>
    route.fulfill({
      json: {
        aircraft: [],
        provider: "Test",
        region: { name: "Worldwide" },
      },
    }),
  );
  await page.route("**/maps/style.json", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          surface: {
            type: "vector",
            tiles: [`${new URL(page.url()).origin}/test-tiles/{z}/{x}/{y}.pbf`],
            minzoom: 0,
            maxzoom: 14,
          },
        },
        layers: [
          { id: "background", type: "background" },
          {
            id: "water",
            type: "fill",
            source: "surface",
            "source-layer": "water",
            paint: { "fill-antialias": false },
          },
          {
            id: "fixture-label",
            type: "symbol",
            source: "surface",
            "source-layer": "place",
          },
        ],
      },
    }),
  );
  const oceanPng = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#165a79";
    context.fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  let worldRequests = 0;
  await page.route("**/maps/world-base.png", (route) => {
    worldRequests++;
    return route.fulfill({
      contentType: "image/png",
      body: Buffer.from(oceanPng, "base64"),
    });
  });
  let detailRequests = 0;
  let release!: () => void;
  const stalled = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/test-tiles/**", async (route) => {
    detailRequests++;
    await stalled;
    await route.fulfill({
      contentType: "application/x-protobuf",
      body: oceanTile,
    });
  });
  try {
    await page.goto("/app");
    const canvas = page.getByRole("img", { name: "Interactive 3D Earth" });
    await expect(canvas).toBeVisible();
    await expect(page.getByLabel("Map zoom")).toHaveText("2.4 / 18");
    expect(worldRequests).toBe(1);
    await expect.poll(() => detailRequests).toBeGreaterThan(0);

    async function expectOcean() {
      const png = await canvas.screenshot({
        path: "test-results/globe-loading.png",
      });
      const greenPixels = await page.evaluate(
        async (bytes) => {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          );
          const sample = document.createElement("canvas");
          sample.width = bitmap.width;
          sample.height = bitmap.height;
          const context = sample.getContext("2d")!;
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const { data } = context.getImageData(
            0,
            0,
            sample.width,
            sample.height,
          );
          let green = 0;
          let ocean = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 1]! > data[i + 2]! + 3 && data[i + 1]! > data[i]! + 8)
              green++;
            if (data[i + 2]! > data[i + 1]! + 8 && data[i + 1]! > data[i]! + 20)
              ocean++;
          }
          const center =
            (Math.floor(sample.height / 2) * sample.width +
              Math.floor(sample.width / 2)) *
            4;
          return { green, ocean, centerBlue: data[center + 2]! };
        },
        [...png],
      );
      expect(greenPixels.ocean).toBeGreaterThan(10000);
      // Ignore small UI accents and antialiased edges in the canvas screenshot.
      expect(greenPixels.green / greenPixels.ocean).toBeLessThan(0.005);
      return greenPixels.centerBlue;
    }

    await expectOcean();
    const box = (await canvas.boundingBox())!;
    for (const direction of [1, -1, 1]) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + direction * 300,
        box.y + box.height / 2,
        { steps: 3 },
      );
      await expectOcean();
      await page.mouse.up();
    }
    await page.getByRole("button", { name: "Asia", exact: true }).click();
    await expect(page.getByLabel("Camera coordinates")).toContainText("105.0");
    await expectOcean();
    await page.getByRole("button", { name: "São Paulo", exact: true }).click();
    await expect(page.getByLabel("Map zoom")).toHaveText("11.0 / 18");
    const coarseBlue = await expectOcean();
    release();
    await expect(page.getByLabel("Map detail status")).toHaveText(
      "Map details ready",
    );
    await expect.poll(expectOcean).toBeLessThan(coarseBlue - 20);
    await page.getByRole("button", { name: "Reset globe view" }).click();
    await expect(page.getByLabel("Map zoom")).toHaveText("2.4 / 18");
    await expectOcean();
    expect(worldRequests).toBe(1);
    expect(failures).toEqual([]);
  } finally {
    release();
  }
});

test("bundled world remains visible when the external map provider is offline", async ({
  page,
}, testInfo) => {
  await page.route("**/api/**", (route) => {
    const session =
      new URL(route.request().url()).pathname === "/api/auth/session";
    return route.fulfill({
      json: session
        ? {
            user: { id: "test-user", email: "pilot@example.test" },
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          }
        : { aircraft: [], provider: "Test", region: { name: "Worldwide" } },
    });
  });
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  let imageRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/maps/world-base.png")) imageRequests++;
  });
  await page.goto("/app");
  const canvas = page.getByRole("img", { name: "Interactive 3D Earth" });
  await expect(canvas).toBeVisible();
  await expect(page.getByLabel("Camera coordinates")).toContainText("52.0");
  const png = await canvas.screenshot({
    path: testInfo.outputPath("offline-world.png"),
  });
  const pixels = await page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const sample = document.createElement("canvas");
      sample.width = bitmap.width;
      sample.height = bitmap.height;
      const context = sample.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixel = (x: number) => [
        ...context.getImageData(
          Math.floor(sample.width * x),
          Math.floor(sample.height / 2),
          1,
          1,
        ).data,
      ];
      return { brazil: pixel(0.5), atlantic: pixel(0.68) };
    },
    [...png],
  );
  expect(pixels.brazil[1]).toBeGreaterThan(pixels.brazil[2]!);
  expect(pixels.atlantic[2]).toBeGreaterThan(pixels.atlantic[1]!);
  expect(imageRequests).toBe(1);
});
