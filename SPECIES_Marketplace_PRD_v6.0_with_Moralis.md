# SPECIES Marketplace - Production Requirements Document v6.0
## With MCP Server, AI Assistant Integration, and Moralis Blockchain API

**Primary Domain**: species.market  
**Blockchain Verification**: Moralis Pro (Multi-chain)

---

## Executive Summary

The SPECIES Marketplace is a prepaid, event-driven digital asset exchange operating as an Onli Cloud Appliance. This PRD incorporates all architectural recommendations and adds Model Context Protocol (MCP) server integration, enabling AI assistants to interact with the marketplace on behalf of users through secure, authenticated transactions.

**Version**: 6.0 (With MCP and Moralis Integration)  
**Status**: Ready for Implementation  
**Timeline**: 8 days (with AI agents)  
**Key Additions**: MCP Server for AI assistants, Moralis for blockchain verification  
**Domain**: species.market

---

## 1. System Overview

### 1.1 Architecture Principles

- **Prepaid Settlement**: All transactions require upfront payment verification
- **Event-Driven**: Asynchronous, loosely-coupled microservices
- **No Custody**: Marketplace never holds user assets
- **Dual Verification**: Payment verification through both processor and blockchain
- **Complete Accounting**: Firefly-based double-entry bookkeeping
- **AI-Enabled**: MCP server allows AI assistants to execute transactions with user credentials

### 1.2 Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPECIES Marketplace                           │
│                  (Onli Cloud Appliance)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ ProfileTray  │    │   Firefly    │    │Payment Providers│
│(User Mgmt)   │    │(Accounting)  │    │(NOWPayments/TRON)│
└──────────────┘    └──────────────┘    └──────────────┘

Services Pipeline:
Authenticator → MarketplaceAPI → Validator → Classifier → Matching 
    → Cashier → AssetManager → FloorManager → Reporter

AI Integration Layer:
┌──────────────┐         ┌──────────────┐
│AI Assistants │ ──MCP─→ │  MCP Server  │ ──HMAC─→ MarketplaceAPI
│(Claude, etc.)│         │(Signing Proxy)│
└──────────────┘         └──────────────┘
```

### 1.3 Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | Go | 1.23+ |
| Database | PostgreSQL | 15+ |
| Cache | Redis | 7+ |
| Message Queue | Redis Streams/NATS | Latest |
| Accounting | Firefly III | Latest |
| Monitoring | OpenTelemetry + Prometheus | Latest |
| API Gateway | Kong/Nginx | Latest |
| Container | Docker | 24+ |
| Orchestration | Kubernetes/Docker Compose | Latest |
| MCP Server | Model Context Protocol SDK | 0.5.0+ |
| AI Integration | MCP + HMAC Auth | Latest |
| Blockchain API | Moralis Pro | 2.0+ |
| Multi-chain Support | ETH, BSC, TRON, Polygon | Latest |

---

## 2. Functional Requirements

### 2.1 Core Transaction Types

| Type | Description | Payment | Asset Flow |
|------|-------------|---------|------------|
| **ISSUE** | Buy from Treasury | USDT → Assurance | Treasury → User |
| **BUY_MARKET** | Buy from listing | USDT → Seller | Locker → Buyer |
| **SELL_MARKET** | Create listing | Listing fee | User → Locker |
| **TRANSFER** | P2P transfer | None | Sender → Receiver |
| **REDEEM** | Sell to LP | Assurance → User | User → LP |

### 2.2 Service Responsibilities

1. **Authenticator**: Security gate with dual-credential validation
2. **Marketplace API**: Request ingestion with idempotency
3. **Validator**: Payment proof verification (Moralis + NOWPayments dual-path)
4. **Classifier**: Intent routing
5. **Matching Service**: Order resolution
6. **Cashier**: Ledger management (Firefly)
7. **Asset Manager**: Onli Cloud operations
8. **Floor Manager**: Final reconciliation
9. **Reporter**: Read-only projections
10. **Configuration Module**: Runtime settings
11. **MCP Server**: AI assistant integration with HMAC signing proxy

---

## 3. Technical Specifications

### 3.1 Database Schemas

```sql
-- Marketplace Users (synced from ProfileTray)
CREATE TABLE marketplace_users (
    marketplace_user_id UUID PRIMARY KEY,
    onli_id VARCHAR(255) UNIQUE NOT NULL,
    vault_id VARCHAR(255),
    api_key_id UUID,
    status VARCHAR(20) NOT NULL,
    profile_tray_ref VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    last_sync TIMESTAMP,
    INDEX idx_onli_id (onli_id),
    INDEX idx_api_key (api_key_id),
    INDEX idx_status (status)
);

-- Event Ingress (idempotency)
CREATE TABLE event_ingress (
    event_id UUID PRIMARY KEY,
    body_hash VARCHAR(64) NOT NULL,
    raw_body TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    UNIQUE INDEX idx_event_body (event_id, body_hash)
);

-- Listings
CREATE TABLE listings (
    listing_id UUID PRIMARY KEY,
    ask_to_move_id VARCHAR(255) UNIQUE,
    seller_onli_id VARCHAR(255) NOT NULL,
    amount DECIMAL(20,0) NOT NULL,
    price_usdt DECIMAL(20,6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    filled_amount DECIMAL(20,0) DEFAULT 0,
    INDEX idx_status_expires (status, expires_at),
    INDEX idx_seller (seller_onli_id)
);

-- Match Reservations
CREATE TABLE match_reservations (
    match_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    listing_id UUID REFERENCES listings(listing_id),
    buyer_onli_id VARCHAR(255) NOT NULL,
    seller_onli_id VARCHAR(255) NOT NULL,
    amount DECIMAL(20,0) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_event (event_id),
    INDEX idx_status (status)
);

-- API Keys
CREATE TABLE api_keys (
    api_key_id UUID PRIMARY KEY,
    marketplace_user_id UUID REFERENCES marketplace_users(marketplace_user_id),
    key_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    last_used TIMESTAMP,
    revoked_at TIMESTAMP,
    UNIQUE INDEX idx_key_hash (key_hash)
);
```

### 3.2 Caching Strategy

```go
type CacheConfig struct {
    UserProfiles struct {
        TTL      time.Duration // 5 minutes
        MaxSize  int          // 10000 entries
        Strategy string       // LRU
    }
    VaultMappings struct {
        TTL      time.Duration // 1 hour
        MaxSize  int          // 5000 entries
        Strategy string       // LRU
    }
    PaymentProofs struct {
        TTL      time.Duration // 10 minutes
        MaxSize  int          // 1000 entries
        Strategy string       // FIFO
    }
    Listings struct {
        TTL      time.Duration // 48 hours
        MaxSize  int          // 10000 entries
        Strategy string       // TTL-based
    }
}
```

### 3.3 Moralis Integration

```typescript
// Blockchain Verification Configuration
interface MoralisConfig {
    apiKey: string;
    baseUrl: 'https://deep-index.moralis.io/api/v2';
    rateLimit: 3500; // RPS on Pro plan
    supportedChains: ['ETH', 'BSC', 'TRON', 'POLYGON'];
}

// Multi-chain Transaction Verification
interface VerificationFlow {
    primary: 'moralis';      // Blockchain truth
    fallback: 'nowpayments';  // Payment processor
    cache: 'upstash';        // 5-minute TTL
    confirmations: {
        ETH: 12,
        BSC: 15,
        TRON: 19,
        POLYGON: 100
    };
}

// Webhook Streams
interface MoralisStreams {
    usdtPayments: {
        chains: ['0x1', '0x38', '0x89'];
        contracts: ['USDT_ADDRESSES'];
        webhook: 'https://api.species.market/webhooks/moralis';
    };
}
```

### 3.4 Connection Pooling

```go
type PoolConfig struct {
    PostgreSQL struct {
        MaxIdleConns    int           // 10
        MaxOpenConns    int           // 100
        ConnMaxLifetime time.Duration // 1 hour
        ConnMaxIdleTime time.Duration // 10 minutes
    }
    Redis struct {
        PoolSize        int           // 50
        MinIdleConns    int           // 10
        MaxRetries      int           // 3
        DialTimeout     time.Duration // 5 seconds
    }
    HTTPClient struct {
        MaxIdleConns        int           // 100
        MaxIdleConnsPerHost int           // 10
        IdleConnTimeout     time.Duration // 90 seconds
        Timeout            time.Duration // 30 seconds
    }
}
```

### 3.4 Rate Limiting

```go
type RateLimiter struct {
    Global struct {
        RequestsPerSecond int // 1000
        BurstSize        int // 2000
    }
    PerAPIKey struct {
        RequestsPerSecond int // 10
        BurstSize        int // 20
    }
    PerEndpoint map[string]struct {
        RequestsPerSecond int
        BurstSize        int
    }
}
```

---

## 4. API Specifications

### 4.1 Request/Response Formats

```typescript
// Standard Error Response
interface ErrorResponse {
    error: {
        code: string;
        message: string;
        details?: any;
        timestamp: string;
        event_id?: string;
    };
}

// Pagination Envelope
interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        per_page: number;
        has_next: boolean;
        next_cursor?: string;
    };
}

// Rate Limit Headers
interface RateLimitHeaders {
    'X-RateLimit-Limit': string;
    'X-RateLimit-Remaining': string;
    'X-RateLimit-Reset': string;
    'X-RateLimit-Burst': string;
}
```

### 4.2 Webhook Security

```go
type WebhookConfig struct {
    NOWPayments struct {
        SignatureHeader string // "X-NOWPayments-Sig"
        Secret         string
        Algorithm      string // "HMAC-SHA512"
    }
    ReplayProtection struct {
        WindowSeconds  int // 300 (5 minutes)
        NonceCache     string // Redis key
    }
}
```

### 4.3 MCP Server API

```typescript
// MCP Tools Available
interface MCPTools {
    // Configuration tool - stores credentials for session
    species_configure: {
        apiKey: string;      // User's marketplace API key
        secret: string;      // User's secret from ProfileTray
        marketplaceUrl?: string; // Optional custom URL
    };
    
    // Transaction creation - single authenticated call
    species_create_transaction: {
        from: string;        // Sender's onliId
        to: string;          // Recipient's onliId or "treasury"
        amount: number;      // SPECIES amount
        paymentProof?: string; // USDT payment proof (npmt_xxx or tx hash)
        feeProof?: string;   // Listing fee proof if applicable
        chain?: 'TRON' | 'ETH' | 'BSC';
        usdtAddress?: string; // For SELL_MARKET operations
        listingId?: string;  // For BUY_MARKET operations
    };
    
    // Receipt retrieval and interpretation
    species_get_receipt: {
        eventId: string;     // Transaction event ID
    };
}

// MCP Authentication Flow
// 1. User provides API key + secret to MCP
// 2. MCP creates HMAC signature: SHA256(body + nonce + timestamp, secret)
// 3. MCP sends single authenticated request
// 4. Marketplace returns receipt
// 5. MCP interprets receipt for human understanding
```

---

## 5. Monitoring & Observability

### 5.1 Metrics

```yaml
# Business Metrics
business_metrics:
  - name: transaction_volume_total
    type: counter
    labels: [type, status]
    
  - name: transaction_value_usd
    type: counter
    labels: [type]
    
  - name: active_listings_total
    type: gauge
    labels: [status]
    
  - name: user_balance_species
    type: gauge
    labels: [user_class]

# Performance Metrics
performance_metrics:
  - name: request_duration_seconds
    type: histogram
    labels: [service, method, status]
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10]
    
  - name: event_processing_duration_seconds
    type: histogram
    labels: [event_type, stage]
    
  - name: payment_verification_duration_seconds
    type: histogram
    labels: [provider, status]

# System Metrics
system_metrics:
  - name: cache_hit_ratio
    type: gauge
    labels: [cache_name]
    
  - name: database_connections_active
    type: gauge
    labels: [pool]
    
  - name: event_queue_depth
    type: gauge
    labels: [topic]
```

### 5.2 Alerts

```yaml
alerts:
  - name: HighErrorRate
    expr: rate(request_total{status=~"5.."}[5m]) > 0.01
    severity: critical
    action: page
    
  - name: PaymentVerificationFailure
    expr: rate(payment_verification_total{status="failed"}[5m]) > 0.05
    severity: high
    action: notify
    
  - name: SlowTransactionProcessing
    expr: histogram_quantile(0.95, request_duration_seconds) > 3
    severity: warning
    action: investigate
    
  - name: LowCacheHitRate
    expr: cache_hit_ratio < 0.8
    severity: info
    action: optimize
```

---

## 6. Deployment Configuration

### 6.1 Environment Variables

```bash
# Application
APP_ENV=production
APP_SYMBOL=SPECIES
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/species
DATABASE_MAX_CONNECTIONS=100
DATABASE_TIMEOUT=30s

# Redis
REDIS_URL=redis://localhost:6379
REDIS_POOL_SIZE=50

# ProfileTray
PROFILETRAY_BASE_URL=https://profiletray.species.io
PROFILETRAY_API_KEY=${PROFILETRAY_API_KEY}
PROFILETRAY_APP_KEY=${PROFILETRAY_APP_KEY}
PROFILETRAY_SYNC_INTERVAL=5m

# Payment Providers
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1
NOWPAYMENTS_API_KEY=${NOW_API_KEY}
NOWPAYMENTS_API_SECRET=${NOW_SECRET}

# TRON
TRON_API_URL=https://api.trongrid.io
TRON_API_KEY=${TRON_API_KEY}
USDT_CONTRACT_ADDRESS=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

# Onli Cloud
ONLI_CLOUD_BASE_URL=https://api.onlicloud.com/v1
ONLI_CLOUD_API_KEY=${ONLI_API_KEY}
ONLI_CLOUD_MASTER_ID=${ONLI_MASTER_ID}

# Firefly
FIREFLY_DSN=postgresql://firefly:pass@localhost:5432/firefly
FIREFLY_SCHEMA=species

# Monitoring
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
PROMETHEUS_PORT=9090
```

### 6.2 Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: species
      POSTGRES_USER: species
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U species"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  authenticator:
    build: ./services/authenticator
    environment:
      - APP_ENV
      - DATABASE_URL
      - REDIS_URL
      - PROFILETRAY_BASE_URL
    depends_on:
      - postgres
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  marketplace-api:
    build: ./services/marketplace-api
    ports:
      - "8080:8080"
    environment:
      - APP_ENV
      - DATABASE_URL
      - REDIS_URL
    depends_on:
      - authenticator
      - postgres
      - redis

  # ... other services ...

volumes:
  postgres_data:
  redis_data:
```

---

## 7. Testing Strategy

### 7.1 Unit Testing

```go
// Required coverage: 80% minimum
// Critical paths: 100% coverage

func TestAuthenticator_ValidateHMAC(t *testing.T) {
    // Test cases:
    // - Valid signature
    // - Invalid signature
    // - Expired timestamp
    // - Replay attack
    // - Missing headers
}

func TestValidator_DualPathVerification(t *testing.T) {
    // Test cases:
    // - NOWPayments success
    // - NOWPayments failure → TRON fallback
    // - Both paths fail
    // - Invalid proof format
    // - Insufficient confirmations
}
```

### 7.2 Integration Testing

```go
// Critical flows to test end-to-end:
// 1. Complete ISSUE flow
// 2. Complete BUY_MARKET flow
// 3. Payment failure recovery
// 4. ProfileTray sync disruption
// 5. Listing expiration
```

### 7.3 Load Testing

```yaml
scenarios:
  - name: Normal Load
    users: 100
    duration: 10m
    rps: 10
    
  - name: Peak Load
    users: 1000
    duration: 5m
    rps: 100
    
  - name: Stress Test
    users: 5000
    duration: 2m
    rps: 500

targets:
  - p95_latency: <3s
  - success_rate: >99.9%
  - error_rate: <0.1%
```

---

## 8. Security Checklist

- [ ] HMAC signature validation on all requests
- [ ] Rate limiting per API key
- [ ] Webhook signature verification
- [ ] SQL injection prevention
- [ ] XSS protection on all outputs
- [ ] Secrets management (no hardcoded)
- [ ] TLS 1.3 for all connections
- [ ] Audit logging for all operations
- [ ] PII encryption at rest
- [ ] Regular security scanning

---

## 9. Implementation Timeline (AI Agent Execution)

### Day 0-1: Foundation (12 hours)
- Set up development environment with Fly.io
- Deploy PostgreSQL and Redis on Upstash
- Configure Moralis Pro account
- Implement Authenticator with ProfileTray
- Create Marketplace API with idempotency
- Implement Validator with Moralis dual-path verification
- Set up basic monitoring

### Day 2-3: Core Services (16 hours)
- Implement Classifier with declarative rules
- Create Matching Service with order book
- Implement Cashier with Firefly III
- Setup Moralis webhook streams
- Basic Reporter endpoints
- Integration testing with all chains

### Day 4-5: Asset Operations (16 hours)
- Implement Asset Manager with Onli Cloud gRPC
- Create Floor Manager for reconciliation
- Complete Reporter with caching
- **Implement MCP Server on Vercel**
- End-to-end testing across all chains
- Performance optimization

### Day 6-8: Production (20 hours)
- Load testing including MCP endpoints and Moralis
- Security audit with MCP authentication review
- Documentation including MCP usage guides
- Deployment setup with MCP server on Vercel
- AI assistant integration testing
- Multi-chain verification testing
- Launch preparation

---

## 10. MCP Server Integration

### 10.1 Overview

The Model Context Protocol (MCP) server enables AI assistants to interact with the SPECIES Marketplace on behalf of users, providing a secure bridge between AI capabilities and blockchain transactions.

### 10.2 Core Functionality

#### Authentication Flow
1. **User provides credentials**: API key from Marketplace, secret from ProfileTray
2. **MCP creates HMAC signature**: SHA256(body + nonce + timestamp, secret)
3. **Single authenticated API call**: One request per transaction
4. **Receipt interpretation**: Human-readable explanation of results

#### Available Operations
- **Configure**: Store user credentials for session
- **Create Transaction**: Execute any transaction type
- **Get Receipt**: Retrieve and interpret transaction results

### 10.3 Security Model

```
User Credentials (never stored)
    ↓
MCP Server (signing proxy)
    ↓
HMAC-SHA256 Signature
    ↓
Marketplace API (single call)
    ↓
Transaction Receipt
    ↓
Human-readable Interpretation
```

### 10.4 Integration Benefits

- **AI Accessibility**: Natural language transaction creation
- **Security**: Credentials never stored, only used for signing
- **Simplicity**: Single API call per transaction
- **Clarity**: Receipt interpretation for user understanding
- **Compliance**: Full audit trail of AI-initiated transactions

### 10.5 Use Cases

1. **Conversational Trading**: "Buy 1000 SPECIES from treasury"
2. **Portfolio Management**: "Transfer 500 SPECIES to friend"
3. **Market Making**: "Create listing for 5000 SPECIES at 0.01 USDT"
4. **Transaction Tracking**: "Check my transaction status"

### 10.6 Technical Requirements

- MCP SDK version 0.5.0+
- HMAC-SHA256 signing capability
- Stateless operation (no credential storage)
- Receipt parsing and interpretation logic
- Rate limiting (10 RPS per user)

---

## 11. Success Metrics

### Technical KPIs
- System uptime: >99.95%
- Transaction success rate: >99.9%
- P95 latency: <3 seconds
- Zero custody incidents
- **MCP response time: <1 second**
- **MCP authentication success: >99.9%**
- **Moralis API availability: >99.9%**
- **Multi-chain verification success: >99.95%**

### Business KPIs
- Daily active users: 1,000+
- Transaction volume: $1M+/month
- Average transaction time: <60 seconds
- User satisfaction: >4.5/5
- **AI-initiated transactions: 20%+ of volume**
- **MCP adoption rate: 30%+ of users**

---

## Appendices

### A. Glossary
- **Appliance**: An application registered on Onli Cloud
- **ProfileTray**: User management service
- **Firefly**: Double-entry accounting system
- **Settlement Locker**: Temporary asset holding area
- **Vault**: User's asset storage in Onli Cloud

### B. Error Codes
| Code | Description |
|------|-------------|
| AUTH001 | Invalid API key |
| AUTH002 | Invalid signature |
| AUTH003 | User not active |
| PAY001 | Payment not verified |
| PAY002 | Insufficient confirmations |
| MATCH001 | No matching order |
| ASSET001 | Transfer failed |
| MCP001 | MCP credentials not configured |
| MCP002 | MCP signature verification failed |
| MCP003 | MCP rate limit exceeded |

### C. References
- Onli Cloud API Documentation (onlicloud.com)
- ProfileTray Integration Guide (profiletray.com)
- Firefly III Documentation
- NOWPayments API Reference
- Moralis API Documentation (docs.moralis.com)
- Model Context Protocol Specification
- MCP SDK Documentation

---

**Document Version**: 6.0  
**Last Updated**: November 2024  
**Status**: Approved for Implementation with MCP and Moralis Integration  
**Key Additions**: 
- Model Context Protocol (MCP) server for AI assistant integration
- Moralis Pro for multi-chain blockchain verification
- 8-day AI agent implementation timeline
- Primary domain: species.market
