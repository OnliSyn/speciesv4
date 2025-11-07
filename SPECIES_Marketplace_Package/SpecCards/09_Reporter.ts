// SpecCard: Reporter Service
export const ReporterSpecCard: NodeInspectorContent = {
  node: "Reporter (v4.1)",
  
  role: "Read-only projections backed by Firefly and Floor Manager receipts. Produces developer receipts, user statements, and admin market analytics. Includes payment provider metrics from Validator events. Serves HMAC-protected APIs for sensitive data retrieval.",
  
  headers: [
    { key: "X-API-Key", value: "<api_key>", comment: "Required for all endpoints" },
    { key: "X-Request-Signature", value: "<hmac>", comment: "Required for admin endpoints" }
  ],
  
  logic: [
    "1) Subscribe to 'order.completed' and 'ledger.posted' events",
    "2) Build materialized views for fast querying",
    "3) Maintain denormalized read models for receipts and statements",
    "4) For receipt requests: retrieve from cache or database",
    "5) For statements: aggregate journal entries from Firefly",
    "6) Apply pagination with cursor-based navigation",
    "7) For market overview: calculate aggregate metrics",
    "8) For circulation reports: sum treasury and user balances",
    "9) Cache frequently accessed data with appropriate TTLs",
    "10) Export data in multiple formats (JSON, CSV, PDF)",
    "11) Implement data retention policies (7 years financial)",
    "12) Provide audit trail exports for compliance"
  ],
  
  typescript: `// Interfaces
export interface ReceiptDoc {
  eventId: string;
  blob: EventReceipt;
  completedAt: string;
  version: string;
}

export interface UserStatement {
  onliId: string;
  period: {
    from: string;
    to: string;
  };
  currency: 'SPECIES' | 'USDT';
  openingBalance: number;
  closingBalance: number;
  entries: Array<{
    date: string;
    type: string;
    description: string;
    debit?: number;
    credit?: number;
    balance: number;
    reference: string;
  }>;
  totals: {
    totalDebits: number;
    totalCredits: number;
    netChange: number;
    transactionCount: number;
  };
  nextCursor?: string;
}

export interface MarketOverview {
  period: {
    from: string;
    to: string;
  };
  metrics: {
    volumeSpecies: number;
    volumeUsdt: number;
    transactionCount: number;
    uniqueUsers: number;
    averageTransactionSize: number;
    feeIncomeUsdt: number;
  };
  breakdown: {
    byIntent: Record<string, number>;
    byNetwork: Record<string, number>;
    byHour: Array<{ hour: string; volume: number }>;
  };
  topUsers: Array<{
    onliId: string;
    volume: number;
    transactionCount: number;
  }>;
}

export interface CirculationReport {
  asOf: string;
  supply: {
    totalIssued: number;
    inTreasury: number;
    inCirculation: number;
    inLockers: number;
  };
  holders: {
    total: number;
    active: number;
    distribution: Array<{
      range: string;
      count: number;
      percentage: number;
    }>;
  };
  velocity: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

export interface AdminDashboard {
  realtime: {
    activeUsers: number;
    pendingTransactions: number;
    last24hVolume: number;
    systemHealth: 'healthy' | 'degraded' | 'critical';
  };
  alerts: Array<{
    level: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: string;
  }>;
}

// Service implementation
export class ReporterService {
  constructor(
    private firefly: FireflyClient,
    private db: Database,
    private cache: CacheService,
    private exportService: ExportService
  ) {}
  
  // Public endpoints
  async getReceipt(eventId: string): Promise<ReceiptDoc> {
    // Check cache first
    const cached = await this.cache.get(\`receipt:\${eventId}\`);
    if (cached) return cached;
    
    // Fetch from database
    const receipt = await this.db.getReceipt(eventId);
    if (!receipt) throw new NotFoundError('Receipt not found');
    
    // Cache for future requests
    await this.cache.set(\`receipt:\${eventId}\`, receipt, 3600);
    
    return receipt;
  }
  
  async getUserStatement(
    onliId: string, 
    params: StatementParams
  ): Promise<UserStatement> {
    // Aggregate from Firefly
    const entries = await this.firefly.getTransactions({
      account: onliId,
      from: params.from,
      to: params.to,
      limit: params.limit || 100
    });
    
    // Calculate balances
    const statement = this.buildStatement(onliId, entries, params);
    
    return statement;
  }
  
  // Admin endpoints (HMAC protected)
  async getMarketOverview(params: OverviewParams): Promise<MarketOverview> {
    // Aggregate metrics from multiple sources
    const [transactions, users, fees] = await Promise.all([
      this.aggregateTransactions(params),
      this.aggregateUsers(params),
      this.aggregateFees(params)
    ]);
    
    return this.buildMarketOverview(transactions, users, fees);
  }
  
  async getCirculation(asOf?: string): Promise<CirculationReport> {
    const timestamp = asOf || new Date().toISOString();
    
    // Query all balances
    const balances = await this.firefly.getBalances(timestamp);
    
    // Build circulation metrics
    return this.calculateCirculation(balances, timestamp);
  }
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Reporter Service Configuration",
  "type": "object",
  "required": ["service", "firefly", "reports", "cache", "export"],
  "properties": {
    "service": {
      "type": "object",
      "properties": {
        "name": { "const": "reporter" },
        "port": { "type": "integer", "default": 8089 }
      }
    },
    "firefly": {
      "type": "object",
      "properties": {
        "baseUrl": { "type": "string" },
        "apiToken": { "type": "string" },
        "readOnly": { "type": "boolean", "default": true }
      }
    },
    "reports": {
      "type": "object",
      "properties": {
        "defaultLimit": { "type": "integer", "default": 100 },
        "maxLimit": { "type": "integer", "default": 1000 },
        "aggregationInterval": { "type": "integer", "default": 3600 },
        "retentionDays": { "type": "integer", "default": 2555 }
      }
    },
    "cache": {
      "type": "object",
      "properties": {
        "receipts": {
          "type": "object",
          "properties": {
            "ttl": { "type": "integer", "default": 3600 },
            "maxSize": { "type": "integer", "default": 10000 }
          }
        },
        "statements": {
          "type": "object",
          "properties": {
            "ttl": { "type": "integer", "default": 300 },
            "maxSize": { "type": "integer", "default": 1000 }
          }
        },
        "overview": {
          "type": "object",
          "properties": {
            "ttl": { "type": "integer", "default": 60 },
            "maxSize": { "type": "integer", "default": 100 }
          }
        }
      }
    },
    "export": {
      "type": "object",
      "properties": {
        "formats": {
          "type": "array",
          "items": { "enum": ["json", "csv", "pdf", "xlsx"] },
          "default": ["json", "csv"]
        },
        "compression": { "type": "boolean", "default": true },
        "signedUrls": { "type": "boolean", "default": true },
        "urlExpiry": { "type": "integer", "default": 3600 }
      }
    },
    "endpoints": {
      "type": "object",
      "properties": {
        "public": [
          "/reports/receipts/:eventId",
          "/reports/user/:onliId/statement"
        ],
        "admin": [
          "/reports/admin/market/overview",
          "/reports/admin/circulation",
          "/reports/admin/users/activity",
          "/reports/admin/treasury/balance",
          "/reports/admin/audit/trail"
        ]
      }
    }
  }
}`
};
