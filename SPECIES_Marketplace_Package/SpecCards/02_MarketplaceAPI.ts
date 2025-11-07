// SpecCard: Marketplace API Service
export const MarketplaceAPISpecCard: NodeInspectorContent = {
  node: "Marketplace API (v4.1)",
  
  role: "Ingress gateway for the SPECIES Marketplace Appliance. Validates requests, enforces idempotency/outbox pattern, resolves identities & vaults via the Marketplace User Registry (synced from Species_ProfileTray). Handles event submission, match proof submission, receipt retrieval, and admin operations including API key management.",
  
  headers: [
    { key: "X-API-Key", value: "<marketplace_api_key>", comment: "Required for all requests" },
    { key: "X-Nonce", value: "<uuid-v4>", comment: "Required for mutation requests" },
    { key: "X-Timestamp", value: "<RFC3339>", comment: "Required for mutation requests" },
    { key: "X-Signature", value: "<hmac_signature>", comment: "Required for mutation requests" },
    { key: "X-Event-Id", value: "<eventId>", comment: "Required for eventRequest" },
    { key: "Content-Type", value: "application/json", comment: "Required" }
  ],
  
  logic: [
    "1) Validate request format, size (<1MB), and content-type",
    "2) Forward authentication to Authenticator service",
    "3) For eventRequest: Check idempotency by (eventId + body_hash)",
    "4) First-seen request → persist to event_ingress table with status='PROCESSING'",
    "5) Resolve from/to → {onliId, vaultId} from Marketplace User Registry (cache-first)",
    "6) Validate resolved users are ACTIVE status",
    "7) Write to transactional outbox: emit 'order.received' event",
    "8) Return 202 Accepted with eventId and tracking URL",
    "9) For duplicate requests: check body_hash → same=202, different=409",
    "10) For match proofs: forward to Validator service directly",
    "11) For receipts: query from Reporter service with caching",
    "12) Admin endpoints: manage API keys with proper authorization"
  ],
  
  typescript: `// Interfaces
export interface EventRequest {
  eventId: string;
  from: string;      // onliId or username
  to: string;        // onliId, username, or 'treasury'
  amount: number;    // SPECIES amount (integer)
  payWith?: {
    currency: 'USDT';
    chain: 'TRON' | 'ETH' | 'BSC';
    proof?: string;    // Payment proof ID
    feeProof?: string; // Fee payment proof
  };
  putProceeds?: {
    usdtAddress: string;
    chain: 'TRON' | 'ETH' | 'BSC';
  };
  metadata?: {
    listingId?: string;
    note?: string;
  };
}

export interface MatchProofSubmission {
  eventId: string;
  matchId: string;
  amount: number;
  currency: 'USDT';
  chain: 'TRON' | 'ETH' | 'BSC';
  proof: string;
}

export interface MarketplaceUser {
  marketplaceUserId: string;
  onliId: string;
  vaultId?: string;
  apiKeyId?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'INVITED';
  profileTrayRef?: string;
  createdAt: Date;
  updatedAt: Date;
  lastSync?: Date;
}

export interface AcceptedResponse {
  eventId: string;
  status: 'ACCEPTED';
  trackingUrl: string;
  estimatedCompletion?: string;
}

export interface EventReceipt {
  eventId: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
  intent: 'BUY_TREASURY' | 'BUY_MARKET' | 'SELL_MARKET' | 'TRANSFER';
  from: string;
  to: string;
  amount: number;
  fills: Fill[];
  payments: PaymentRecord[];
  assetReceipts: AssetReceipt[];
  ledgerPostings: string[];
  timestamps: {
    received: string;
    authenticated?: string;
    validated?: string;
    matched?: string;
    settled?: string;
    delivered?: string;
    completed?: string;
  };
  fees: {
    listing?: number;
    issuance?: number;
    liquidity?: number;
    total: number;
  };
  error?: {
    code: string;
    message: string;
    occurredAt: string;
  };
}

// Service class
export class MarketplaceAPI {
  constructor(
    private authenticator: AuthenticatorClient,
    private validator: ValidatorClient,
    private registry: MarketplaceUserRegistry,
    private reporter: ReporterClient,
    private eventBus: EventBus,
    private cache: CacheService,
    private db: Database
  ) {}
  
  // Endpoints
  async submitEventRequest(req: EventRequest): Promise<AcceptedResponse> {}
  async submitMatchProof(matchId: string, proof: MatchProofSubmission): Promise<any> {}
  async getEventReceipt(eventId: string): Promise<EventReceipt> {}
  async streamEvents(eventId: string): AsyncIterator<Event> {}
  
  // Admin endpoints
  async issueApiKey(onliId: string): Promise<ApiKeyResponse> {}
  async revokeApiKey(apiKeyId: string): Promise<void> {}
  async getUserDetails(onliId: string): Promise<MarketplaceUser> {}
}

// Idempotency implementation
export class IdempotencyManager {
  async checkAndStore(eventId: string, bodyHash: string): Promise<'new' | 'duplicate' | 'conflict'> {}
  private hashBody(body: any): string {}
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Marketplace API Configuration",
  "type": "object",
  "required": ["service", "database", "cache", "eventBus", "limits"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "marketplace-api" },
        "port": { "type": "integer", "default": 8080 },
        "publicUrl": { "type": "string", "format": "uri" }
      }
    },
    "database": {
      "type": "object",
      "properties": {
        "url": { "type": "string" },
        "maxConnections": { "type": "integer", "default": 100 },
        "connectionTimeout": { "type": "integer", "default": 30 }
      }
    },
    "cache": {
      "type": "object",
      "properties": {
        "redisUrl": { "type": "string" },
        "ttl": {
          "type": "object",
          "properties": {
            "userProfiles": { "type": "integer", "default": 300 },
            "eventReceipts": { "type": "integer", "default": 3600 },
            "idempotency": { "type": "integer", "default": 86400 }
          }
        }
      }
    },
    "eventBus": {
      "type": "object",
      "properties": {
        "type": { "enum": ["redis", "nats"] },
        "connectionUrl": { "type": "string" },
        "topics": {
          "type": "object",
          "properties": {
            "orderReceived": { "type": "string", "default": "order.received" }
          }
        }
      }
    },
    "limits": {
      "type": "object",
      "properties": {
        "maxRequestSize": { "type": "integer", "default": 1048576 },
        "maxEventAge": { "type": "integer", "default": 86400 },
        "requestTimeout": { "type": "integer", "default": 30 }
      }
    },
    "endpoints": {
      "type": "object",
      "properties": {
        "public": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "method": { "enum": ["GET", "POST"] },
              "path": { "type": "string" },
              "auth": { "type": "boolean" }
            }
          }
        },
        "admin": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "method": { "enum": ["GET", "POST", "DELETE"] },
              "path": { "type": "string" },
              "role": { "type": "string" }
            }
          }
        }
      }
    }
  }
}`
};
