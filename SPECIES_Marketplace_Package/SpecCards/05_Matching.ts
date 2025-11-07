// SpecCard: Matching Service
export const MatchingSpecCard: NodeInspectorContent = {
  node: "Matching Service (v4.1)",
  
  role: "Counterparty resolver that consumes 'order.classified' and produces tentative fills with both parties' vault references resolved from Marketplace User Registry. Manages order matching for treasury operations, market listings, and P2P transfers. Emits 'order.matched' and 'payment.requested' events.",
  
  headers: "Internal service - event-driven only, no direct HTTP headers.",
  
  logic: [
    "1) Consume 'order.classified' event from event bus",
    "2) Load buyer and seller profiles from Marketplace User Registry (cache-first)",
    "3) For BUY_TREASURY: allocate from treasury pool, create single fill",
    "4) For BUY_MARKET: find listing by ID, check availability, reserve amount",
    "5) For SELL_MARKET: create new listing record with 48-hour expiration",
    "6) For TRANSFER: create direct P2P fill without counterparty matching",
    "7) Resolve vault IDs for both parties from registry",
    "8) Check if buyer requires payment proof (not prepaid)",
    "9) Create Fill record(s) with unique matchId per fill",
    "10) Store match reservations in database with expiration",
    "11) Emit 'order.matched' with fill details",
    "12) If buyer proof required, emit 'payment.requested'"
  ],
  
  typescript: `// Interfaces
export type Intent = 'BUY_TREASURY' | 'BUY_MARKET' | 'SELL_MARKET' | 'TRANSFER';

export interface OrderClassified {
  topic: 'order.classified';
  eventId: string;
  intent: Intent;
  amount: number;
  listingId?: string;
  from: string;
  to: string;
  ts: string;
}

export interface Fill {
  matchId: string;           // Unique ID for this fill
  eventId: string;           // Parent event ID
  buyerId: string;           // Buyer's onliId
  buyerVault?: string;       // Buyer's vault ID
  sellerId: string;          // Seller's onliId
  sellerVault?: string;      // Seller's vault ID
  fillAmount: number;        // Amount being filled
  listingId?: string;        // Associated listing (if market)
  requiresBuyerProof: boolean;
  status: 'PENDING' | 'RESERVED' | 'CONFIRMED' | 'EXPIRED';
  createdAt: Date;
  expiresAt: Date;
}

export interface OrderMatched {
  topic: 'order.matched';
  eventId: string;
  intent: Intent;
  fills: Fill[];
  totalAmount: number;
  metadata?: {
    listingId?: string;
    treasuryOperation?: boolean;
  };
  ts: string;
}

export interface PaymentRequested {
  topic: 'payment.requested';
  eventId: string;
  matchId: string;
  buyerId: string;
  amount: number;
  paymentDeadline: string;
  ts: string;
}

export interface Listing {
  listingId: string;
  askToMoveId?: string;
  sellerId: string;
  amount: number;
  priceUsdt: number;
  availableAmount: number;
  status: 'ACTIVE' | 'PARTIALLY_FILLED' | 'FILLED' | 'EXPIRED' | 'CANCELLED';
  createdAt: Date;
  expiresAt: Date;
}

// Service implementation
export class MatchingService {
  constructor(
    private registry: MarketplaceUserRegistry,
    private db: Database,
    private eventBus: EventBus,
    private cache: CacheService
  ) {}
  
  async processClassifiedOrder(event: OrderClassified): Promise<void> {
    const fills = await this.createFills(event);
    
    if (fills.length === 0) {
      throw new Error(\`No fills created for \${event.eventId}\`);
    }
    
    // Store reservations
    await this.storeMatchReservations(fills);
    
    // Emit matched event
    await this.eventBus.publish({
      topic: 'order.matched',
      eventId: event.eventId,
      intent: event.intent,
      fills,
      totalAmount: fills.reduce((sum, f) => sum + f.fillAmount, 0),
      ts: new Date().toISOString()
    });
    
    // Emit payment requests if needed
    for (const fill of fills) {
      if (fill.requiresBuyerProof) {
        await this.eventBus.publish({
          topic: 'payment.requested',
          eventId: event.eventId,
          matchId: fill.matchId,
          buyerId: fill.buyerId,
          amount: fill.fillAmount,
          paymentDeadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          ts: new Date().toISOString()
        });
      }
    }
  }
  
  private async createFills(event: OrderClassified): Promise<Fill[]> {
    switch (event.intent) {
      case 'BUY_TREASURY':
        return this.createTreasuryFill(event);
      case 'BUY_MARKET':
        return this.createMarketFills(event);
      case 'SELL_MARKET':
        return this.createListing(event);
      case 'TRANSFER':
        return this.createTransferFill(event);
    }
  }
  
  private async createTreasuryFill(event: OrderClassified): Promise<Fill[]> {
    const buyer = await this.registry.getUser(event.from);
    return [{
      matchId: generateUUID(),
      eventId: event.eventId,
      buyerId: buyer.onliId,
      buyerVault: buyer.vaultId,
      sellerId: 'usr-treasury-vault-system',
      sellerVault: 'treasury-vault',
      fillAmount: event.amount,
      requiresBuyerProof: false, // Assumes prepaid
      status: 'RESERVED',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }];
  }
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Matching Service Configuration",
  "type": "object",
  "required": ["service", "matching", "listings", "reservations"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "matching" },
        "port": { "type": "integer", "default": 8085 },
        "workers": { "type": "integer", "default": 4 }
      }
    },
    "matching": {
      "type": "object",
      "properties": {
        "algorithm": {
          "enum": ["FIFO", "PRICE_TIME", "PRO_RATA"],
          "default": "FIFO"
        },
        "minOrderSize": { "type": "integer", "default": 1 },
        "maxOrderSize": { "type": "integer", "default": 1000000 },
        "allowPartialFills": { "type": "boolean", "default": true }
      }
    },
    "listings": {
      "type": "object",
      "properties": {
        "defaultDuration": { "type": "integer", "default": 172800 },
        "maxDuration": { "type": "integer", "default": 604800 },
        "minAmount": { "type": "integer", "default": 5000 },
        "listingFee": { "type": "number", "default": 100.00 }
      }
    },
    "reservations": {
      "type": "object",
      "properties": {
        "defaultTTL": { "type": "integer", "default": 300 },
        "maxReservations": { "type": "integer", "default": 1000 },
        "cleanupInterval": { "type": "integer", "default": 60 }
      }
    },
    "treasury": {
      "type": "object",
      "properties": {
        "userId": { "type": "string", "default": "usr-treasury-vault-system" },
        "vaultId": { "type": "string", "default": "treasury-vault" },
        "unlimitedSupply": { "type": "boolean", "default": true }
      }
    },
    "eventBus": {
      "type": "object",
      "properties": {
        "subscribeTopics": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["order.classified"]
        },
        "publishTopics": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["order.matched", "payment.requested"]
        }
      }
    }
  }
}`
};
