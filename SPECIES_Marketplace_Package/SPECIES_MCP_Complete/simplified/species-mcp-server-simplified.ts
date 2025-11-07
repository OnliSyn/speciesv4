// species-mcp-server-simplified.ts
// SPECIES Marketplace MCP Server - Simplified Single-Call Architecture
// User provides API key + secret, MCP makes authenticated calls and interprets receipts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

interface UserCredentials {
  apiKey: string;
  secret: string;
  marketplaceUrl?: string;
}

interface EventRequest {
  eventId: string;
  from: string;           // User's onliId
  to: string;            // Recipient's onliId or 'treasury'
  amount: number;        // SPECIES amount
  payWith?: {
    currency: 'USDT';
    chain: 'TRON' | 'ETH' | 'BSC';
    proof?: string;      // Payment proof (e.g., npmt_xxx or tx hash)
    feeProof?: string;   // Separate fee payment proof if required
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

interface EventReceipt {
  eventId: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'PROCESSING';
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
  fills?: Array<{
    matchId: string;
    buyerId: string;
    sellerId: string;
    fillAmount: number;
    status: string;
  }>;
  payments?: Array<{
    provider: string;
    paymentId?: string;
    amount: number;
    confirmations: number;
    verifiedAt: string;
  }>;
  assetReceipts?: Array<{
    receiptId: string;
    operation: string;
    verifiedAt: string;
  }>;
  timestamps: {
    received: string;
    authenticated?: string;
    validated?: string;
    classified?: string;
    matched?: string;
    completed?: string;
  };
  fees?: {
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
  trackingUrl?: string;
}

export class SpeciesMCPServerSimplified {
  private server: Server;
  private credentials: UserCredentials | null = null;
  private httpClient: AxiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'species-marketplace-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    this.setupHandlers();
  }

  private setupHandlers() {
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'species_configure',
          description: 'Configure your SPECIES API credentials',
          inputSchema: {
            type: 'object',
            required: ['apiKey', 'secret'],
            properties: {
              apiKey: {
                type: 'string',
                description: 'Your SPECIES Marketplace API key'
              },
              secret: {
                type: 'string',
                description: 'Your SPECIES secret (from ProfileTray)'
              },
              marketplaceUrl: {
                type: 'string',
                description: 'Marketplace API URL (optional)',
                default: 'https://api.species.io'
              }
            }
          }
        },
        {
          name: 'species_create_transaction',
          description: 'Create a SPECIES transaction',
          inputSchema: {
            type: 'object',
            required: ['from', 'to', 'amount'],
            properties: {
              from: {
                type: 'string',
                description: 'Your onliId (sender)'
              },
              to: {
                type: 'string',
                description: 'Recipient onliId or "treasury"'
              },
              amount: {
                type: 'number',
                description: 'Amount of SPECIES to transfer',
                minimum: 1
              },
              paymentProof: {
                type: 'string',
                description: 'USDT payment proof (e.g., npmt_xxx or tx hash)'
              },
              feeProof: {
                type: 'string',
                description: 'Listing fee payment proof if creating a listing'
              },
              chain: {
                type: 'string',
                enum: ['TRON', 'ETH', 'BSC'],
                default: 'TRON',
                description: 'Blockchain for payment'
              },
              usdtAddress: {
                type: 'string',
                description: 'Your USDT address for sale proceeds (SELL_MARKET only)'
              },
              listingId: {
                type: 'string',
                description: 'Listing ID for BUY_MARKET transactions'
              }
            }
          }
        },
        {
          name: 'species_get_receipt',
          description: 'Get and interpret a transaction receipt',
          inputSchema: {
            type: 'object',
            required: ['eventId'],
            properties: {
              eventId: {
                type: 'string',
                description: 'The event ID returned from create_transaction'
              }
            }
          }
        },
        {
          name: 'species_interpret_receipt',
          description: 'Interpret a receipt to understand what happened',
          inputSchema: {
            type: 'object',
            required: ['receipt'],
            properties: {
              receipt: {
                type: 'object',
                description: 'The receipt object to interpret'
              }
            }
          }
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'species_configure':
            return await this.handleConfigure(args);
          case 'species_create_transaction':
            return await this.handleCreateTransaction(args);
          case 'species_get_receipt':
            return await this.handleGetReceipt(args);
          case 'species_interpret_receipt':
            return await this.handleInterpretReceipt(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        return this.handleError(error);
      }
    });

    // Resource handlers for reading receipts
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'species://receipt/*',
          name: 'Transaction Receipt',
          description: 'View and interpret transaction receipts',
          mimeType: 'application/json',
        }
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (uri.startsWith('species://receipt/')) {
        const eventId = uri.replace('species://receipt/', '');
        return await this.getReceiptResource(eventId);
      }
      
      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    });
  }

  private async handleConfigure(args: any) {
    const { apiKey, secret, marketplaceUrl = 'https://api.species.io' } = args;
    
    if (!apiKey || !secret) {
      throw new Error('API key and secret are required');
    }
    
    this.credentials = {
      apiKey,
      secret,
      marketplaceUrl
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `Configuration successful. You can now create transactions using your credentials.
Marketplace URL: ${marketplaceUrl}
API Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
        }
      ]
    };
  }

  private async handleCreateTransaction(args: any) {
    if (!this.credentials) {
      throw new Error('Please configure your credentials first using species_configure');
    }
    
    const { 
      from, 
      to, 
      amount,
      paymentProof,
      feeProof,
      chain = 'TRON',
      usdtAddress,
      listingId
    } = args;
    
    // Generate event ID
    const eventId = `evt-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    // Build the event request
    const eventRequest: EventRequest = {
      eventId,
      from,
      to,
      amount,
      metadata: {}
    };
    
    // Add payment proof if provided (for BUY operations)
    if (paymentProof) {
      eventRequest.payWith = {
        currency: 'USDT',
        chain: chain as 'TRON' | 'ETH' | 'BSC',
        proof: paymentProof,
        feeProof: feeProof
      };
    }
    
    // Add proceeds address if provided (for SELL_MARKET)
    if (usdtAddress) {
      eventRequest.putProceeds = {
        usdtAddress,
        chain: chain as 'TRON' | 'ETH' | 'BSC'
      };
    }
    
    // Add listing ID if provided (for BUY_MARKET)
    if (listingId) {
      eventRequest.metadata!.listingId = listingId;
    }
    
    // Create HMAC headers
    const headers = this.createAuthHeaders(eventRequest, eventId);
    
    try {
      // Make the single API call
      const response = await this.httpClient.post(
        `${this.credentials.marketplaceUrl}/marketplace/v1/events`,
        eventRequest,
        { headers }
      );
      
      // The API returns 202 Accepted with tracking info
      const acceptedResponse = response.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `Transaction created successfully!

Event ID: ${eventId}
Status: ${acceptedResponse.status || 'ACCEPTED'}
Tracking URL: ${acceptedResponse.trackingUrl || 'Not provided'}

The transaction is being processed. Use species_get_receipt with the Event ID to check the status and get the full receipt.

Transaction Summary:
- From: ${from}
- To: ${to}
- Amount: ${amount} SPECIES
- Type: ${this.inferTransactionType(eventRequest)}
${paymentProof ? `- Payment Proof: ${paymentProof}` : ''}
${listingId ? `- Listing ID: ${listingId}` : ''}
${usdtAddress ? `- Proceeds to: ${usdtAddress}` : ''}`
          }
        ]
      };
    } catch (error: any) {
      throw new Error(`Transaction failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private async handleGetReceipt(args: any) {
    if (!this.credentials) {
      throw new Error('Please configure your credentials first using species_configure');
    }
    
    const { eventId } = args;
    
    if (!eventId) {
      throw new Error('Event ID is required');
    }
    
    // Create headers for authenticated request
    const nonce = uuidv4();
    const timestamp = new Date().toISOString();
    const headers = {
      'X-API-Key': this.credentials.apiKey,
      'X-Nonce': nonce,
      'X-Timestamp': timestamp,
      'X-Signature': this.createSignature('', nonce, timestamp)
    };
    
    try {
      const response = await this.httpClient.get(
        `${this.credentials.marketplaceUrl}/marketplace/v1/receipts/${eventId}`,
        { headers }
      );
      
      const receipt: EventReceipt = response.data;
      const interpretation = this.interpretReceipt(receipt);
      
      return {
        content: [
          {
            type: 'text',
            text: interpretation
          }
        ]
      };
    } catch (error: any) {
      throw new Error(`Failed to get receipt: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private async handleInterpretReceipt(args: any) {
    const { receipt } = args;
    
    if (!receipt) {
      throw new Error('Receipt is required');
    }
    
    const interpretation = this.interpretReceipt(receipt);
    
    return {
      content: [
        {
          type: 'text',
          text: interpretation
        }
      ]
    };
  }

  private createAuthHeaders(body: any, eventId: string): Record<string, string> {
    if (!this.credentials) {
      throw new Error('Credentials not configured');
    }
    
    const nonce = uuidv4();
    const timestamp = new Date().toISOString();
    const bodyString = JSON.stringify(body);
    
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.credentials.apiKey,
      'X-Nonce': nonce,
      'X-Timestamp': timestamp,
      'X-Signature': this.createSignature(bodyString, nonce, timestamp),
      'X-Event-Id': eventId
    };
  }

  private createSignature(body: string, nonce: string, timestamp: string): string {
    if (!this.credentials) {
      throw new Error('Credentials not configured');
    }
    
    // Create the message to sign: body + nonce + timestamp
    const message = body + nonce + timestamp;
    
    // Create HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', this.credentials.secret);
    hmac.update(message);
    
    // Return base64 encoded signature
    return hmac.digest('base64');
  }

  private inferTransactionType(request: EventRequest): string {
    // Infer transaction type based on the request structure
    if (request.metadata?.listingId) {
      return 'BUY_MARKET';
    }
    if (request.to === 'treasury' || request.to.includes('treasury')) {
      return 'BUY_TREASURY';
    }
    if (request.putProceeds) {
      return 'SELL_MARKET';
    }
    if (request.payWith) {
      return 'BUY_MARKET'; // Generic buy
    }
    return 'TRANSFER';
  }

  private interpretReceipt(receipt: EventReceipt): string {
    let interpretation = `📋 TRANSACTION RECEIPT INTERPRETATION
═══════════════════════════════════════

Event ID: ${receipt.eventId}
Status: ${this.formatStatus(receipt.status)}
Transaction Type: ${receipt.intent}

📍 TRANSACTION FLOW:
-------------------
From: ${receipt.from.onliId}
  Starting Balance: ${receipt.from.startBalance?.toLocaleString() || 'N/A'} SPECIES
  Ending Balance: ${receipt.from.endBalance?.toLocaleString() || 'N/A'} SPECIES
  
To: ${receipt.to.onliId}
  Starting Balance: ${receipt.to.startBalance?.toLocaleString() || 'N/A'} SPECIES
  Ending Balance: ${receipt.to.endBalance?.toLocaleString() || 'N/A'} SPECIES

Amount Transferred: ${receipt.amount.toLocaleString()} SPECIES
`;

    // Add payment information if present
    if (receipt.payments && receipt.payments.length > 0) {
      interpretation += `
💳 PAYMENT VERIFICATION:
------------------------`;
      for (const payment of receipt.payments) {
        interpretation += `
Provider: ${payment.provider}
Amount: ${payment.amount} USDT
Confirmations: ${payment.confirmations}
Verified At: ${new Date(payment.verifiedAt).toLocaleString()}
${payment.paymentId ? `Payment ID: ${payment.paymentId}` : ''}`;
      }
    }

    // Add fee breakdown if present
    if (receipt.fees && receipt.fees.total > 0) {
      interpretation += `
💰 FEE BREAKDOWN:
-----------------`;
      if (receipt.fees.listing) {
        interpretation += `
Listing Fee: $${receipt.fees.listing} USDT`;
      }
      if (receipt.fees.issuance) {
        interpretation += `
Issuance Fee: $${receipt.fees.issuance} USDT`;
      }
      if (receipt.fees.liquidity) {
        interpretation += `
Liquidity Fee: $${receipt.fees.liquidity} USDT`;
      }
      interpretation += `
TOTAL FEES: $${receipt.fees.total} USDT`;
    }

    // Add fills information for market orders
    if (receipt.fills && receipt.fills.length > 0) {
      interpretation += `
📊 ORDER FILLS:
---------------`;
      for (const fill of receipt.fills) {
        interpretation += `
Match ID: ${fill.matchId}
Buyer: ${fill.buyerId}
Seller: ${fill.sellerId}
Amount: ${fill.fillAmount.toLocaleString()} SPECIES
Status: ${fill.status}`;
      }
    }

    // Add timeline
    interpretation += `
⏱️ TRANSACTION TIMELINE:
------------------------
Received: ${this.formatTimestamp(receipt.timestamps.received)}`;
    
    if (receipt.timestamps.authenticated) {
      interpretation += `
Authenticated: ${this.formatTimestamp(receipt.timestamps.authenticated)}`;
    }
    if (receipt.timestamps.validated) {
      interpretation += `
Payment Validated: ${this.formatTimestamp(receipt.timestamps.validated)}`;
    }
    if (receipt.timestamps.classified) {
      interpretation += `
Intent Classified: ${this.formatTimestamp(receipt.timestamps.classified)}`;
    }
    if (receipt.timestamps.matched) {
      interpretation += `
Order Matched: ${this.formatTimestamp(receipt.timestamps.matched)}`;
    }
    if (receipt.timestamps.completed) {
      interpretation += `
Completed: ${this.formatTimestamp(receipt.timestamps.completed)}`;
    }

    // Add error information if failed
    if (receipt.error) {
      interpretation += `

❌ ERROR DETAILS:
-----------------
Code: ${receipt.error.code}
Message: ${receipt.error.message}
Occurred At: ${this.formatTimestamp(receipt.error.occurredAt)}`;
    }

    // Add summary interpretation
    interpretation += `

📝 SUMMARY:
-----------
${this.generateSummary(receipt)}`;

    // Add tracking URL if available
    if (receipt.trackingUrl) {
      interpretation += `

🔗 Track Transaction: ${receipt.trackingUrl}`;
    }

    return interpretation;
  }

  private formatStatus(status: string): string {
    const statusEmojis: Record<string, string> = {
      'COMPLETED': '✅ COMPLETED',
      'FAILED': '❌ FAILED',
      'PENDING': '⏳ PENDING',
      'PROCESSING': '⚙️ PROCESSING'
    };
    return statusEmojis[status] || status;
  }

  private formatTimestamp(timestamp?: string): string {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  private generateSummary(receipt: EventReceipt): string {
    switch (receipt.intent) {
      case 'BUY_TREASURY':
        if (receipt.status === 'COMPLETED') {
          return `Successfully purchased ${receipt.amount.toLocaleString()} SPECIES from the treasury. The tokens have been delivered to ${receipt.to.onliId}'s vault.`;
        } else if (receipt.status === 'FAILED') {
          return `Failed to purchase SPECIES from treasury. ${receipt.error?.message || 'Please check the error details.'}`;
        }
        return `Treasury purchase of ${receipt.amount.toLocaleString()} SPECIES is currently ${receipt.status.toLowerCase()}.`;
        
      case 'BUY_MARKET':
        if (receipt.status === 'COMPLETED') {
          return `Successfully purchased ${receipt.amount.toLocaleString()} SPECIES from the marketplace. The tokens have been transferred from the seller to your vault.`;
        }
        return `Market purchase of ${receipt.amount.toLocaleString()} SPECIES is ${receipt.status.toLowerCase()}.`;
        
      case 'SELL_MARKET':
        if (receipt.status === 'COMPLETED') {
          return `Successfully listed ${receipt.amount.toLocaleString()} SPECIES for sale on the marketplace. Your tokens are locked until the listing expires or is filled.`;
        }
        return `Market listing of ${receipt.amount.toLocaleString()} SPECIES is ${receipt.status.toLowerCase()}.`;
        
      case 'TRANSFER':
        if (receipt.status === 'COMPLETED') {
          return `Successfully transferred ${receipt.amount.toLocaleString()} SPECIES from ${receipt.from.onliId} to ${receipt.to.onliId}.`;
        }
        return `Transfer of ${receipt.amount.toLocaleString()} SPECIES is ${receipt.status.toLowerCase()}.`;
        
      default:
        return `Transaction of ${receipt.amount.toLocaleString()} SPECIES is ${receipt.status.toLowerCase()}.`;
    }
  }

  private async getReceiptResource(eventId: string) {
    if (!this.credentials) {
      throw new Error('Please configure your credentials first');
    }
    
    const nonce = uuidv4();
    const timestamp = new Date().toISOString();
    const headers = {
      'X-API-Key': this.credentials.apiKey,
      'X-Nonce': nonce,
      'X-Timestamp': timestamp,
      'X-Signature': this.createSignature('', nonce, timestamp)
    };
    
    try {
      const response = await this.httpClient.get(
        `${this.credentials.marketplaceUrl}/marketplace/v1/receipts/${eventId}`,
        { headers }
      );
      
      const receipt = response.data;
      const interpretation = this.interpretReceipt(receipt);
      
      return {
        contents: [
          {
            uri: `species://receipt/${eventId}`,
            mimeType: 'application/json',
            text: JSON.stringify({
              receipt,
              interpretation
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      throw new Error(`Failed to get receipt: ${error.message}`);
    }
  }

  private handleError(error: any) {
    console.error('MCP Error:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message || 'An unexpected error occurred'}

If this is an authentication error, please ensure:
1. Your API key is correct
2. Your secret is correct
3. The marketplace URL is accessible

Use species_configure to update your credentials.`
        }
      ]
    };
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SPECIES MCP Server (Simplified) started');
  }
}

// Main entry point
async function main() {
  const server = new SpeciesMCPServerSimplified();
  await server.start();
}

main().catch((error) => {
  console.error('Failed to start SPECIES MCP Server:', error);
  process.exit(1);
});
