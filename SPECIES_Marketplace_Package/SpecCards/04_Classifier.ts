// SpecCard: Classifier Service
export const ClassifierSpecCard: NodeInspectorContent = {
  node: "Classifier (v4.1)",
  
  role: "Pure-compute router that assigns intent to a validated request and emits 'order.classified'. Determines transaction intent based on destination (treasury vs market) and listing context. Reads Marketplace User Registry for role hints when needed. Completely stateless and idempotent.",
  
  headers: "Internal service - receives events only, no HTTP headers.",
  
  logic: [
    "1) Consume 'order.validated' event from event bus",
    "2) Extract event payload with validated request details",
    "3) Check for explicit listingId in metadata → BUY_MARKET",
    "4) Resolve 'to' field against Marketplace User Registry",
    "5) If 'to' is treasury user or contains 'treasury' → BUY_TREASURY",
    "6) If putProceeds field present (seller wants USDT) → SELL_MARKET",
    "7) Otherwise, default to TRANSFER (P2P asset movement)",
    "8) Emit 'order.classified' event with determined intent",
    "9) Log classification decision for audit",
    "10) Idempotent: same eventId always produces same classification"
  ],
  
  typescript: `// Interfaces
export type Intent = 'BUY_TREASURY' | 'BUY_MARKET' | 'SELL_MARKET' | 'TRANSFER';

export interface ClassifierInput {
  event: {
    eventId: string;
    from: string;
    to: string;
    amount: number;
    listingId?: string;
    putProceeds?: {
      usdtAddress: string;
      chain: string;
    };
  };
  userRegistry?: Map<string, UserRole>;
  ts: string;
}

export interface OrderClassified {
  topic: 'order.classified';
  eventId: string;
  intent: Intent;
  amount: number;
  listingId?: string;
  metadata?: {
    fromRole?: string;
    toRole?: string;
    classificationReason?: string;
  };
  ts: string;
}

export interface OrderValidated {
  topic: 'order.validated';
  eventId: string;
  from: string;
  to: string;
  amount: number;
  mode: 'BUY' | 'SELL' | 'TRANSFER';
  prepaid: boolean;
  evidence?: any;
  ts: string;
}

// Pure function classifier
export class Classifier {
  constructor(
    private registry: MarketplaceUserRegistry,
    private eventBus: EventBus
  ) {}
  
  // Core classification logic - pure function
  decide(input: ClassifierInput): OrderClassified {
    const { event, userRegistry } = input;
    let intent: Intent;
    let classificationReason: string;
    
    // Decision tree
    if (event.listingId) {
      intent = 'BUY_MARKET';
      classificationReason = 'Explicit listing ID provided';
    } else if (this.isTreasuryDestination(event.to, userRegistry)) {
      intent = 'BUY_TREASURY';
      classificationReason = 'Destination is treasury';
    } else if (event.putProceeds) {
      intent = 'SELL_MARKET';
      classificationReason = 'Put proceeds specified';
    } else {
      intent = 'TRANSFER';
      classificationReason = 'P2P transfer (default)';
    }
    
    return {
      topic: 'order.classified',
      eventId: event.eventId,
      intent,
      amount: event.amount,
      listingId: event.listingId,
      metadata: {
        fromRole: userRegistry?.get(event.from),
        toRole: userRegistry?.get(event.to),
        classificationReason
      },
      ts: new Date().toISOString()
    };
  }
  
  private isTreasuryDestination(to: string, registry?: Map<string, UserRole>): boolean {
    // Check if destination is treasury
    if (to.toLowerCase().includes('treasury')) return true;
    if (registry?.get(to) === 'treasury') return true;
    return false;
  }
  
  async processEvent(event: OrderValidated): Promise<void> {
    const classified = this.decide({
      event: {
        eventId: event.eventId,
        from: event.from,
        to: event.to,
        amount: event.amount
      },
      ts: new Date().toISOString()
    });
    
    await this.eventBus.publish(classified);
  }
}

// User roles for classification hints
export enum UserRole {
  TRADER = 'trader',
  MARKET_MAKER = 'market_maker',
  TREASURY = 'treasury',
  LIQUIDITY_PROVIDER = 'liquidity_provider',
  MATCH_ME = 'match_me',
  ADMIN = 'admin'
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Classifier Configuration",
  "type": "object",
  "required": ["service", "eventBus", "classification"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "classifier" },
        "port": { "type": "integer", "default": 8084 },
        "workers": { "type": "integer", "default": 4 }
      }
    },
    "eventBus": {
      "type": "object",
      "properties": {
        "subscribeTopics": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["order.validated"]
        },
        "publishTopic": {
          "type": "string",
          "default": "order.classified"
        }
      }
    },
    "classification": {
      "type": "object",
      "properties": {
        "rules": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "condition": { "type": "string" },
              "intent": { 
                "enum": ["BUY_TREASURY", "BUY_MARKET", "SELL_MARKET", "TRANSFER"] 
              },
              "priority": { "type": "integer" }
            }
          }
        },
        "treasuryIdentifiers": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["treasury", "usr-treasury-vault-system"]
        },
        "defaultIntent": {
          "type": "string",
          "default": "TRANSFER"
        }
      }
    },
    "monitoring": {
      "type": "object",
      "properties": {
        "metricsEnabled": { "type": "boolean", "default": true },
        "logLevel": { 
          "enum": ["debug", "info", "warn", "error"],
          "default": "info"
        }
      }
    }
  }
}`
};
