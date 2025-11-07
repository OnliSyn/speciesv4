// SpecCard: Asset Manager Service
export const AssetManagerSpecCard: NodeInspectorContent = {
  node: "Asset Manager (v4.1)",
  
  role: "Executes Onli Cloud delivery operations after 'payment.confirmed' (or immediately for TRANSFER). Uses vault IDs resolved from the Marketplace User Registry (synced from Species_ProfileTray). Manages Issue, ChangeOwner, and Ask2Receive operations. Emits 'ownership.changed' on success or 'transfer.failed' on failure.",
  
  headers: "Internal service for events. External Onli Cloud calls use: X-API-Key, X-API-Secret, X-Request-Id",
  
  logic: [
    "1) Consume 'payment.confirmed' or 'order.classified' (for TRANSFER) events",
    "2) Resolve buyer and seller vault IDs from Marketplace User Registry",
    "3) For BUY_TREASURY: Call Onli Cloud Issue(recipient=buyerVault, amount)",
    "4) For BUY_MARKET: Call ChangeOwner(from=sellerLocker, to=buyerVault)",
    "5) For TRANSFER: Optional Ask2Receive, then ChangeOwner(from=sender, to=receiver)",
    "6) Use idempotency key: eventId:matchId in X-Request-Id header",
    "7) Implement retry logic with exponential backoff (max 3 retries)",
    "8) Handle Onli Cloud responses and error codes",
    "9) On success: emit 'ownership.changed' with assetReceiptId",
    "10) On failure: emit 'transfer.failed' with specific reason",
    "11) Store operation results for audit trail",
    "12) Update cache with new ownership state"
  ],
  
  typescript: `// Interfaces
export type Intent = 'BUY_TREASURY' | 'BUY_MARKET' | 'TRANSFER';

export interface PaymentConfirmed {
  topic: 'payment.confirmed';
  eventId: string;
  matchId: string;
  intent: Intent;
  from: string;
  to: string;
  amount: number;
  buyerVault?: string;
  sellerVault?: string;
  ts: string;
}

export interface OrderClassifiedTransfer {
  topic: 'order.classified';
  eventId: string;
  intent: 'TRANSFER';
  from: string;
  to: string;
  amount: number;
  ts: string;
}

export interface OwnershipChanged {
  topic: 'ownership.changed';
  eventId: string;
  matchId: string;
  assetReceiptId: string;
  operation: 'Issue' | 'ChangeOwner';
  from?: string;
  to: string;
  amount: number;
  onliCloudResponse?: {
    issueId?: string;
    evolveId?: string;
    deliveredAt: string;
    pkgTag?: string;
  };
  ts: string;
}

export interface TransferFailed {
  topic: 'transfer.failed';
  eventId: string;
  matchId: string;
  reason: 
    | 'locker.unavailable'
    | 'policy.denied'
    | 'input.invalid'
    | 'consent.rejected'
    | 'consent.timeout'
    | 'provider.unavailable'
    | 'insufficient.balance'
    | 'vault.not_found';
  details?: any;
  ts: string;
}

// Onli Cloud interfaces
export interface IssueRequest {
  to: string;           // Recipient user ID
  app_symbol: string;   // SPECIES
  amount: string;       // Amount to issue
  which_device: 'cloud' | 'mobile';
}

export interface ChangeOwnerRequest {
  from: string;         // Current owner
  to: string;          // New owner
  ask_to_move_id: string;
  app_symbol: string;
  amount: number;
  which_device: 'cloud' | 'mobile';
}

export interface Ask2ReceiveRequest {
  owner: string;
  app_symbol: string;
  note: {
    behavior: string;
    body: string;
  };
}

// Service implementation
export class AssetManager {
  constructor(
    private onliCloud: OnliCloudClient,
    private registry: MarketplaceUserRegistry,
    private eventBus: EventBus,
    private cache: CacheService,
    private retryPolicy: RetryPolicy
  ) {}
  
  async processPaymentConfirmed(event: PaymentConfirmed): Promise<void> {
    const idempotencyKey = \`\${event.eventId}:\${event.matchId}\`;
    
    try {
      let result: any;
      
      switch (event.intent) {
        case 'BUY_TREASURY':
          result = await this.executeTreasuryIssue(event, idempotencyKey);
          break;
        case 'BUY_MARKET':
          result = await this.executeMarketTransfer(event, idempotencyKey);
          break;
        case 'TRANSFER':
          result = await this.executeP2PTransfer(event, idempotencyKey);
          break;
      }
      
      // Emit success
      await this.eventBus.publish({
        topic: 'ownership.changed',
        eventId: event.eventId,
        matchId: event.matchId,
        assetReceiptId: result.assetReceiptId,
        operation: result.operation,
        from: event.from,
        to: event.to,
        amount: event.amount,
        onliCloudResponse: result.response,
        ts: new Date().toISOString()
      });
      
    } catch (error) {
      // Emit failure
      await this.eventBus.publish({
        topic: 'transfer.failed',
        eventId: event.eventId,
        matchId: event.matchId,
        reason: this.mapErrorReason(error),
        details: error.message,
        ts: new Date().toISOString()
      });
    }
  }
  
  private async executeTreasuryIssue(event: any, idempotencyKey: string) {
    return await this.retryPolicy.execute(async () => {
      const response = await this.onliCloud.issue({
        to: event.to,
        app_symbol: 'SPECIES',
        amount: String(event.amount),
        which_device: 'cloud'
      }, idempotencyKey);
      
      return {
        assetReceiptId: response.issue_id,
        operation: 'Issue',
        response: {
          issueId: response.issue_id,
          deliveredAt: response.delivered_at,
          pkgTag: response.pkg_tag
        }
      };
    });
  }
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Asset Manager Configuration",
  "type": "object",
  "required": ["service", "onliCloud", "retry", "cache"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "asset-manager" },
        "port": { "type": "integer", "default": 8087 },
        "workers": { "type": "integer", "default": 4 }
      }
    },
    "onliCloud": {
      "type": "object",
      "properties": {
        "baseUrl": { "type": "string" },
        "apiKey": { "type": "string" },
        "apiSecret": { "type": "string" },
        "appSymbol": { "type": "string", "default": "SPECIES" },
        "masterId": { "type": "string" },
        "timeout": { "type": "integer", "default": 30 }
      }
    },
    "retry": {
      "type": "object",
      "properties": {
        "maxAttempts": { "type": "integer", "default": 3 },
        "initialDelay": { "type": "integer", "default": 1000 },
        "maxDelay": { "type": "integer", "default": 10000 },
        "multiplier": { "type": "number", "default": 2.0 },
        "jitter": { "type": "boolean", "default": true }
      }
    },
    "operations": {
      "type": "object",
      "properties": {
        "defaultDevice": { "enum": ["cloud", "mobile"], "default": "cloud" },
        "ask2ReceiveTimeout": { "type": "integer", "default": 60 },
        "settlementWindow": { "type": "integer", "default": 172800 }
      }
    },
    "cache": {
      "type": "object",
      "properties": {
        "ownership": {
          "type": "object",
          "properties": {
            "ttl": { "type": "integer", "default": 300 },
            "keyPrefix": { "type": "string", "default": "ownership:" }
          }
        },
        "receipts": {
          "type": "object",
          "properties": {
            "ttl": { "type": "integer", "default": 3600 },
            "keyPrefix": { "type": "string", "default": "receipt:" }
          }
        }
      }
    },
    "eventBus": {
      "type": "object",
      "properties": {
        "subscribeTopics": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["payment.confirmed", "order.classified"]
        },
        "publishTopics": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["ownership.changed", "transfer.failed"]
        }
      }
    }
  }
}`
};
