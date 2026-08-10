import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

import type { GoogleChatRequestVerifier } from "./google-chat-contract";

export const GOOGLE_CHAT_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_CHAT_ISSUER = "https://accounts.google.com";
export const GOOGLE_CHAT_SERVICE_ACCOUNT = "chat@system.gserviceaccount.com";

const GOOGLE_CHAT_JWKS = createRemoteJWKSet(new URL(GOOGLE_CHAT_JWKS_URL));
const GOOGLE_CHAT_ISSUERS = [GOOGLE_CHAT_ISSUER, "accounts.google.com"] as const;
const UNAVAILABLE_JOSE_CODES = new Set(["ERR_JOSE_GENERIC", "ERR_JWKS_INVALID", "ERR_JWKS_TIMEOUT"]);

function bearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  return /^Bearer\s+([^\s]+)$/i.exec(authorizationHeader.trim())?.[1] ?? null;
}

function isVerificationUnavailable(error: unknown): boolean {
  if (error instanceof TypeError || error instanceof errors.JWKSTimeout) {
    return true;
  }

  return error instanceof errors.JOSEError && UNAVAILABLE_JOSE_CODES.has(error.code);
}

export function createGoogleChatRequestVerifier(
  audience: string | undefined,
  keyResolver: JWTVerifyGetKey = GOOGLE_CHAT_JWKS,
): GoogleChatRequestVerifier {
  return {
    async verify(authorizationHeader) {
      if (!audience?.trim()) {
        return { kind: "unavailable" };
      }

      const token = bearerToken(authorizationHeader);
      if (!token) {
        return { kind: "invalid" };
      }

      try {
        const { payload } = await jwtVerify(token, keyResolver, {
          algorithms: ["RS256"],
          issuer: [...GOOGLE_CHAT_ISSUERS],
          audience,
          requiredClaims: ["exp", "email", "email_verified"],
        });

        return payload.email === GOOGLE_CHAT_SERVICE_ACCOUNT && payload.email_verified === true
          ? { kind: "valid" }
          : { kind: "invalid" };
      } catch (error) {
        return isVerificationUnavailable(error) ? { kind: "unavailable" } : { kind: "invalid" };
      }
    },
  };
}
