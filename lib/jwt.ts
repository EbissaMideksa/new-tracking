
// lib/jwt.ts
import jwt from "jsonwebtoken"

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set in environment variables (min 32 chars)")
  }
  return secret
}

export function signToken(payload: object): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "8h" }) // shorter window
}

export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret())
    if (typeof decoded === "string") return null
    return decoded
  } catch {
    return null
  }
}
