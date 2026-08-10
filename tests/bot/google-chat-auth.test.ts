import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, generateSecret, SignJWT, type JWTVerifyGetKey } from "jose";

import {
  createGoogleChatRequestVerifier,
  GOOGLE_CHAT_ISSUER,
  GOOGLE_CHAT_SERVICE_ACCOUNT,
} from "../../src/lib/bot/google-chat-auth";

const AUDIENCE = "https://workbot.example.com/api/bot/google-chat";

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let wrongPrivateKey: CryptoKey;
let keyResolver: JWTVerifyGetKey;

interface TokenOptions {
  readonly issuer?: string;
  readonly audience?: string;
  readonly expirationTime?: number | null;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly signingKey?: CryptoKey;
}

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
  ({ privateKey: wrongPrivateKey } = await generateKeyPair("RS256"));
  keyResolver = vi.fn().mockResolvedValue(publicKey);
});

async function signedToken(options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  let token = new SignJWT({
    email: options.email ?? GOOGLE_CHAT_SERVICE_ACCOUNT,
    email_verified: options.emailVerified ?? true,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? GOOGLE_CHAT_ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt(now);

  if (options.expirationTime !== null) {
    token = token.setExpirationTime(options.expirationTime ?? now + 300);
  }

  return token.sign(options.signingKey ?? privateKey);
}

describe("Google Chat OIDC verifier", () => {
  it("accepts a valid RS256 Google Chat ID token for the exact endpoint URL", async () => {
    const verifier = createGoogleChatRequestVerifier(AUDIENCE, keyResolver);

    await expect(verifier.verify(`Bearer ${await signedToken()}`)).resolves.toEqual({ kind: "valid" });
  });

  it.each([null, "", "Basic opaque", "Bearer", "Bearer token with-spaces"])(
    "rejects a malformed Authorization header: %j",
    async (authorization) => {
      const verifier = createGoogleChatRequestVerifier(AUDIENCE, keyResolver);

      await expect(verifier.verify(authorization)).resolves.toEqual({ kind: "invalid" });
    },
  );

  it("treats the bearer scheme as case-insensitive", async () => {
    const verifier = createGoogleChatRequestVerifier(AUDIENCE, keyResolver);

    await expect(verifier.verify(`bearer ${await signedToken()}`)).resolves.toEqual({ kind: "valid" });
  });

  it("accepts Google's documented legacy issuer alias", async () => {
    const verifier = createGoogleChatRequestVerifier(AUDIENCE, keyResolver);

    await expect(verifier.verify(`Bearer ${await signedToken({ issuer: "accounts.google.com" })}`)).resolves.toEqual({
      kind: "valid",
    });
  });

  it("returns unavailable when the audience is missing or blank", async () => {
    const token = await signedToken();

    await expect(createGoogleChatRequestVerifier(undefined, keyResolver).verify(`Bearer ${token}`)).resolves.toEqual({
      kind: "unavailable",
    });
    await expect(createGoogleChatRequestVerifier("  ", keyResolver).verify(`Bearer ${token}`)).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it.each([
    ["issuer", { issuer: "https://issuer.example.com" }],
    ["audience", { audience: "https://other.example.com/api/bot/google-chat" }],
    ["expiration", { expirationTime: Math.floor(Date.now() / 1_000) - 60 }],
    ["required expiration", { expirationTime: null }],
    ["email", { email: "other@example.com" }],
    ["verified email", { emailVerified: false }],
  ] as const)("rejects an invalid %s claim", async (_claim, options) => {
    const verifier = createGoogleChatRequestVerifier(AUDIENCE, keyResolver);

    await expect(verifier.verify(`Bearer ${await signedToken(options)}`)).resolves.toEqual({ kind: "invalid" });
  });

  it("rejects a token signed by an untrusted key", async () => {
    const verifier = createGoogleChatRequestVerifier(AUDIENCE, keyResolver);

    await expect(verifier.verify(`Bearer ${await signedToken({ signingKey: wrongPrivateKey })}`)).resolves.toEqual({
      kind: "invalid",
    });
  });

  it("rejects an algorithm outside the RS256 allowlist", async () => {
    const secret = await generateSecret("HS256");
    const token = await new SignJWT({
      email: GOOGLE_CHAT_SERVICE_ACCOUNT,
      email_verified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(GOOGLE_CHAT_ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5 minutes")
      .sign(secret);
    const verifier = createGoogleChatRequestVerifier(AUDIENCE, keyResolver);

    await expect(verifier.verify(`Bearer ${token}`)).resolves.toEqual({ kind: "invalid" });
  });

  it("maps a JWKS transport failure to unavailable without exposing the error", async () => {
    const unavailableResolver: JWTVerifyGetKey = vi.fn().mockRejectedValue(new TypeError("private network detail"));
    const verifier = createGoogleChatRequestVerifier(AUDIENCE, unavailableResolver);

    await expect(verifier.verify(`Bearer ${await signedToken()}`)).resolves.toEqual({ kind: "unavailable" });
  });
});
