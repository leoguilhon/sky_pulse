import type { Pool } from "pg";

export interface User {
  id: string;
  email: string;
}
export interface Credentials extends User {
  passwordHash: string;
}
export interface Session {
  user: User;
  expiresAt: string;
}
export interface AuthStore {
  findUser(email: string): Promise<Credentials | undefined>;
  createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    previousHash?: string,
  ): Promise<void>;
  findSession(tokenHash: string): Promise<Session | undefined>;
  revokeSession(tokenHash: string): Promise<void>;
}

export function createAuthStore(pool: Pool): AuthStore {
  return {
    async findUser(email) {
      const result = await pool.query<Credentials>(
        'SELECT id, email, password_hash AS "passwordHash" FROM users WHERE email = $1',
        [email],
      );
      return result.rows[0];
    },
    async createSession(userId, tokenHash, expiresAt, previousHash) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM sessions WHERE expires_at <= NOW() OR token_hash = $1",
          [previousHash ?? null],
        );
        await client.query(
          "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
          [userId, tokenHash, expiresAt],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async findSession(tokenHash) {
      const result = await pool.query<{
        id: string;
        email: string;
        expires_at: Date;
      }>(
        "SELECT u.id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()",
        [tokenHash],
      );
      const row = result.rows[0];
      return row
        ? {
            user: { id: row.id, email: row.email },
            expiresAt: row.expires_at.toISOString(),
          }
        : undefined;
    },
    async revokeSession(tokenHash) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [
        tokenHash,
      ]);
    },
  };
}
