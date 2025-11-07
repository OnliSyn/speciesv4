// SpecCard: Configuration Module Service
export const ConfigurationModuleSpecCard: NodeInspectorContent = {
  node: "Configuration Module (v4.1)",
  
  role: "Canonical runtime configuration for the SPECIES Marketplace Appliance. Provides fee policies, payment provider and network rules, Onli Cloud endpoints, and the Marketplace User Registry sync from Species_ProfileTray. Manages environment-specific settings with override capabilities. Firefly is the accounting backend inside the Marketplace.",
  
  headers: "Internal service - configuration API uses basic auth for admin access",
  
  logic: [
    "1) Load base configuration from files (YAML/JSON)",
    "2) Apply environment variable overrides",
    "3) Fetch dynamic configuration from database if enabled",
    "4) Sync user registry from ProfileTray on schedule (every 5 minutes)",
    "5) Calculate fee amounts based on transaction type and amount",
    "6) Provide fee routing destinations (treasury, operator, market maker)",
    "7) Monitor configuration changes and trigger reloads",
    "8) Expose configuration version for audit purposes",
    "9) Validate configuration changes before applying",
    "10) Maintain configuration history for rollback",
    "11) Export configuration for disaster recovery",
    "12) Provide health check including dependency status"
  ],
  
  typescript: `// Interfaces
export interface AppConfig {
  appSymbol: 'SPECIES';
  masterId: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  
  profileTray: {
    baseUrl: string;
    apiKey: string;
    appKey: string;
    syncInterval: number;  // seconds
    pageSize: number;
    retryPolicy: RetryConfig;
  };
  
  payments: {
    providers: {
      nowpayments: {
        enabled: boolean;
        apiUrl: string;
        apiKey: string;
        secret: string;
        webhookSecret: string;
      };
      tron: {
        enabled: boolean;
        apiUrl: string;
        apiKey: string;
        usdtContract: string;
      };
      ethereum: {
        enabled: boolean;
        apiUrl: string;
        apiKey: string;
        usdtContract: string;
      };
      bsc: {
        enabled: boolean;
        apiUrl: string;
        apiKey: string;
        usdtContract: string;
      };
    };
    validation: {
      minConfirmations: number;
      maxPaymentAge: number;
      tolerancePercent: number;
      timeoutSeconds: number;
    };
  };
  
  onliCloud: {
    baseUrl: string;
    apiKey: string;
    apiSecret: string;
    masterId: string;
    appSymbol: string;
    timeout: number;
  };
  
  fees: FeeConfiguration;
  
  accounting: {
    fireflyDsn: string;
    schema: string;
    journalPrefix: string;
    retentionDays: number;
  };
  
  userSync: {
    enabled: boolean;
    cron: string;
    webhook: boolean;
    pageSize: number;
    fullSyncInterval: number;  // hours
  };
  
  systemUsers: SystemUsers;
}

export interface FeeConfiguration {
  listing: {
    flatUsdt: number;        // $100
    thresholdSpecies: number; // 5000 minimum
  };
  issuance: {
    perSpeciesUsdt: number;  // $0.01
  };
  liquidity: {
    percentageRate: number;  // 2%
  };
  destinations: {
    treasury: string;        // Treasury user ID
    operator: string;        // Operator user ID
    marketMaker: string;     // Market Maker user ID
    assurance: string;       // Assurance fund ID
  };
}

export interface SystemUsers {
  treasury: {
    onliId: string;
    vaultId: string;
    role: 'treasury';
  };
  operator: {
    onliId: string;
    vaultId: string;
    role: 'operator';
  };
  marketMaker: {
    onliId: string;
    vaultId: string;
    role: 'market_maker';
  };
  assurance: {
    onliId: string;
    vaultId: string;
    role: 'assurance';
  };
  matchMe: {
    onliId: string;
    vaultId: string;
    role: 'match_me';
  };
}

export interface FeeModule {
  calculateAdmissionFee(intent: string, amount: number): FeeBreakdown;
  calculateMatchFee(intent: string, amount: number): FeeBreakdown;
  mapDestinations(fees: FeeBreakdown): FeeDestination[];
}

export interface FeeBreakdown {
  listingFee?: number;
  issuanceFee?: number;
  liquidityFee?: number;
  total: number;
  currency: 'USDT';
}

export interface FeeDestination {
  account: string;
  amount: number;
  type: 'listing' | 'issuance' | 'liquidity';
}

// Service implementation
export class ConfigurationModule {
  private config: AppConfig;
  private feeModule: FeeModule;
  
  constructor(
    private db: Database,
    private profileTray: ProfileTrayClient,
    private cache: CacheService
  ) {
    this.loadConfiguration();
    this.initializeFeeModule();
    this.startSyncSchedule();
  }
  
  async loadConfiguration(): Promise<void> {
    // Load base config
    const baseConfig = await this.loadBaseConfig();
    
    // Apply environment overrides
    const envConfig = this.loadEnvironmentOverrides();
    
    // Merge configurations
    this.config = this.mergeConfigs(baseConfig, envConfig);
    
    // Validate
    this.validateConfiguration(this.config);
    
    // Store version
    await this.storeConfigVersion();
  }
  
  async syncUserRegistry(): Promise<void> {
    try {
      const users = await this.profileTray.listUsers({
        appSymbol: this.config.appSymbol,
        limit: this.config.userSync.pageSize
      });
      
      // Update local registry
      for (const user of users) {
        await this.updateMarketplaceUser(user);
      }
      
      // Update sync timestamp
      await this.updateSyncStatus('success');
      
    } catch (error) {
      await this.updateSyncStatus('failed', error);
      throw error;
    }
  }
  
  calculateFees(transaction: any): FeeBreakdown {
    return this.feeModule.calculateMatchFee(
      transaction.intent,
      transaction.amount
    );
  }
  
  getSystemUser(role: string): SystemUsers[keyof SystemUsers] {
    return this.config.systemUsers[role];
  }
}

// Fee calculation implementation
export class FeeCalculator implements FeeModule {
  constructor(private config: FeeConfiguration) {}
  
  calculateAdmissionFee(intent: string, amount: number): FeeBreakdown {
    const fees: FeeBreakdown = {
      total: 0,
      currency: 'USDT'
    };
    
    if (intent === 'SELL_MARKET' && amount >= this.config.listing.thresholdSpecies) {
      fees.listingFee = this.config.listing.flatUsdt;
      fees.total += fees.listingFee;
    }
    
    if (intent === 'BUY_TREASURY') {
      fees.issuanceFee = amount * this.config.issuance.perSpeciesUsdt;
      fees.total += fees.issuanceFee;
    }
    
    return fees;
  }
  
  calculateMatchFee(intent: string, amount: number): FeeBreakdown {
    const fees = this.calculateAdmissionFee(intent, amount);
    
    if (intent === 'BUY_LIQUIDITY' || intent === 'SELL_LIQUIDITY') {
      fees.liquidityFee = amount * (this.config.liquidity.percentageRate / 100);
      fees.total += fees.liquidityFee;
    }
    
    return fees;
  }
  
  mapDestinations(fees: FeeBreakdown): FeeDestination[] {
    const destinations: FeeDestination[] = [];
    
    if (fees.listingFee) {
      destinations.push({
        account: this.config.destinations.operator,
        amount: fees.listingFee,
        type: 'listing'
      });
    }
    
    if (fees.issuanceFee) {
      destinations.push({
        account: this.config.destinations.treasury,
        amount: fees.issuanceFee,
        type: 'issuance'
      });
    }
    
    if (fees.liquidityFee) {
      destinations.push({
        account: this.config.destinations.marketMaker,
        amount: fees.liquidityFee,
        type: 'liquidity'
      });
    }
    
    return destinations;
  }
}`,

  json: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Configuration Module Schema",
  "type": "object",
  "required": ["appConfig", "feeConfig", "systemUsers", "sync"],
  "properties": {
    "appConfig": {
      "type": "object",
      "properties": {
        "appSymbol": { "const": "SPECIES" },
        "masterId": { "type": "string" },
        "version": { "type": "string", "pattern": "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+$" },
        "environment": { "enum": ["development", "staging", "production"] }
      }
    },
    "feeConfig": {
      "type": "object",
      "properties": {
        "listing": {
          "type": "object",
          "properties": {
            "flatUsdt": { "type": "number", "default": 100.00 },
            "thresholdSpecies": { "type": "integer", "default": 5000 }
          }
        },
        "issuance": {
          "type": "object",
          "properties": {
            "perSpeciesUsdt": { "type": "number", "default": 0.01 }
          }
        },
        "liquidity": {
          "type": "object",
          "properties": {
            "percentageRate": { "type": "number", "default": 2.0 }
          }
        }
      }
    },
    "systemUsers": {
      "type": "object",
      "required": ["treasury", "operator", "marketMaker", "assurance", "matchMe"],
      "properties": {
        "treasury": {
          "type": "object",
          "properties": {
            "onliId": { "type": "string", "default": "usr-treasury-vault-system" },
            "vaultId": { "type": "string" },
            "role": { "const": "treasury" }
          }
        },
        "operator": {
          "type": "object",
          "properties": {
            "onliId": { "type": "string" },
            "vaultId": { "type": "string" },
            "role": { "const": "operator" }
          }
        },
        "marketMaker": {
          "type": "object",
          "properties": {
            "onliId": { "type": "string" },
            "vaultId": { "type": "string" },
            "role": { "const": "market_maker" }
          }
        },
        "assurance": {
          "type": "object",
          "properties": {
            "onliId": { "type": "string" },
            "vaultId": { "type": "string" },
            "role": { "const": "assurance" }
          }
        },
        "matchMe": {
          "type": "object",
          "properties": {
            "onliId": { "type": "string" },
            "vaultId": { "type": "string" },
            "role": { "const": "match_me" }
          }
        }
      }
    },
    "sync": {
      "type": "object",
      "properties": {
        "profileTray": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "default": true },
            "interval": { "type": "integer", "default": 300 },
            "batchSize": { "type": "integer", "default": 100 },
            "retryAttempts": { "type": "integer", "default": 3 }
          }
        },
        "configuration": {
          "type": "object",
          "properties": {
            "reloadInterval": { "type": "integer", "default": 3600 },
            "watchFiles": { "type": "boolean", "default": true },
            "allowDynamicUpdates": { "type": "boolean", "default": false }
          }
        }
      }
    },
    "overrides": {
      "type": "object",
      "properties": {
        "allowEnvironmentOverrides": { "type": "boolean", "default": true },
        "allowDatabaseOverrides": { "type": "boolean", "default": false },
        "priorityOrder": {
          "type": "array",
          "items": { "enum": ["defaults", "file", "environment", "database"] },
          "default": ["defaults", "file", "environment"]
        }
      }
    }
  }
}`
};
