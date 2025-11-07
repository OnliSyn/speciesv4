// SpecCard: Validator Service
export const ValidatorSpecCard: NodeInspectorContent = {
  node: "Validator Service (v4.1)",
  
  role: "Verifies USDT payment proofs before any asset operation. Supports dual-path verification: 1) Processor path via NOWPayments API (preferred), 2) Direct chain verification via TronScan/Etherscan/BscScan. Also verifies match-time proofs and handles provider webhooks. Maintains circuit breaker pattern for external service resilience.",
  
  headers: "Internal service - no direct HTTP headers. Uses API keys for external provider calls.",
  
  logic: [
    "1) Receive validation request (admission or match-proof)",
    "2) Detect proof type: NOWPayments ID (npmt_*) or blockchain tx hash (64 hex chars)",
    "3) Check cache for recently verified proofs (10 min TTL)",
    "4) For NOWPayments: Call GET /payment/{id} with API key",
    "5) For direct chain: Query TronScan/Etherscan/BscScan based on chain",
    "6) Verify: status='finished', confirmations≥12, currency='USDT', amount within 0.1% tolerance",
    "7) Check timestamp freshness (max 60 minutes old)",
    "8) For admission: emit 'order.validated' on success or 'payment.failed' on failure",
    "9) For match-proof: emit 'payment.confirmed' with provider details",
    "10) Store verification result in cache and audit log",
    "11) Handle webhooks: verify signature → check status → emit 'payment.confirmed'",
    "12) Circuit breaker: open after 5 consecutive failures, retry after 60s"
  ],
  
  typescript: `// Interfaces
export type Chain = 'TRON' | 'ETH' | 'BSC';

export interface EventRequest {
  eventId: string;
  from: string;
  to: string;
  amount: number;
  payWith?: {
    currency: 'USDT';
    chain: Chain;
    proof?: string;
    feeProof?: string;
  };
  putProceeds?: {
    usdtAddress: string;
    chain: Chain;
  };
}

export interface MatchProofSubmission {
  eventId: string;
  matchId: string;
  amount: number;
  currency: 'USDT';
  chain: Chain;
  proof: string;
}

export interface VerificationResult {
  valid: boolean;
  paymentId: string;
  actualAmount: number;
  confirmations: number;
  network: Chain;
  provider: 'NOWPayments' | 'TRON' | 'ETH' | 'BSC';
  checks: {
    statusCheck: boolean;
    amountCheck: boolean;
    currencyCheck: boolean;
    confirmationCheck: boolean;
    timestampCheck: boolean;
  };
  timestamp: Date;
}

export interface OrderValidated {
  topic: 'order.validated';
  eventId: string;
  mode: 'BUY' | 'SELL' | 'TRANSFER';
  prepaid: true;
  evidence?: {
    proof?: string;
    feeProof?: string;
    provider: string;
    confirmations: number;
    amountUsdt: number;
  };
  ts: string;
}

export interface PaymentConfirmed {
  topic: 'payment.confirmed';
  eventId: string;
  matchId: string;
  amount: number;
  provider: 'NOWPayments' | 'TRON' | 'ETH' | 'BSC';
  providerPaymentId?: string;
  confirmations: number;
  ts: string;
}

export interface PaymentFailed {
  topic: 'payment.failed';
  eventId: string;
  reason: 
    | 'proof.missing'
    | 'proof.invalid_format'
    | 'insufficient.confirmations'
    | 'amount.mismatch'
    | 'payment.not_complete'
    | 'invalid.token'
    | 'timestamp.expired'
    | 'verification.error';
  details?: any;
  ts: string;
}

// Service implementation
export class ValidatorService {
  constructor(
    private nowPayments: NOWPaymentsClient,
    private tronVerifier: TronVerifier,
    private ethVerifier: EthereumVerifier,
    private bscVerifier: BSCVerifier,
    private cache: CacheService,
    private circuitBreaker: CircuitBreaker,
    private eventBus: EventBus
  ) {}
  
  async validatePaymentProof(req: EventRequest): Promise<OrderValidated | PaymentFailed> {
    // Implementation with dual-path verification
  }
  
  async verifyMatchProof(sub: MatchProofSubmission): Promise<PaymentConfirmed | PaymentFailed> {
    // Implementation for post-match verification
  }
  
  async handleWebhook(provider: string, payload: any, signature: string): Promise<void> {
    // Webhook processing with signature verification
  }
}

// Provider clients
export class NOWPaymentsClient {
  async verifyPayment(paymentId: string, expectedAmount: number): Promise<VerificationResult> {}
}

export class TronVerifier {
  async verifyTransaction(txHash: string, from: string, to: string, amount: number): Promise<VerificationResult> {}
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Validator Service Configuration",
  "type": "object",
  "required": ["service", "providers", "validation", "cache", "circuitBreaker"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "validator" },
        "port": { "type": "integer", "default": 8083 }
      }
    },
    "providers": {
      "type": "object",
      "properties": {
        "nowpayments": {
          "type": "object",
          "properties": {
            "apiUrl": { "type": "string", "default": "https://api.nowpayments.io/v1" },
            "apiKey": { "type": "string" },
            "apiSecret": { "type": "string" },
            "webhookSecret": { "type": "string" }
          }
        },
        "tron": {
          "type": "object",
          "properties": {
            "apiUrl": { "type": "string", "default": "https://api.trongrid.io" },
            "backupUrl": { "type": "string", "default": "https://api.tronscan.org" },
            "apiKey": { "type": "string" },
            "usdtContract": { "type": "string", "default": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }
          }
        },
        "ethereum": {
          "type": "object",
          "properties": {
            "apiUrl": { "type": "string" },
            "apiKey": { "type": "string" },
            "usdtContract": { "type": "string" }
          }
        },
        "bsc": {
          "type": "object",
          "properties": {
            "apiUrl": { "type": "string" },
            "apiKey": { "type": "string" },
            "usdtContract": { "type": "string" }
          }
        }
      }
    },
    "validation": {
      "type": "object",
      "properties": {
        "minConfirmations": { "type": "integer", "default": 12 },
        "maxPaymentAge": { "type": "integer", "default": 3600 },
        "amountTolerancePercent": { "type": "number", "default": 0.1 },
        "contractAccuracy": { "type": "boolean", "default": true },
        "timeout": { "type": "integer", "default": 30 }
      }
    },
    "cache": {
      "type": "object",
      "properties": {
        "ttl": { "type": "integer", "default": 600 },
        "keyPrefix": { "type": "string", "default": "payment:" }
      }
    },
    "circuitBreaker": {
      "type": "object",
      "properties": {
        "threshold": { "type": "integer", "default": 5 },
        "timeout": { "type": "integer", "default": 60 },
        "halfOpenRequests": { "type": "integer", "default": 3 }
      }
    }
  }
}`
};
