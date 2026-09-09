import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

const email = `e2e-${randomBytes(8).toString("hex")}@example.test`;
const password = randomBytes(24).toString("base64url");
function database(sql: string) {
  const script = `import { createDatabase } from './apps/server/dist/database.js';
    const pool = createDatabase();
    try { await pool.query(process.argv[1], [process.argv[2]]); } finally { await pool.end(); }`;
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "server",
      "node",
      "--input-type=module",
      "-e",
      script,
      sql,
      email,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}
test.beforeAll(() => {
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "server",
      "node",
      "apps/server/dist/create-user.js",
    ],
    {
      input: JSON.stringify({ email, password }),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
});
test.afterAll(() => {
  database("DELETE FROM users WHERE email = $1");
});
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("img", { name: "Interactive 3D Earth" }),
  ).toBeVisible();
}

test("protected route, invalid login, persistence, and revocation on logout", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Email or password is incorrect.",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await signIn(page);
  const cookie = (await context.cookies()).find(
    (item) => item.name === "skypulse" || item.name === "__Host-skypulse",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    cookie.value,
  );
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Interactive 3D Earth" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("You have signed out.")).toBeVisible();
  const replay = await request.get("/api/workspace", {
    headers: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  expect(replay.status()).toBe(401);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("server-side expiration returns an open workspace to login", async ({
  page,
}) => {
  await signIn(page);
  database(
    "UPDATE sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = (SELECT id FROM users WHERE email = $1)",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Your session has ended. Please sign in again."),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Interactive 3D Earth" }),
  ).toHaveCount(0);
});

test("client expiration timer clears the protected workspace", async ({
  page,
}) => {
  await page.clock.install();
  await signIn(page);
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Your session has ended. Please sign in again."),
  ).toBeVisible();
});

test("session network failure shows retry instead of protected content", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) => route.abort());
  await page.goto("/app");
  await expect(page.getByRole("alert")).toContainText(
    "Unable to reach SkyPulse",
  );
  await expect(
    page.getByRole("img", { name: "Interactive 3D Earth" }),
  ).toHaveCount(0);
  await page.unroute("**/api/auth/session");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("globe supports region navigation, zoom, dragging, keyboard, and resize", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.setViewportSize({ width: 1440, height: 950 });
  await signIn(page);
  const canvas = page.getByRole("img", { name: "Interactive 3D Earth" });
  const coordinates = page.getByLabel("Camera coordinates");
  const altitude = page.getByLabel("Map zoom");
  await expect(coordinates).toContainText("15.0° S");
  await expect(page.getByLabel("Visible place names")).not.toBeEmpty({
    timeout: 30000,
  });
  await expect(page.getByLabel("Map detail status")).toHaveText(
    "Map details ready",
  );
  await expect(page.getByLabel("Visible place names")).toContainText("Brazil");
  await expect(page.getByLabel("Visible place names")).not.toContainText(
    /Angola|Namibia|South Africa|Nigeria|Gabon|Congo/,
  );
  await page.screenshot({ path: testInfo.outputPath("earth-brazil.png") });
  await page.getByRole("button", { name: "Europe", exact: true }).click();
  await expect(coordinates).toContainText("48.0° N");
  await expect(coordinates).toContainText("15.0° E");
  await expect(page.getByLabel("Map detail status")).toHaveText(
    "Map details ready",
    { timeout: 30000 },
  );
  await expect(page.getByLabel("Visible place names")).toContainText("Germany");
  await expect(page.getByLabel("Visible place names")).not.toContainText(
    "Brazil",
  );
  const beforeZoom = await altitude.textContent();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(altitude).not.toHaveText(beforeZoom!);
  await page.getByRole("button", { name: "Asia", exact: true }).click();
  await expect(coordinates).toContainText("105.0° E");
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(coordinates).toContainText("90.0° E");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 120,
    box.y + box.height / 2 + 40,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(coordinates).not.toContainText("90.0° E");
  await page.getByRole("button", { name: "Reset globe view" }).click();
  await expect(coordinates).toContainText("52.0° W");
  await expect(altitude).toHaveText("2.4 / 18");
  await page.getByRole("button", { name: "Brazil", exact: true }).click();
  await expect(altitude).toHaveText("4.0 / 18");
  await expect(page.getByLabel("Map detail status")).toHaveText(
    "Map details ready",
    { timeout: 30000 },
  );
  await expect(page.getByLabel("Visible place names")).toContainText(
    "Minas Gerais",
    { timeout: 30000 },
  );
  await page.screenshot({ path: testInfo.outputPath("map-states.png") });
  await page.getByRole("button", { name: "São Paulo", exact: true }).click();
  await expect(altitude).toHaveText("11.0 / 18");
  await expect(page.getByLabel("Map detail status")).toHaveText(
    "Map details ready",
    { timeout: 30000 },
  );
  await expect(page.getByLabel("Visible place names")).toContainText(
    "São Paulo",
    { timeout: 30000 },
  );
  await expect(page.getByLabel("Visible place names")).toContainText(
    "Guarulhos",
  );
  await page.screenshot({ path: testInfo.outputPath("map-city.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: testInfo.outputPath("earth-mobile.png") });
  expect(failures).toEqual([]);
});

test("missing map can be retried and WebGL context loss stays recoverable", async ({
  page,
}) => {
  await page.route("**/maps/style.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Earth map could not be loaded",
  );
  await page.unroute("**/maps/style.json");
  await page.getByRole("button", { name: "Reload globe" }).click();
  const canvas = page.getByRole("img", { name: "Interactive 3D Earth" });
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element) =>
    (element as HTMLCanvasElement)
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext(),
  );
  await expect(page.getByRole("alert")).toContainText(
    "3D connection was interrupted",
  );
  await page.getByRole("button", { name: "Reload globe" }).click();
  await expect(canvas).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unsupported WebGL shows a useful error and preserves logout", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "3D rendering is unavailable",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("globe module loading failure leaves account controls available", async ({
  page,
}) => {
  await page.route("**/assets/globe-*.js", (route) => route.abort());
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Earth explorer could not be started",
  );
  await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("map provider failure is visible and can be retried", async ({ page }) => {
  test.setTimeout(60000);
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await signIn(page);
  await expect(page.getByRole("alert")).toContainText(
    "Some map details could not be loaded",
  );
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeEnabled();
  await page.unroute("https://tiles.openfreemap.org/**");
  await page.getByRole("button", { name: "Reload map", exact: true }).click();
  await expect(page.getByLabel("Map detail status")).toHaveText(
    "Map details ready",
    { timeout: 30000 },
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
