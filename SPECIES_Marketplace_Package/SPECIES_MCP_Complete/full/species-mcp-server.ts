// species-mcp-server.ts
// SPECIES Marketplace Model Context Protocol Server Implementation

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { SpeciesMarketplaceClient } from './species-client';
import { ProfileTrayClient } from './profiletray-client';
import { ConfirmationManager } from './confirmation-manager';

interface SpeciesConfig {
  marketplaceApiUrl: string;
  profileTrayUrl: string;
  onliCloudUrl: string;
  apiKey?: string;
  apiSecret?: string;
  environment: 'development' | 'staging' | 'production';
}

export class SpeciesMCPServer {
  private server: Server;
  private speciesClient: SpeciesMarketplaceClient;
  private profileTrayClient: ProfileTrayClient;
  private confirmationManager: ConfirmationManager;
  private config: SpeciesConfig;
  private userContext: Map<string, any> = new Map();

  constructor(config: SpeciesConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: 'species-marketplace-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );

    this.speciesClient = new SpeciesMarketplaceClient(config);
    this.profileTrayClient = new ProfileTrayClient(config);
    this.confirmationManager = new ConfirmationManager();
    
    this.setupHandlers();
  }

  private setupHandlers() {
    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'species://balance',
          name: 'User Balance',
          description: 'Get SPECIES and USDT balances',
          mimeType: 'application/json',
        },
        {
          uri: 'species://market/overview',
          name: 'Market Overview',
          description: 'Current market conditions and statistics',
          mimeType: 'application/json',
        },
        {
          uri: 'species://transactions',
          name: 'Transaction History',
          description: 'Recent transaction history',
          mimeType: 'application/json',
        },
        {
          uri: 'species://listings/active',
          name: 'Active Listings',
          description: 'Current marketplace listings',
          mimeType: 'application/json',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      try {
        switch (uri) {
          case 'species://balance':
            return await this.handleBalanceResource();
          case 'species://market/overview':
            return await this.handleMarketResource();
          case 'species://transactions':
            return await this.handleTransactionsResource();
          case 'species://listings/active':
            return await this.handleListingsResource();
          default:
            throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
        }
      } catch (error) {
        return this.handleError(error);
      }
    });

    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'species_check_balance',
          description: 'Check SPECIES and USDT balances',
          inputSchema: {
            type: 'object',
            properties: {
              currency: {
                type: 'string',
                enum: ['SPECIES', 'USDT', 'ALL'],
                default: 'ALL',
              },
              includeLockedFunds: {
                type: 'boolean',
                default: true,
              },
            },
          },
        },
        {
          name: 'species_estimate_transaction',
          description: 'Estimate fees and total cost for a transaction',
          inputSchema: {
            type: 'object',
            required: ['type', 'amount'],
            properties: {
              type: {
                type: 'string',
                enum: ['BUY_TREASURY', 'BUY_MARKET', 'SELL_MARKET', 'TRANSFER'],
              },
              amount: {
                type: 'number',
                minimum: 1,
              },
              listingId: {
                type: 'string',
                description: 'Required for BUY_MARKET',
              },
              recipient: {
                type: 'string',
                description: 'Required for TRANSFER',
              },
            },
          },
        },
        {
          name: 'species_create_transaction',
          description: 'Create a new SPECIES transaction (requires confirmation)',
          inputSchema: {
            type: 'object',
            required: ['type', 'amount'],
            properties: {
              type: {
                type: 'string',
                enum: ['BUY_TREASURY', 'BUY_MARKET', 'SELL_MARKET', 'TRANSFER'],
              },
              amount: {
                type: 'number',
                minimum: 1,
              },
              paymentProof: {
                type: 'string',
              },
              recipient: {
                type: 'string',
              },
              listingId: {
                type: 'string',
              },
              putProceeds: {
                type: 'object',
                properties: {
                  usdtAddress: { type: 'string' },
                  chain: { 
                    type: 'string',
                    enum: ['TRON', 'ETH', 'BSC'] 
                  },
                },
              },
            },
          },
        },
        {
          name: 'species_create_listing',
          description: 'Create a marketplace listing (requires confirmation)',
          inputSchema: {
            type: 'object',
            required: ['amount', 'pricePerUnit'],
            properties: {
              amount: {
                type: 'number',
                minimum: 5000,
              },
              pricePerUnit: {
                type: 'number',
                minimum: 0.001,
              },
              duration: {
                type: 'integer',
                default: 172800,
                maximum: 604800,
              },
              feeProof: {
                type: 'string',
              },
            },
          },
        },
        {
          name: 'species_get_receipt',
          description: 'Retrieve transaction receipt',
          inputSchema: {
            type: 'object',
            required: ['eventId'],
            properties: {
              eventId: {
                type: 'string',
              },
              format: {
                type: 'string',
                enum: ['json', 'pdf', 'html'],
                default: 'json',
              },
            },
          },
        },
        {
          name: 'species_monitor_transaction',
          description: 'Monitor transaction status',
          inputSchema: {
            type: 'object',
            required: ['eventId'],
            properties: {
              eventId: {
                type: 'string',
              },
              includeUpdates: {
                type: 'boolean',
                default: true,
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'species_check_balance':
            return await this.handleCheckBalance(args);
          case 'species_estimate_transaction':
            return await this.handleEstimateTransaction(args);
          case 'species_create_transaction':
            return await this.handleCreateTransaction(args);
          case 'species_create_listing':
            return await this.handleCreateListing(args);
          case 'species_get_receipt':
            return await this.handleGetReceipt(args);
          case 'species_monitor_transaction':
            return await this.handleMonitorTransaction(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        return this.handleError(error);
      }
    });

    // Prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: 'species_market_analysis',
          description: 'Analyze current SPECIES market conditions',
          arguments: [
            {
              name: 'timeframe',
              description: 'Analysis timeframe',
              required: false,
              default: '24h',
            },
          ],
        },
        {
          name: 'species_transaction_assistant',
          description: 'Help user complete a SPECIES transaction',
          arguments: [
            {
              name: 'transactionType',
              description: 'Type of transaction',
              required: true,
            },
            {
              name: 'amount',
              description: 'Amount of SPECIES',
              required: false,
            },
          ],
        },
        {
          name: 'species_portfolio_overview',
          description: 'Comprehensive portfolio analysis',
          arguments: [],
        },
      ],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case 'species_market_analysis':
          return this.getMarketAnalysisPrompt(args);
        case 'species_transaction_assistant':
          return this.getTransactionAssistantPrompt(args);
        case 'species_portfolio_overview':
          return this.getPortfolioOverviewPrompt();
        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
      }
    });
  }

  // Resource handlers
  private async handleBalanceResource() {
    const userId = await this.getCurrentUserId();
    const balances = await this.speciesClient.getBalance(userId);
    
    return {
      contents: [
        {
          uri: 'species://balance',
          mimeType: 'application/json',
          text: JSON.stringify(balances, null, 2),
        },
      ],
    };
  }

  private async handleMarketResource() {
    const overview = await this.speciesClient.getMarketOverview();
    
    return {
      contents: [
        {
          uri: 'species://market/overview',
          mimeType: 'application/json',
          text: JSON.stringify(overview, null, 2),
        },
      ],
    };
  }

  private async handleTransactionsResource() {
    const userId = await this.getCurrentUserId();
    const transactions = await this.speciesClient.getTransactionHistory(userId, {
      limit: 10,
      offset: 0,
    });
    
    return {
      contents: [
        {
          uri: 'species://transactions',
          mimeType: 'application/json',
          text: JSON.stringify(transactions, null, 2),
        },
      ],
    };
  }

  private async handleListingsResource() {
    const listings = await this.speciesClient.getActiveListings();
    
    return {
      contents: [
        {
          uri: 'species://listings/active',
          mimeType: 'application/json',
          text: JSON.stringify(listings, null, 2),
        },
      ],
    };
  }

  // Tool handlers
  private async handleCheckBalance(args: any) {
    const { currency = 'ALL', includeLockedFunds = true } = args;
    const userId = await this.getCurrentUserId();
    
    const balances = await this.speciesClient.getBalance(userId, {
      currency,
      includeLockedFunds,
    });
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatBalanceResponse(balances),
        },
      ],
    };
  }

  private async handleEstimateTransaction(args: any) {
    const { type, amount, listingId, recipient } = args;
    
    const estimate = await this.speciesClient.estimateTransaction({
      type,
      amount,
      listingId,
      recipient,
    });
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatEstimateResponse(estimate),
        },
      ],
    };
  }

  private async handleCreateTransaction(args: any) {
    const { type, amount, paymentProof, recipient, listingId, putProceeds } = args;
    
    // Request user confirmation
    const confirmationMessage = `Confirm ${type} transaction of ${amount} SPECIES. This action cannot be reversed.`;
    const confirmed = await this.confirmationManager.requestConfirmation({
      level: 'USER_CONSENT',
      message: confirmationMessage,
      requiresPIN: true,
      timeout: 60,
    });
    
    if (!confirmed) {
      throw new Error('Transaction cancelled by user');
    }
    
    // Create the transaction
    const userId = await this.getCurrentUserId();
    const eventRequest = {
      eventId: this.generateEventId(),
      from: userId,
      to: recipient || 'treasury',
      amount,
      payWith: paymentProof ? {
        currency: 'USDT' as const,
        chain: 'TRON' as const,
        proof: paymentProof,
      } : undefined,
      putProceeds,
      metadata: { listingId },
    };
    
    const result = await this.speciesClient.createTransaction(eventRequest);
    
    // Start monitoring
    this.startTransactionMonitoring(result.eventId);
    
    return {
      content: [
        {
          type: 'text',
          text: `Transaction created successfully. Event ID: ${result.eventId}. Status: ${result.status}`,
        },
      ],
    };
  }

  private async handleCreateListing(args: any) {
    const { amount, pricePerUnit, duration = 172800, feeProof } = args;
    
    // Check minimum amount
    if (amount < 5000) {
      throw new Error('Minimum listing amount is 5000 SPECIES');
    }
    
    // Request confirmation
    const totalPrice = amount * pricePerUnit;
    const confirmationMessage = `Create listing for ${amount} SPECIES at ${pricePerUnit} USDT each (Total: ${totalPrice} USDT). Listing fee: $100 USDT.`;
    const confirmed = await this.confirmationManager.requestConfirmation({
      level: 'USER_CONSENT',
      message: confirmationMessage,
      requiresPIN: true,
    });
    
    if (!confirmed) {
      throw new Error('Listing creation cancelled by user');
    }
    
    const userId = await this.getCurrentUserId();
    const listing = await this.speciesClient.createListing({
      sellerId: userId,
      amount,
      pricePerUnit,
      duration,
      feeProof,
    });
    
    return {
      content: [
        {
          type: 'text',
          text: `Listing created successfully. Listing ID: ${listing.listingId}. Expires at: ${listing.expiresAt}`,
        },
      ],
    };
  }

  private async handleGetReceipt(args: any) {
    const { eventId, format = 'json' } = args;
    
    const receipt = await this.speciesClient.getReceipt(eventId, format);
    
    return {
      content: [
        {
          type: 'text',
          text: format === 'json' 
            ? JSON.stringify(receipt, null, 2)
            : `Receipt generated in ${format} format. Download URL: ${receipt.url}`,
        },
      ],
    };
  }

  private async handleMonitorTransaction(args: any) {
    const { eventId, includeUpdates = true } = args;
    
    const status = await this.speciesClient.getTransactionStatus(eventId);
    
    if (includeUpdates) {
      // Set up real-time monitoring
      this.startTransactionMonitoring(eventId);
    }
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatTransactionStatus(status),
        },
      ],
    };
  }

  // Prompt handlers
  private getMarketAnalysisPrompt(args: any) {
    const timeframe = args?.timeframe || '24h';
    
    return {
      description: `Analyze SPECIES market for ${timeframe}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze the SPECIES market for the ${timeframe} timeframe:

1. Check current market overview
2. Get active listings summary
3. Calculate average prices
4. Identify trends
5. Provide trading recommendations

Focus on:
- Price movements
- Volume analysis
- Supply/demand balance
- Optimal entry/exit points`,
          },
        },
      ],
    };
  }

  private getTransactionAssistantPrompt(args: any) {
    const { transactionType, amount } = args;
    
    return {
      description: `Assist with ${transactionType} transaction`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Assist with ${transactionType} transaction${amount ? ` for ${amount} SPECIES` : ''}:

1. Check user's current balance
2. Estimate transaction costs and fees
3. Verify market conditions
4. Guide through confirmation process
5. Monitor transaction completion

Ensure user understands:
- Total costs involved
- Irreversibility of transactions
- Current market conditions
- Expected completion time`,
          },
        },
      ],
    };
  }

  private getPortfolioOverviewPrompt() {
    return {
      description: 'Comprehensive portfolio analysis',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Provide complete SPECIES portfolio overview:

1. Current balances (SPECIES and USDT)
2. Recent transaction history
3. Active listings or orders
4. Performance metrics
5. Recommendations

Calculate:
- Total portfolio value
- P&L if applicable
- Transaction frequency
- Average transaction size`,
          },
        },
      ],
    };
  }

  // Helper methods
  private async getCurrentUserId(): Promise<string> {
    // Get from context or authentication
    const contextUserId = this.userContext.get('userId');
    if (contextUserId) return contextUserId;
    
    // Get from ProfileTray
    const profile = await this.profileTrayClient.getCurrentUser();
    if (profile?.onliId) {
      this.userContext.set('userId', profile.onliId);
      return profile.onliId;
    }
    
    throw new Error('User not authenticated');
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private startTransactionMonitoring(eventId: string) {
    // Set up WebSocket or polling for transaction updates
    const interval = setInterval(async () => {
      try {
        const status = await this.speciesClient.getTransactionStatus(eventId);
        
        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          clearInterval(interval);
          console.log(`Transaction ${eventId} ${status.status}`);
        }
      } catch (error) {
        console.error(`Error monitoring transaction ${eventId}:`, error);
        clearInterval(interval);
      }
    }, 5000);
  }

  private formatBalanceResponse(balances: any): string {
    return `Current Balances:
- SPECIES: ${balances.species.toLocaleString()}
- USDT: $${balances.usdt.toLocaleString()}
${balances.lockedSpecies > 0 ? `- Locked SPECIES: ${balances.lockedSpecies.toLocaleString()}` : ''}
Last Updated: ${new Date(balances.lastUpdated).toLocaleString()}`;
  }

  private formatEstimateResponse(estimate: any): string {
    return `Transaction Estimate:
- Amount: ${estimate.amount.toLocaleString()} SPECIES
- Fees:
  ${estimate.fees.listing ? `  Listing Fee: $${estimate.fees.listing}` : ''}
  ${estimate.fees.issuance ? `  Issuance Fee: $${estimate.fees.issuance}` : ''}
  ${estimate.fees.liquidity ? `  Liquidity Fee: $${estimate.fees.liquidity}` : ''}
  Total Fees: $${estimate.fees.total}
- Total Cost: $${estimate.totalCost}
- Estimated Completion: ${estimate.estimatedCompletion}`;
  }

  private formatTransactionStatus(status: any): string {
    return `Transaction Status:
- Event ID: ${status.eventId}
- Status: ${status.status}
- Type: ${status.type}
- Amount: ${status.amount.toLocaleString()} SPECIES
- Created: ${new Date(status.createdAt).toLocaleString()}
- Last Updated: ${new Date(status.updatedAt).toLocaleString()}
${status.error ? `- Error: ${status.error}` : ''}`;
  }

  private handleError(error: any) {
    console.error('MCP Error:', error);
    
    const errorResponse = {
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
        details: {
          timestamp: new Date().toISOString(),
          retryable: error.retryable || false,
        },
      },
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2),
        },
      ],
    };
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SPECIES MCP Server started');
  }
}

// Main entry point
async function main() {
  const config: SpeciesConfig = {
    marketplaceApiUrl: process.env.SPECIES_API_URL || 'https://api.species.io',
    profileTrayUrl: process.env.PROFILETRAY_URL || 'https://profiletray.species.io',
    onliCloudUrl: process.env.ONLI_CLOUD_URL || 'https://api.onlicloud.com',
    apiKey: process.env.SPECIES_API_KEY,
    apiSecret: process.env.SPECIES_API_SECRET,
    environment: (process.env.ENVIRONMENT as any) || 'development',
  };
  
  const server = new SpeciesMCPServer(config);
  await server.start();
}

main().catch((error) => {
  console.error('Failed to start SPECIES MCP Server:', error);
  process.exit(1);
});
