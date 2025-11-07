# SPECIES MCP Server - Simplified Architecture

A Model Context Protocol (MCP) server that enables AI assistants to interact with the SPECIES Marketplace using user-provided credentials.

## How It Actually Works

The SPECIES Marketplace operates on a **single authenticated API call** model:

1. **User provides their credentials**:
   - API Key (from SPECIES Marketplace)
   - Secret (from ProfileTray)

2. **MCP makes ONE authenticated call** with:
   - HMAC-signed headers (using the secret)
   - Event request body containing: `from`, `to`, `amount`, `payWith`, `putProceeds`

3. **Marketplace returns a receipt** that the MCP interprets for the user

## Core Tools

### 1. Configure Credentials
```
species_configure
  - apiKey: "your-api-key"
  - secret: "your-secret-from-profiletray"
  - marketplaceUrl: "https://api.species.io" (optional)
```

### 2. Create Transaction
```
species_create_transaction
  - from: "your-onli-id"
  - to: "recipient-onli-id" or "treasury"
  - amount: 1000
  - paymentProof: "npmt_xxx" (for purchases)
  - chain: "TRON"
  - usdtAddress: "TRX..." (for sales)
  - listingId: "lst_xxx" (for market buys)
```

### 3. Get & Interpret Receipt
```
species_get_receipt
  - eventId: "evt-xxx"
  
Returns human-readable interpretation of:
  - Transaction status
  - Balance changes
  - Payment verification
  - Fees charged
  - Timeline of events
  - Error details (if failed)
```

## Authentication Details

Every API call includes these headers:
- `X-API-Key`: Your marketplace API key
- `X-Nonce`: Unique request identifier
- `X-Timestamp`: Current timestamp
- `X-Signature`: HMAC-SHA256(body + nonce + timestamp, secret)
- `X-Event-Id`: Unique transaction identifier

## Transaction Types

The marketplace automatically determines the transaction type based on the request:

| Type | Determined By |
|------|--------------|
| **BUY_TREASURY** | `to` = "treasury" |
| **BUY_MARKET** | `listingId` provided |
| **SELL_MARKET** | `putProceeds` provided |
| **TRANSFER** | Default (P2P transfer) |

## Receipt Interpretation

The MCP interprets receipts to show:

```
📋 TRANSACTION RECEIPT INTERPRETATION
═══════════════════════════════════════

Event ID: evt-1234567890-abc123
Status: ✅ COMPLETED
Transaction Type: BUY_TREASURY

📍 TRANSACTION FLOW:
From: usr-buyer-123
  Starting Balance: 0 SPECIES
  Ending Balance: 1,000 SPECIES
  
To: treasury
  Starting Balance: ∞ SPECIES
  Ending Balance: ∞ SPECIES

Amount Transferred: 1,000 SPECIES

💳 PAYMENT VERIFICATION:
Provider: NOWPayments
Amount: 10 USDT
Confirmations: 15
Payment ID: npmt_xyz789

💰 FEE BREAKDOWN:
Issuance Fee: $0.01 USDT
TOTAL FEES: $0.01 USDT

⏱️ TRANSACTION TIMELINE:
Received: 11/5/2024, 10:30:00 AM
Authenticated: 11/5/2024, 10:30:01 AM
Payment Validated: 11/5/2024, 10:30:15 AM
Completed: 11/5/2024, 10:30:20 AM

📝 SUMMARY:
Successfully purchased 1,000 SPECIES from the treasury.
```

## Installation

```bash
npm install
npm run build
npm start
```

## Configuration for Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "species": {
      "command": "node",
      "args": ["path/to/species-mcp-server-simplified.js"]
    }
  }
}
```

## Usage Examples

### Configure Your Account
```
"Configure my SPECIES account with API key 'abc123' and secret 'xyz789'"
```

### Buy from Treasury
```
"Buy 1000 SPECIES from treasury, my payment proof is npmt_12345"
```

### Transfer to Friend
```
"Transfer 500 SPECIES from usr-me to usr-friend"
```

### Create Market Listing
```
"Sell 5000 SPECIES, send proceeds to my TRON address TR7NHq..."
```

### Check Transaction
```
"Get receipt for event evt-1234567890-abc123"
```

## Security Notes

- **Never share your secret**: It's used to sign all requests
- **API key is semi-public**: Can be seen in requests
- **One-time proofs**: Payment proofs can only be used once
- **Event IDs are unique**: Each transaction has a unique identifier

## Error Handling

Common errors and solutions:

| Error | Solution |
|-------|----------|
| `AUTH001: Invalid API key` | Check your API key configuration |
| `AUTH002: Invalid signature` | Verify your secret is correct |
| `PAY001: Payment not verified` | Ensure payment proof is valid |
| `VAL002: Insufficient balance` | Check you have enough SPECIES |

## What the MCP Does NOT Do

- **Does NOT store credentials**: You must configure each session
- **Does NOT check balances**: Use the marketplace UI
- **Does NOT list active orders**: Use the marketplace UI
- **Does NOT provide real-time prices**: Check the marketplace

## What the MCP DOES Do

- **Makes authenticated API calls** using your credentials
- **Interprets transaction receipts** in human-readable format
- **Handles HMAC signing** automatically
- **Provides transaction summaries** with all relevant details

## Support

- SPECIES Marketplace: https://species.io
- ProfileTray (for secrets): https://profiletray.species.io
- API Documentation: https://docs.species.io/api

---

This MCP is designed for simplicity and security. It makes exactly one API call per transaction and provides clear interpretation of the results.
