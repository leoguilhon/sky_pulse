import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const prefix = "scrypt:32768:8:3";
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `${prefix}:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split(":");
  const salt = parts[4];
  const key = parts[5];
  if (
    parts.slice(0, 4).join(":") !== prefix ||
    parts.length !== 6 ||
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !key ||
    !/^[a-f0-9]{128}$/.test(key)
  )
    return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(key, "hex"));
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
export function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
