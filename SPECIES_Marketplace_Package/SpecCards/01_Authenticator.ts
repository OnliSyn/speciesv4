// SpecCard: Authenticator Service
export const AuthenticatorSpecCard: NodeInspectorContent = {
  node: "Authenticator (v4.1)",
  
  role: "Security gate and policy enforcer for the SPECIES Marketplace Appliance. Authenticates requests using the Marketplace-issued API Key and an HMAC signature created with the Secret kept in Species_ProfileTray. Resolves user presence/status via the Marketplace User Registry (synced from ProfileTray), then consults Onli Cloud AuthorizeBehavior to gate entry.",
  
  headers: [
    { key: "X-API-Key", value: "<marketplace_api_key>", comment: "issued by Marketplace" },
    { key: "X-Nonce", value: "<uuid-v4>", comment: "anti-replay (≤60s)" },
    { key: "X-Timestamp", value: "<RFC3339>", comment: "freshness window" },
    { key: "X-Signature", value: "base64(HMAC-SHA256(rawBody, <secret_from_ProfileTray>))", comment: "" },
    { key: "X-Event-Id", value: "<eventId>", comment: "idempotency key" }
  ],
  
  logic: [
    "1) Lookup API key in Marketplace User Registry → fetch {onliId, status, vaultId?, profileTrayRef?}",
    "2) Check cache for secret; if miss, server-to-server lookup of Secret via ProfileTrayRef",
    "3) Verify HMAC signature with secret + validate nonce uniqueness (60s) + timestamp freshness",
    "4) Check Marketplace user status ∈ {ACTIVE}; else reject with AUTH003",
    "5) Check rate limits: global (1000 rps) and per-key (10 rps)",
    "6) Call Onli Cloud AuthorizeBehavior(subject={onliId}, action='marketplace:eventRequest', context={eventId})",
    "7) If decision=ALLOW → emit 'request.authenticated' and cache result (5 min TTL)",
    "8) Else → emit 'auth.failed' with specific error code and stop",
    "9) Store nonce in Redis with 60s TTL for replay protection",
    "10) Update last_used timestamp for API key in database"
  ],
  
  typescript: `// Interfaces
export interface AuthHeaders {
  'X-API-Key': string;
  'X-Nonce': string;
  'X-Timestamp': string;
  'X-Signature': string;
  'X-Event-Id': string;
}

export interface MarketplaceUser {
  marketplaceUserId: string;
  onliId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'INVITED';
  vaultId?: string;
  profileTrayRef?: string;
  apiKeyId?: string;
  lastSync?: Date;
}

export interface AuthorizeBehaviorReq {
  subject: { onliId: string };
  action: 'marketplace:eventRequest';
  context: { 
    eventId: string;
    amount?: number;
    to?: string;
  };
}

export interface AuthorizeBehaviorRes {
  decision: 'ALLOW' | 'DENY';
  reason?: string;
  policyId?: string;
}

export interface AuthenticatedEvent {
  topic: 'request.authenticated';
  eventId: string;
  onliId: string;
  policyDecision: 'ALLOW';
  policyId?: string;
  ts: string;
}

export interface AuthFailedEvent {
  topic: 'auth.failed';
  eventId: string;
  code: 
    | 'AUTH001' // Invalid API key
    | 'AUTH002' // Invalid signature  
    | 'AUTH003' // User not active
    | 'AUTH004' // Nonce replay
    | 'AUTH005' // Timestamp expired
    | 'AUTH006' // Rate limit exceeded
    | 'AUTH007' // Policy denied
    | 'AUTH008' // Service unavailable;
  reason?: string;
  ts: string;
}

// Service
export class Authenticator {
  constructor(
    private registry: MarketplaceUserRegistry,
    private profileTray: ProfileTrayClient,
    private onliCloud: OnliCloudClient,
    private cache: CacheService,
    private rateLimiter: RateLimiter
  ) {}
  
  async authenticate(
    rawBody: string, 
    headers: AuthHeaders
  ): Promise<AuthenticatedEvent | AuthFailedEvent> {
    // Implementation with caching, rate limiting, and circuit breaker
  }
}

// Cache configuration
export const AuthCacheConfig = {
  userProfiles: { ttl: 300, maxSize: 10000 },    // 5 min
  secrets: { ttl: 3600, maxSize: 1000 },         // 1 hour
  authDecisions: { ttl: 300, maxSize: 5000 },    // 5 min
  nonces: { ttl: 60, maxSize: 10000 }            // 60 sec
};`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Authenticator Configuration",
  "type": "object",
  "required": ["service", "profileTray", "onliCloud", "cache", "rateLimiter"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "authenticator" },
        "port": { "type": "integer", "default": 8081 },
        "timeout": { "type": "integer", "default": 30 }
      }
    },
    "profileTray": {
      "type": "object",
      "properties": {
        "baseUrl": { "type": "string", "format": "uri" },
        "apiKey": { "type": "string" },
        "appKey": { "type": "string" },
        "timeout": { "type": "integer", "default": 10 }
      }
    },
    "onliCloud": {
      "type": "object",
      "properties": {
        "baseUrl": { "type": "string", "format": "uri" },
        "apiKey": { "type": "string" },
        "masterId": { "type": "string" }
      }
    },
    "cache": {
      "type": "object",
      "properties": {
        "redisUrl": { "type": "string" },
        "keyPrefix": { "type": "string", "default": "auth:" }
      }
    },
    "rateLimiter": {
      "type": "object",
      "properties": {
        "global": {
          "type": "object",
          "properties": {
            "requestsPerSecond": { "type": "integer", "default": 1000 },
            "burstSize": { "type": "integer", "default": 2000 }
          }
        },
        "perApiKey": {
          "type": "object",
          "properties": {
            "requestsPerSecond": { "type": "integer", "default": 10 },
            "burstSize": { "type": "integer", "default": 20 }
          }
        }
      }
    },
    "security": {
      "type": "object",
      "properties": {
        "nonceWindow": { "type": "integer", "default": 60 },
        "timestampSkew": { "type": "integer", "default": 60 },
        "signatureAlgorithm": { "const": "HMAC-SHA256" }
      }
    }
  }
}`
};
