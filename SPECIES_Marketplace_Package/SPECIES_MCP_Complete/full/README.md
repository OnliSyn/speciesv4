# SPECIES MCP Server

Model Context Protocol (MCP) server implementation for the SPECIES Marketplace, enabling AI assistants to interact with SPECIES digital assets on the Onli Cloud platform.

## Features

- **Balance Queries**: Check SPECIES and USDT balances
- **Transaction Management**: Create and monitor transactions with confirmation flows
- **Market Data**: Access real-time market conditions and listings
- **Listing Creation**: Create marketplace listings with appropriate fees
- **Receipt Retrieval**: Get transaction receipts in multiple formats
- **Portfolio Analysis**: Comprehensive portfolio overview and analytics

## Installation

```bash
# Clone the repository
git clone https://github.com/species/mcp-server.git
cd species-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `.env` file in the root directory:

```env
# SPECIES Marketplace
SPECIES_API_URL=https://api.species.io
SPECIES_API_KEY=your_api_key_here
SPECIES_API_SECRET=your_api_secret_here

# ProfileTray
PROFILETRAY_URL=https://profiletray.species.io
PROFILETRAY_TOKEN=your_profiletray_token_here

# Onli Cloud
ONLI_CLOUD_URL=https://api.onlicloud.com
ONLI_CLOUD_API_KEY=your_onli_api_key_here

# Environment
ENVIRONMENT=development
LOG_LEVEL=info
```

## Usage

### Starting the Server

```bash
# Production
npm start

# Development (with hot reload)
npm run dev
```

### Connecting from Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "species": {
      "command": "node",
      "args": ["/path/to/species-mcp-server/dist/species-mcp-server.js"],
      "env": {
        "SPECIES_API_KEY": "your_api_key",
        "PROFILETRAY_TOKEN": "your_token"
      }
    }
  }
}
```

### Using with AI Assistant

Once connected, the AI assistant can:

```
"Check my SPECIES balance"
"Estimate the cost to buy 1000 SPECIES from treasury"
"Create a listing for 5000 SPECIES at 0.01 USDT each"
"Show me the current market overview"
"Get my recent transaction history"
```

## Available Tools

### Read Operations (No Confirmation)

- `species_check_balance` - Check current balances
- `species_estimate_transaction` - Estimate transaction costs
- `species_get_receipt` - Retrieve transaction receipts
- `species_monitor_transaction` - Monitor transaction status

### Write Operations (Confirmation Required)

- `species_create_transaction` - Create new transactions
- `species_create_listing` - Create marketplace listings

## Available Resources

- `species://balance` - User balance information
- `species://market/overview` - Market statistics
- `species://transactions` - Transaction history
- `species://listings/active` - Active marketplace listings

## Available Prompts

- `species_market_analysis` - Comprehensive market analysis
- `species_transaction_assistant` - Transaction guidance
- `species_portfolio_overview` - Portfolio analysis

## Security

### Confirmation Flows

All write operations require explicit user confirmation:

1. **User Consent**: Explicit confirmation with transaction preview
2. **PIN/2FA**: Additional authentication for high-value operations
3. **Timeout**: Confirmations expire after 60 seconds

### Rate Limiting

- Global: 60 requests/minute
- Per tool: Specific limits for each operation
- Daily limits: Transaction and listing caps

### Best Practices

1. Never share API keys or secrets
2. Use environment variables for sensitive data
3. Enable 2FA for production accounts
4. Monitor rate limits to avoid throttling
5. Implement proper error handling

## API Reference

### Transaction Types

- `BUY_TREASURY`: Purchase from treasury issuance
- `BUY_MARKET`: Purchase from marketplace listing  
- `SELL_MARKET`: Create a sale listing
- `TRANSFER`: Peer-to-peer transfer

### Error Codes

| Code | Description |
|------|-------------|
| AUTH001 | Invalid credentials |
| VAL001 | Invalid amount |
| VAL002 | Insufficient balance |
| MKT001 | Listing not found |
| TXN001 | Invalid payment proof |
| RATE001 | Rate limit exceeded |

## Development

### Project Structure

```
species-mcp-server/
├── src/
│   ├── species-mcp-server.ts    # Main server implementation
│   ├── species-client.ts        # SPECIES API client
│   ├── profiletray-client.ts    # ProfileTray client
│   ├── confirmation-manager.ts  # Confirmation handling
│   └── types/                   # TypeScript definitions
├── dist/                         # Compiled JavaScript
├── test/                         # Test files
├── .env                          # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

### Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Troubleshooting

### Common Issues

**Connection refused**
- Check that the server is running
- Verify API credentials are correct
- Ensure network connectivity

**Rate limit exceeded**
- Implement exponential backoff
- Check rate limit headers
- Reduce request frequency

**Transaction failed**
- Verify payment proof is valid
- Check account has sufficient balance
- Ensure recipient address is correct

## Support

- Documentation: https://docs.species.io/mcp
- Issues: https://github.com/species/mcp-server/issues
- Discord: https://discord.gg/species

## License

MIT License - see LICENSE file for details

## Changelog

### v1.0.0 (2024-11-05)
- Initial release
- Core tool implementations
- Confirmation flow system
- Rate limiting
- Error handling

---

Built with ❤️ for the SPECIES ecosystem
