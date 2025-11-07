// SpecCard: Floor Manager Service
export const FloorManagerSpecCard: NodeInspectorContent = {
  node: "Floor Manager (v4.1)",
  
  role: "Final reconciler and receipt composer. On 'ownership.changed', verifies with Onli Cloud Oracle, finalizes ledgers in Firefly (Marketplace-owned), composes the canonical eventReceipt, and emits 'order.completed'. Floor Manager is read/write on ledgers but read-only to Onli Cloud (verify only).",
  
  headers: "Internal service. Oracle calls use: X-API-Key, X-API-Secret, X-Request-Id",
  
  logic: [
    "1) Consume 'ownership.changed' events from Asset Manager",
    "2) Call Onli Cloud Oracle to verify asset receipt (RevealGenomes RPC)",
    "3) Verify current ownership matches expected state",
    "4) If Oracle verification fails, emit 'reconcile.failed' and investigate",
    "5) For successful verification, prepare final ledger entries",
    "6) Post settlement/realization entries to Firefly",
    "7) For TRANSFER: post SPECIES-only journal entries",
    "8) Compose canonical eventReceipt with all transaction details",
    "9) Store eventReceipt in database for retrieval API",
    "10) Update all caches with final state",
    "11) Emit 'order.completed' event",
    "12) Trigger cleanup of temporary reservations and locks"
  ],
  
  typescript: `// Interfaces
export interface OwnershipChanged {
  topic: 'ownership.changed';
  eventId: string;
  matchId: string;
  assetReceiptId: string;
  operation: 'Issue' | 'ChangeOwner';
  from?: string;
  to: string;
  amount: number;
  ts: string;
}

export interface OrderCompleted {
  topic: 'order.completed';
  eventId: string;
  status: 'COMPLETED';
  receipt: EventReceipt;
  ts: string;
}

export interface ReconcileFailed {
  topic: 'reconcile.failed';
  eventId: string;
  matchId: string;
  reason: 
    | 'oracle.verification_failed'
    | 'ownership.mismatch'
    | 'amount.mismatch'
    | 'ledger.imbalance'
    | 'receipt.generation_failed';
  expected: any;
  actual: any;
  ts: string;
}

export interface EventReceipt {
  eventId: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
  intent: 'BUY_TREASURY' | 'BUY_MARKET' | 'SELL_MARKET' | 'TRANSFER';
  from: {
    onliId: string;
    vaultId?: string;
    startBalance?: number;
    endBalance?: number;
  };
  to: {
    onliId: string;
    vaultId?: string;
    startBalance?: number;
    endBalance?: number;
  };
  amount: number;
  fills: Array<{
    matchId: string;
    buyerId: string;
    sellerId: string;
    fillAmount: number;
    status: string;
  }>;
  payments: Array<{
    provider: string;
    paymentId?: string;
    amount: number;
    confirmations: number;
    verifiedAt: string;
  }>;
  assetReceipts: Array<{
    receiptId: string;
    operation: string;
    verifiedAt: string;
  }>;
  ledgerPostings: Array<{
    postingId: string;
    postedAt: string;
    description: string;
  }>;
  timestamps: {
    received: string;
    authenticated?: string;
    validated?: string;
    classified?: string;
    matched?: string;
    paymentConfirmed?: string;
    assetDelivered?: string;
    completed: string;
  };
  fees: {
    listing?: number;
    issuance?: number;
    liquidity?: number;
    total: number;
  };
  oracleVerification?: {
    verifiedAt: string;
    helixRecords: number;
    currentOwner: string;
  };
}

// Oracle verification
export interface OracleVerifyRequest {
  who: string;           // Owner to verify
  search_condition?: string;
  search_keyword?: string;
  limit?: string;
  offset?: string;
}

export interface OracleHelix {
  which_onli: string;
  what_kind: string;
  what_type: string;
  what_face: string;
  current_owner_id: string;
  current_owner_name: string;
  last_updated: string;
  blacklisted: boolean;
}

// Service implementation
export class FloorManager {
  constructor(
    private onliCloud: OnliCloudClient,
    private firefly: FireflyClient,
    private db: Database,
    private eventBus: EventBus,
    private cache: CacheService
  ) {}
  
  async processOwnershipChanged(event: OwnershipChanged): Promise<void> {
    try {
      // Verify with Oracle
      const oracleResult = await this.verifyWithOracle(
        event.to,
        event.assetReceiptId
      );
      
      if (!oracleResult.verified) {
        throw new Error(\`Oracle verification failed: \${oracleResult.reason}\`);
      }
      
      // Finalize ledgers
      await this.finalizeLedgers(event);
      
      // Compose receipt
      const receipt = await this.composeEventReceipt(event.eventId);
      
      // Store receipt
      await this.storeReceipt(receipt);
      
      // Clear caches and reservations
      await this.cleanup(event.eventId);
      
      // Emit completion
      await this.eventBus.publish({
        topic: 'order.completed',
        eventId: event.eventId,
        status: 'COMPLETED',
        receipt,
        ts: new Date().toISOString()
      });
      
    } catch (error) {
      await this.handleReconciliationFailure(event, error);
    }
  }
  
  private async verifyWithOracle(owner: string, receiptId: string) {
    const response = await this.onliCloud.revealGenomes({
      who: owner,
      limit: '1000',
      sort_by: 'last_updated',
      sort_order: 'DESC'
    });
    
    // Verify ownership in oracle matches expected
    const verified = response.OracleHelices.some(
      helix => helix.current_owner_id === owner
    );
    
    return {
      verified,
      helixCount: response.OracleHelices.length,
      reason: verified ? null : 'Owner not found in oracle'
    };
  }
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Floor Manager Configuration",
  "type": "object",
  "required": ["service", "oracle", "firefly", "reconciliation"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "floor-manager" },
        "port": { "type": "integer", "default": 8088 }
      }
    },
    "oracle": {
      "type": "object",
      "properties": {
        "verifyEnabled": { "type": "boolean", "default": true },
        "timeout": { "type": "integer", "default": 30 },
        "retryAttempts": { "type": "integer", "default": 3 },
        "cacheResults": { "type": "boolean", "default": true },
        "cacheTTL": { "type": "integer", "default": 300 }
      }
    },
    "firefly": {
      "type": "object",
      "properties": {
        "finalizeEnabled": { "type": "boolean", "default": true },
        "journalPrefix": { "type": "string", "default": "FINAL-" }
      }
    },
    "reconciliation": {
      "type": "object",
      "properties": {
        "tolerances": {
          "type": "object",
          "properties": {
            "amount": { "type": "number", "default": 0.01 },
            "timing": { "type": "integer", "default": 60 }
          }
        },
        "failureHandling": {
          "type": "object",
          "properties": {
            "maxRetries": { "type": "integer", "default": 3 },
            "alertOnFailure": { "type": "boolean", "default": true },
            "deadLetterQueue": { "type": "boolean", "default": true }
          }
        }
      }
    },
    "receipt": {
      "type": "object",
      "properties": {
        "includeDebugInfo": { "type": "boolean", "default": false },
        "compressLargeReceipts": { "type": "boolean", "default": true },
        "storageLocation": { "enum": ["database", "s3"], "default": "database" }
      }
    },
    "cleanup": {
      "type": "object",
      "properties": {
        "clearReservations": { "type": "boolean", "default": true },
        "clearCaches": { "type": "boolean", "default": true },
        "archiveData": { "type": "boolean", "default": false }
      }
    },
    "eventBus": {
      "type": "object",
      "properties": {
        "subscribeTopics": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["ownership.changed"]
        },
        "publishTopics": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["order.completed", "reconcile.failed"]
        }
      }
    }
  }
}`
};
