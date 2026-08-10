export type GoogleChatAuthorizationResult =
  | { readonly kind: "valid" }
  | { readonly kind: "invalid" }
  | { readonly kind: "unavailable" };

export interface GoogleChatRequestVerifier {
  verify(authorizationHeader: string | null): Promise<GoogleChatAuthorizationResult>;
}

export type GoogleChatCallbackOutcome =
  | "accepted"
  | "removed"
  | "method_not_allowed"
  | "unauthorized"
  | "verification_unavailable"
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_event"
  | "internal_error";

export interface GoogleChatCallbackLog {
  readonly requestId: string;
  readonly eventType?: string;
  readonly outcome: GoogleChatCallbackOutcome;
  readonly status: number;
  readonly durationMs: number;
}

export interface GoogleChatCallbackDependencies {
  readonly verifier: GoogleChatRequestVerifier;
  readonly now: () => number;
  readonly createRequestId: () => string;
  readonly log: (record: GoogleChatCallbackLog) => void;
}
