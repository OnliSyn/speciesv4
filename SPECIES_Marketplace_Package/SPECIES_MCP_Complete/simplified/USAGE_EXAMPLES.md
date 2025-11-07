# SPECIES MCP Usage Examples

## Complete Transaction Flow Examples

### Example 1: Buy SPECIES from Treasury

```
User: "Configure my SPECIES account"
Assistant: "Please provide your API key and secret from ProfileTray"

User: "API key is 'mk_abc123xyz', secret is 'secret_789def'"
Assistant: [Calls species_configure]
Response: "Configuration successful. You can now create transactions."

User: "I want to buy 1000 SPECIES from the treasury. I already paid with NOWPayments, proof is npmt_456789"
Assistant: [Calls species_create_transaction with:
  from: "usr-buyer-123"
  to: "treasury"  
  amount: 1000
  paymentProof: "npmt_456789"
  chain: "TRON"
]
Response: "Transaction created successfully!
Event ID: evt-1699180200-abc123
Status: ACCEPTED
Tracking URL: https://species.io/track/evt-1699180200-abc123

User: "Check the status"
Assistant: [Calls species_get_receipt with eventId: "evt-1699180200-abc123"]
Response: 
"📋 TRANSACTION RECEIPT INTERPRETATION
═══════════════════════════════════════
Event ID: evt-1699180200-abc123
Status: ✅ COMPLETED
Transaction Type: BUY_TREASURY

From: usr-buyer-123
  Starting Balance: 0 SPECIES
  Ending Balance: 1,000 SPECIES
  
To: treasury
  Ending Balance: ∞ SPECIES

Amount Transferred: 1,000 SPECIES

💳 PAYMENT VERIFICATION:
Provider: NOWPayments
Amount: 10 USDT
Confirmations: 15
Payment ID: npmt_456789

💰 FEE BREAKDOWN:
Issuance Fee: $0.01 USDT
TOTAL FEES: $0.01 USDT

📝 SUMMARY:
Successfully purchased 1,000 SPECIES from the treasury. The tokens have been delivered to usr-buyer-123's vault."
```

### Example 2: Create Market Listing (Sell SPECIES)

```
User: "I want to sell 5000 SPECIES on the market for 0.012 USDT each"
Assistant: "I'll help you create a market listing. First, have you paid the $100 listing fee?"

User: "Yes, payment proof is npmt_listing_789"
Assistant: [Calls species_create_transaction with:
  from: "usr-seller-456"
  to: "marketplace"
  amount: 5000
  feeProof: "npmt_listing_789"
  usdtAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
  chain: "TRON"
]
Response: "Transaction created successfully!
Event ID: evt-1699180300-def456
Status: ACCEPTED

Your listing is being created:
- Amount: 5,000 SPECIES
- Price: 0.012 USDT per SPECIES
- Total Value: 60 USDT
- Proceeds will go to: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

User: "Get my listing receipt"
Assistant: [Calls species_get_receipt]
Response: "Your listing is now ACTIVE and will expire in 48 hours. 
Your 5,000 SPECIES are locked in escrow until the listing is filled or expires."
```

### Example 3: Buy from Market Listing

```
User: "Buy SPECIES from listing lst_789xyz, I have proof npmt_market_555"
Assistant: [Calls species_create_transaction with:
  from: "usr-buyer-789"
  to: "usr-seller-456"
  amount: 2000  
  paymentProof: "npmt_market_555"
  listingId: "lst_789xyz"
]
Response: "Market purchase initiated!
Event ID: evt-1699180400-ghi789

Buying 2,000 SPECIES from listing lst_789xyz
Payment proof verified: npmt_market_555"

User: "Check if it completed"
Assistant: [Calls species_get_receipt]
Response: "✅ Purchase COMPLETED!
You bought 2,000 SPECIES at 0.012 USDT each (24 USDT total)
Tokens transferred from seller's locker to your vault."
```

### Example 4: P2P Transfer (No Payment)

```
User: "Transfer 500 SPECIES to my friend usr-friend-999"
Assistant: [Calls species_create_transaction with:
  from: "usr-me-111"
  to: "usr-friend-999"
  amount: 500
]
Response: "P2P Transfer created!
Event ID: evt-1699180500-jkl012

Transferring 500 SPECIES from usr-me-111 to usr-friend-999
No payment required for P2P transfers."

User: "Did it go through?"
Assistant: [Calls species_get_receipt]
Response: "✅ Transfer COMPLETED!
500 SPECIES successfully transferred to usr-friend-999
No fees charged for P2P transfers."
```

### Example 5: Failed Transaction (Insufficient Payment)

```
User: "Buy 10000 SPECIES from treasury with proof npmt_bad_111"
Assistant: [Calls species_create_transaction]
Response: "Transaction submitted: evt-1699180600-mno345"

User: "Check status"
Assistant: [Calls species_get_receipt]
Response: "❌ Transaction FAILED

Error Code: PAY001
Message: Payment verification failed - insufficient amount
Details: Payment proof npmt_bad_111 shows 50 USDT but 100 USDT required

The transaction has been cancelled. Please submit a new transaction with correct payment."
```

## Understanding Receipts

### Key Receipt Fields Explained

| Field | Meaning |
|-------|---------|
| **eventId** | Unique transaction identifier |
| **status** | PENDING → PROCESSING → COMPLETED or FAILED |
| **intent** | BUY_TREASURY, BUY_MARKET, SELL_MARKET, or TRANSFER |
| **from/to** | OnliIDs and balance changes |
| **payments** | USDT payment verification details |
| **fees** | Breakdown of all fees charged |
| **timestamps** | Complete timeline of processing |
| **error** | Details if transaction failed |

### Status Flow

1. **ACCEPTED** - Request received and validated
2. **PENDING** - Waiting for payment verification
3. **PROCESSING** - Payment verified, executing transaction
4. **COMPLETED** - Successfully finished
5. **FAILED** - Error occurred (see error details)

## Common Patterns

### Check Before Trading
```
User: "What happens if I buy 5000 SPECIES?"
Assistant: "To buy 5000 SPECIES from treasury:
- Cost: 50 USDT (at 0.01 USDT per SPECIES)
- Issuance fee: 0.05 USDT
- Total needed: 50.05 USDT
- You'll need a payment proof from NOWPayments or a blockchain transaction"
```

### Verify Payment First
```
User: "I want to buy SPECIES"
Assistant: "Have you already made the USDT payment? I'll need the payment proof to create the transaction."
User: "Not yet"
Assistant: "First, make the USDT payment through NOWPayments or directly on-chain, then provide me with the payment proof (starts with 'npmt_' or a transaction hash)."
```

### Understand Listing Fees
```
User: "List 3000 SPECIES for sale"
Assistant: "Note: The minimum listing amount is 5000 SPECIES and requires a $100 USDT listing fee. You currently want to list 3000, which is below the minimum."
```

## Error Recovery

### Invalid Credentials
```
Error: "AUTH001: Invalid API key"
Solution: Reconfigure with correct credentials using species_configure
```

### Payment Already Used
```
Error: "PAY002: Payment proof already used"
Solution: Each payment proof can only be used once. Create a new payment.
```

### Insufficient Balance
```
Error: "VAL002: Insufficient SPECIES balance"
Solution: Check your balance and adjust the amount
```

## Best Practices

1. **Always configure first** - Set up credentials before any transactions
2. **Verify payments** - Ensure payment proofs are valid before submitting
3. **Check minimums** - 5000 SPECIES minimum for listings
4. **Understand fees** - Listing fee ($100), issuance fee ($0.01/SPECIES)
5. **Save event IDs** - Keep track of all transaction IDs for reference
6. **Monitor status** - Check receipts to confirm completion
