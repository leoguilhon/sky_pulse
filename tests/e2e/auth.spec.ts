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
  await expect(page.getByText("Ready for takeoff")).toBeVisible();
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
  await expect(page.getByText("Ready for takeoff")).toBeVisible();
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
  await expect(page.getByText("Ready for takeoff")).toHaveCount(0);
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
  await expect(page.getByText("Ready for takeoff")).toHaveCount(0);
  await page.unroute("**/api/auth/session");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
