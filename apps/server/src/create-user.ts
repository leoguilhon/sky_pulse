import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createDatabase } from "./database.js";
import { hashPassword, normalizeEmail, validEmail } from "./auth/password.js";

async function readCredentials(): Promise<{ email: string; password: string }> {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 4096) throw new Error("Input is too large.");
    }
    return JSON.parse(input);
  }
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  try {
    const email = await prompt.question("Email: ");
    process.stdout.write("Password (12-128 characters, hidden): ");
    muted = true;
    const password = await prompt.question("");
    process.stdout.write("\nConfirm password: ");
    const confirmation = await prompt.question("");
    if (password !== confirmation) throw new Error("Passwords do not match.");
    return { email, password };
  } finally {
    muted = false;
    prompt.close();
    process.stdout.write("\n");
  }
}

try {
  const credentials = await readCredentials();
  if (
    !credentials ||
    typeof credentials.email !== "string" ||
    typeof credentials.password !== "string"
  )
    throw new Error("Email and password are required.");
  const email = normalizeEmail(credentials.email);
  if (!validEmail(email)) throw new Error("Enter a valid email address.");
  if (credentials.password.length < 12 || credentials.password.length > 128)
    throw new Error("Password must contain 12-128 characters.");
  const passwordHash = await hashPassword(credentials.password);
  const pool = createDatabase();
  try {
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id",
      [email, passwordHash],
    );
    if (!result.rowCount)
      throw new Error("A user with this email already exists.");
    console.info("User created. You can now sign in.");
  } finally {
    await pool.end();
  }
} catch (error) {
  console.error(
    error instanceof Error && !("code" in error)
      ? error.message
      : "Unable to create user. Check database availability.",
  );
  process.exitCode = 1;
}
