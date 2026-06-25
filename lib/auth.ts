import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

export interface JWTPayload {
  userId: string;
  email: string;
}

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = "1y";

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  return authHeader.slice(7);
}

export function getOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(state?: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    ...(state ? { state } : {}),
  });
}

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  name: string;
}

export async function exchangeCodeForUser(
  code: string
): Promise<GoogleUserInfo> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token!,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload()!;
  return {
    googleId: payload.sub,
    email: payload.email!,
    name: payload.name ?? payload.email!,
  };
}
