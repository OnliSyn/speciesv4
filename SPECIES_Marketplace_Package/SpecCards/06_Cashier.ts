// SpecCard: Cashier Service
export const CashierSpecCard: NodeInspectorContent = {
  node: "Cashier (v4.1)",
  
  role: "Payment session initiator (fallback path) and financial ledger poster. In prepaid mode, consumes 'payment.confirmed' from Validator and posts balanced journals in Firefly (Marketplace-owned accounting system). Maintains double-entry bookkeeping with complete audit trail. Includes payment_provider_id and network metadata in journal lines.",
  
  headers: "Internal service - event-driven, no direct HTTP headers.",
  
  logic: [
    "1) Consume 'payment.confirmed' or 'payment.requested' events",
    "2) For payment.requested: create payment session with provider (optional fallback)",
    "3) For payment.confirmed: prepare double-entry journal entries",
    "4) Map accounts: user USDT_cash, SPECIES_balance, fee_income, etc.",
    "5) Calculate fees: listing fee ($100), issuance fee ($0.01/SPECIES), liquidity (2%)",
    "6) Create balanced journal lines (total Dr = total Cr)",
    "7) Post to Firefly with idempotency key (eventId:matchId)",
    "8) Store posting reference in local database",
    "9) Emit 'ledger.posted' event with posting details",
    "10) Handle reconciliation for failed/reversed transactions",
    "11) Maintain running balances cache for quick queries",
    "12) Generate period-end closing entries if needed"
  ],
  
  typescript: `// Interfaces
export type Currency = 'USDT' | 'SPECIES';
export type AccountKind = 
  | 'USDT_cash'
  | 'USDT_settlement_payable'
  | 'USDT_fee_income'
  | 'SPECIES_balance'
  | 'SPECIES_inventory'
  | 'SPECIES_in_transit';

export interface PaymentConfirmed {
  topic: 'payment.confirmed';
  eventId: string;
  matchId: string;
  buyerId: string;
  sellerId: string;
  intent: 'BUY_TREASURY' | 'BUY_MARKET' | 'SELL_MARKET' | 'TRANSFER';
  amount: number;       // SPECIES amount
  usdtAmount: number;   // USDT amount
  feeUsdt?: number;     // Fee amount
  provider: string;
  providerPaymentId?: string;
  confirmations: number;
  ts: string;
}

export interface JournalLine {
  account: {
    onliId: string | 'treasury' | 'marketplace' | 'assurance';
    kind: AccountKind;
  };
  currency: Currency;
  amount: number;
  side: 'Dr' | 'Cr';
  memo?: string;
  meta?: {
    provider?: string;
    paymentId?: string;
    network?: string;
    confirmations?: number;
  };
}

export interface JournalPost {
  postingId: string;    // UUID for this posting
  eventId: string;
  matchId: string;
  lines: JournalLine[];
  postedAt: Date;
  description: string;
  metadata?: Record<string, any>;
}

export interface LedgerPosted {
  topic: 'ledger.posted';
  eventId: string;
  matchId: string;
  postingId: string;
  accountsAffected: string[];
  totalDebit: number;
  totalCredit: number;
  ts: string;
}

// Firefly integration
export interface FireflyTransaction {
  type: 'withdrawal' | 'deposit' | 'transfer';
  date: string;
  amount: string;
  description: string;
  source_id: number;
  destination_id: number;
  category_id?: number;
  budget_id?: number;
  tags?: string[];
  notes?: string;
  external_id: string;  // eventId:matchId
}

// Service implementation
export class CashierService {
  constructor(
    private firefly: FireflyClient,
    private feeModule: FeeModule,
    private cache: CacheService,
    private eventBus: EventBus,
    private db: Database
  ) {}
  
  async processPaymentConfirmed(event: PaymentConfirmed): Promise<void> {
    // Check idempotency
    const key = \`\${event.eventId}:\${event.matchId}\`;
    if (await this.isAlreadyPosted(key)) {
      return;
    }
    
    // Create journal entries
    const journal = await this.createJournalEntries(event);
    
    // Validate balanced
    this.validateBalanced(journal);
    
    // Post to Firefly
    const postingId = await this.postToFirefly(journal);
    
    // Store reference
    await this.storePostingReference(key, postingId);
    
    // Update balance cache
    await this.updateBalanceCache(journal);
    
    // Emit event
    await this.eventBus.publish({
      topic: 'ledger.posted',
      eventId: event.eventId,
      matchId: event.matchId,
      postingId,
      accountsAffected: this.getAffectedAccounts(journal),
      totalDebit: this.sumDebits(journal),
      totalCredit: this.sumCredits(journal),
      ts: new Date().toISOString()
    });
  }
  
  private createJournalEntries(event: PaymentConfirmed): JournalPost {
    const lines: JournalLine[] = [];
    
    switch (event.intent) {
      case 'BUY_TREASURY':
        // Dr: Buyer SPECIES_balance
        lines.push({
          account: { onliId: event.buyerId, kind: 'SPECIES_balance' },
          currency: 'SPECIES',
          amount: event.amount,
          side: 'Dr'
        });
        // Cr: Treasury SPECIES_inventory
        lines.push({
          account: { onliId: 'treasury', kind: 'SPECIES_inventory' },
          currency: 'SPECIES',
          amount: event.amount,
          side: 'Cr'
        });
        // Dr: Assurance USDT_cash
        lines.push({
          account: { onliId: 'assurance', kind: 'USDT_cash' },
          currency: 'USDT',
          amount: event.usdtAmount,
          side: 'Dr'
        });
        // Cr: Buyer USDT_cash
        lines.push({
          account: { onliId: event.buyerId, kind: 'USDT_cash' },
          currency: 'USDT',
          amount: event.usdtAmount,
          side: 'Cr'
        });
        break;
      // ... other intents
    }
    
    return {
      postingId: generateUUID(),
      eventId: event.eventId,
      matchId: event.matchId,
      lines,
      postedAt: new Date(),
      description: \`\${event.intent} - \${event.amount} SPECIES\`
    };
  }
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Cashier Service Configuration",
  "type": "object",
  "required": ["service", "firefly", "fees", "accounts", "cache"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "cashier" },
        "port": { "type": "integer", "default": 8086 }
      }
    },
    "firefly": {
      "type": "object",
      "properties": {
        "baseUrl": { "type": "string" },
        "apiToken": { "type": "string" },
        "defaultCurrency": { "type": "string", "default": "USD" },
        "schema": { "type": "string", "default": "species" }
      }
    },
    "fees": {
      "type": "object",
      "properties": {
        "listing": {
          "type": "object",
          "properties": {
            "amount": { "type": "number", "default": 100.00 },
            "currency": { "const": "USDT" },
            "threshold": { "type": "integer", "default": 5000 }
          }
        },
        "issuance": {
          "type": "object",
          "properties": {
            "perSpecies": { "type": "number", "default": 0.01 },
            "currency": { "const": "USDT" }
          }
        },
        "liquidity": {
          "type": "object",
          "properties": {
            "percentage": { "type": "number", "default": 2.0 }
          }
        }
      }
    },
    "accounts": {
      "type": "object",
      "properties": {
        "chartOfAccounts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "code": { "type": "string" },
              "name": { "type": "string" },
              "type": { "enum": ["asset", "liability", "equity", "revenue", "expense"] },
              "currency": { "enum": ["USDT", "SPECIES", "BOTH"] }
            }
          }
        },
        "systemAccounts": {
          "type": "object",
          "properties": {
            "treasury": { "type": "string", "default": "usr-treasury-vault-system" },
            "marketplace": { "type": "string", "default": "marketplace-fees" },
            "assurance": { "type": "string", "default": "assurance-fund" }
          }
        }
      }
    },
    "cache": {
      "type": "object",
      "properties": {
        "balances": {
          "type": "object",
          "properties": {
            "ttl": { "type": "integer", "default": 60 },
            "keyPrefix": { "type": "string", "default": "balance:" }
          }
        },
        "postings": {
          "type": "object",
          "properties": {
            "ttl": { "type": "integer", "default": 3600 },
            "keyPrefix": { "type": "string", "default": "posting:" }
          }
        }
      }
    }
  }
}`
};
