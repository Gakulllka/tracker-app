// Simple password hashing for SQLite (no bcrypt dependency needed)
// Using SHA-256 + salt approach (sufficient for this use case)

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
    .reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");
  
  const encoder = new TextEncoder();
  // Multiple rounds of SHA-256 for key stretching
  let hash = password + salt;
  for (let i = 0; i < SALT_ROUNDS; i++) {
    const data = encoder.encode(hash);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hash = hashArray.reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");
  }
  
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) return false;
  
  const encoder = new TextEncoder();
  let hash = password + salt;
  for (let i = 0; i < SALT_ROUNDS; i++) {
    const data = encoder.encode(hash);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hash = hashArray.reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");
  }
  
  return hash === expectedHash;
}

export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");
}
