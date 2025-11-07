# SPECIES Marketplace

#  - Provider Requirements Document

## Detailed Technical & Business Requirements for External Services

---

## Executive Summary

This document outlines the complete requirements for external service providers needed to deploy and operate the SPECIES Marketplace at **species.market**. Each provider section includes technical specifications, business requirements, setup prerequisites, and cost estimates.

---

## 1. Fly.io - Primary Infrastructure Provider

### Account Requirements

```yaml
account_type: "Organization"
organization_name: "species-marketplace"
billing_plan: "Pay-as-you-go" # Start with this, upgrade as needed
payment_method: "Credit Card"
estimated_monthly: "$270-$350"
```

### Technical Requirements

```yaml
services_needed:
  compute:
    - 10x Go microservices
    - 1x NATS JetStream cluster (3 nodes)
    - 1x Firefly III instance
    
  databases:
    - PostgreSQL 15+ cluster
    - 3x replicas (iad, lax, fra regions)
    - 10GB initial storage (auto-scaling)
    
  networking:
    - Private networking between services
    - IPv6 support
    - Custom domains support
    - SSL certificates (Let's Encrypt)
    
  storage:
    - Persistent volumes for NATS (10GB x3)
    - PostgreSQL data (10GB, expandable)
    - Application logs (5GB)

regions_required:
  primary: "iad" # Washington DC
  secondary: "lax" # Los Angeles
  tertiary: "fra" # Frankfurt
  
minimum_resources_per_service:
  cpu: "shared-cpu-1x" # 1 shared CPU
  memory: "256MB"
  scaling: "horizontal" # 1-10 instances
```

### Setup Prerequisites

```bash
# Required CLI tools
fly auth signup
fly auth login

# Required permissions
- Create organizations
- Create applications  
- Manage secrets
- Deploy applications
- Create volumes
- Manage databases

# Initial setup commands
fly orgs create species-marketplace
fly wireguard create species-marketplace

# API Access needed
FLY_API_TOKEN="required for CI/CD"
```

### Service Configuration

```toml
# Example fly.toml for each service
app = "species-authenticator"
primary_region = "iad"

[build]
  builder = "paketobuildpacks/builder:base"
  buildpacks = ["gcr.io/paketo-buildpacks/go"]

[env]
  GO_VERSION = "1.23"
  PORT = "8080"

[services]
  internal_port = 8080
  protocol = "tcp"
  auto_stop_machines = true
  auto_start_machines = true
  
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
  
  [[services.ports]]
    port = 80
    handlers = ["http"]

[services.concurrency]
  type = "requests"
  hard_limit = 250
  soft_limit = 200

[[services.tcp_checks]]
  grace_period = "10s"
  interval = "15s"
  restart_limit = 3
  timeout = "2s"

[[services.http_checks]]
  interval = "10s"
  grace_period = "5s"
  method = "GET"
  path = "/health"
  timeout = "2s"

[metrics]
  port = 9091
  path = "/metrics"
```

### Monitoring & Observability

```yaml
required_metrics:
  - CPU utilization
  - Memory usage
  - Request rate
  - Response times
  - Error rates
  - Network I/O

logging:
  - Structured JSON logs
  - Log shipping to aggregator
  - 7-day retention minimum

monitoring_endpoints:
  - /health (liveness)
  - /ready (readiness)
  - /metrics (Prometheus)
```

---

## 2. Vercel - MCP Server & Edge Functions

### Account Requirements

```yaml
account_type: "Pro" # Required for commercial use
team_name: "species-marketplace"
billing_plan: "Pro - $20/month"
payment_method: "Credit Card"
estimated_monthly: "$25-30"
```

### Technical Requirements

```yaml
project_configuration:
  framework: "Next.js 14+"
  runtime: "Edge Runtime"
  regions: ["iad1", "sfo1", "fra1"] # Multi-region
  
functions:
  - path: "/api/mcp/*"
    runtime: "edge"
    maxDuration: 10 # seconds
    memory: 1024 # MB
    
environment_variables:
  - MARKETPLACE_URL (encrypted)
  - UPSTASH_REDIS_REST_URL (encrypted)
  - UPSTASH_REDIS_REST_TOKEN (encrypted)
  - RATE_LIMIT_MAX (10)
  
domains:
  custom: "mcp.species.io"
  ssl: "automatic"
  
build_settings:
  output_directory: ".next"
  install_command: "npm install"
  build_command: "npm run build"
  
performance:
  edge_functions_included: 1000000/month
  bandwidth_included: 100GB/month
  build_minutes: 6000/month
```

### API Requirements

```typescript
// Required Vercel configuration
export const config = {
  runtime: 'edge',
  regions: ['iad1', 'sfo1', 'fra1'],
  maxDuration: 10,
};

// KV Storage requirements
interface VercelKV {
  ttl: number; // 3600 seconds for sessions
  maxKeys: 100000;
  maxRequestSize: '256KB';
  consistency: 'eventual';
}
```

### Deployment Requirements

```bash
# CLI Setup
npm i -g vercel
vercel login

# Required permissions
- Deploy to production
- Manage environment variables
- Configure domains
- Access analytics

# Deployment commands
vercel --prod
vercel env pull
vercel domains add mcp.species.io
```

---

## 3. Upstash Redis - Global Cache & Session Store

### Account Requirements

```yaml
account_type: "Pay-as-you-go"
billing_email: "billing@species.io"
payment_method: "Credit Card"
estimated_monthly: "$50-80"
regions: "Global"
```

### Technical Requirements

```yaml
database_configuration:
  name: "species-marketplace-prod"
  type: "Global" # Replicated globally
  regions: 
    - "us-east-1" # Primary
    - "us-west-1"
    - "eu-west-1"
  
features_required:
  - TLS/SSL encryption
  - REST API access
  - Redis protocol support
  - Eviction policy: "allkeys-lru"
  - Max memory: "1GB"
  - Daily backups
  - Global replication
  
connection_options:
  - REST API (for Vercel Edge)
  - Redis protocol (for Fly.io)
  - TLS required: true
  
rate_limits:
  - Commands/sec: 10000
  - Bandwidth: 10GB/month
  - Max connections: 1000
  - Max request size: 1MB
```

### API Configuration

```typescript
// REST API Configuration
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  retry: {
    retries: 3,
    backoff: (attempt) => Math.min(attempt * 100, 3000)
  }
});

// Required operations
interface RequiredOperations {
  // Caching
  SET: 'with TTL support';
  GET: 'standard';
  DEL: 'standard';
  EXISTS: 'standard';
  
  // Session management
  SETEX: 'atomic set with expiry';
  EXPIRE: 'update TTL';
  
  // Rate limiting
  INCR: 'atomic increment';
  EXPIRE: 'for sliding windows';
  
  // Pub/Sub (optional)
  PUBLISH: 'for real-time updates';
  SUBSCRIBE: 'for event listening';
}
```

### Data Structure Requirements

```yaml
cache_keys:
  user_sessions:
    pattern: "session:{sessionId}"
    ttl: 3600
    size: "~1KB per session"
    
  api_cache:
    pattern: "cache:{endpoint}:{params}"
    ttl: 300
    size: "~5KB per response"
    
  rate_limiting:
    pattern: "rate:{ip}:{endpoint}"
    ttl: 60
    size: "~100 bytes"
    
  payment_verification:
    pattern: "payment:{proof}"
    ttl: 600
    size: "~2KB"

estimated_storage:
  concurrent_sessions: 1000
  cached_responses: 10000
  total_size: "~100MB"
```

---

## 4. NOWPayments - Payment Processing

### Account Requirements

```yaml
account_type: "Business"
business_name: "SPECIES Marketplace"
kyc_required: true
verification_documents:
  - Business registration
  - Tax ID
  - Proof of address
  - Bank account details

supported_currencies:
  crypto:
    - USDT (TRC20)
    - USDT (ERC20)
  
payout_settings:
  min_amount: "$10"
  frequency: "On-demand"
  processing_time: "24 hours"
  
estimated_volume: "$100,000/month"
transaction_fee: "0.5-1%"
```

### API Requirements

```yaml
api_version: "v1"
authentication: "API Key"
rate_limits:
  - Requests/second: 10
  - Daily requests: 100000

required_endpoints:
  payment_verification:
    endpoint: "GET /v1/payment/{payment_id}"
    response_time: "< 2 seconds"
    
  payment_status:
    endpoint: "GET /v1/payment/status/{payment_id}"
    response_time: "< 1 second"
    
  create_invoice:
    endpoint: "POST /v1/invoice"
    response_time: "< 3 seconds"
    
  webhook_notifications:
    endpoint: "POST /your-webhook-url"
    events:
      - payment_created
      - payment_updated
      - payment_completed
      - payment_failed

security:
  webhook_signature: "HMAC-SHA512"
  ip_whitelist: ["Fly.io IPs"]
  tls_version: "1.2+"
```

### Integration Configuration

```go
// NOWPayments client configuration
type NOWPaymentsConfig struct {
    APIKey          string
    WebhookSecret   string
    MinConfirmations int    // 3 for TRON
    Timeout         time.Duration
    RetryAttempts   int
}

// Required callbacks
type PaymentCallbacks struct {
    OnPaymentCreated   func(payment Payment)
    OnPaymentConfirmed func(payment Payment)
    OnPaymentFailed    func(payment Payment, error error)
}
```

---

## 5. Moralis - Blockchain Verification & Web3 Data

### Account Requirements

```yaml
account_type: "Pro Plan"
api_plan: "Pro" 
rate_limit: "3,500 RPS (Requests Per Second)"
monthly_requests: "Unlimited on Pro"
estimated_cost: "$99-249/month"
documentation: "https://docs.moralis.com"
```

### API Requirements

```yaml
required_endpoints:
  # EVM Chains (USDT on Ethereum, BSC)
  evm_transaction:
    endpoint: "GET /transaction/{hash}"
    chains: ["eth", "bsc"]
    response_fields:
      - hash
      - from_address
      - to_address
      - value
      - confirmed
      - block_number
      - block_timestamp
      
  erc20_transfers:
    endpoint: "GET /erc20/transfers"
    params: ["address", "chain", "contract_addresses"]
    usdt_contracts:
      ethereum: "0xdac17f958d2ee523a2206206994597c13d831ec7"
      bsc: "0x55d398326f99059ff775485246999027b3197955"
    
  # TRON Chain Support (via Moralis Streams)
  tron_transaction:
    endpoint: "GET /tron/transaction/{hash}"
    response_fields:
      - txID
      - raw_data
      - contract_data
      - confirmed
      
  # Webhook Streams for Real-time
  webhook_streams:
    endpoint: "POST /streams/evm"
    monitor:
      - USDT transfers to treasury address
      - Specific wallet activities
      - Contract events
      
verification_requirements:
  confirmations:
    ethereum: 12
    bsc: 15
    tron: 19
  timeout: "30 seconds"
  retry_strategy: "exponential backoff"
```

### Integration Configuration

```go
// Moralis client configuration
type MoralisConfig struct {
    APIKey          string
    BaseURL         string // https://deep-index.moralis.io/api/v2
    RateLimit       RateLimiter
    CircuitBreaker  CircuitBreakerConfig
    Cache           CacheConfig
}

// Multi-chain verification
func VerifyPayment(proof string, chain string, expectedAmount float64) (*Verification, error) {
    switch chain {
    case "TRON":
        return verifyTronTransaction(proof, expectedAmount)
    case "ETH":
        return verifyEthTransaction(proof, expectedAmount)  
    case "BSC":
        return verifyBscTransaction(proof, expectedAmount)
    default:
        return nil, fmt.Errorf("unsupported chain: %s", chain)
    }
}

// Moralis-specific features
type MoralisFeatures struct {
    // Real-time webhooks
    WebhookURL string
    
    // NFT support (future SPECIES NFTs)
    NFTIndexing bool
    
    // Token price feeds
    PriceFeeds bool
    
    // Wallet activity monitoring
    WalletWatch []string
}
```

### Webhook Configuration

```yaml
webhook_setup:
  url: "https://api.species.market/webhooks/moralis"
  secret: "WEBHOOK_SECRET"
  
  streams:
    - name: "USDT_Payments"
      description: "Monitor USDT transfers to treasury"
      chains: ["0x1", "0x38", "0x2b6653dc"] # ETH, BSC, TRON
      topic: "Transfer(address,address,uint256)"
      filters:
        - to: "TREASURY_ADDRESS"
        - contract: ["USDT_CONTRACTS"]
      
    - name: "User_Deposits"  
      description: "Track user payment proofs"
      includeNativeTxs: false
      includeContractLogs: true
```

### Fallback Configuration

```go
// Moralis with NOWPayments fallback
type DualVerification struct {
    Primary   *MoralisClient  // Blockchain verification
    Secondary *NOWPaymentsClient // Payment processor verification
}

func (dv *DualVerification) Verify(ctx context.Context, proof string) (*Result, error) {
    // Try Moralis first (most reliable)
    result, err := dv.Primary.VerifyTransaction(ctx, proof)
    if err == nil && result.Confirmed {
        return result, nil
    }
    
    // Fallback to NOWPayments
    return dv.Secondary.VerifyPayment(ctx, proof)
}
```

### Why Moralis for SPECIES

```yaml
advantages:
  multi_chain_support:
    - Single API for ETH, BSC, TRON, Polygon
    - Unified response format
    - No need for multiple blockchain APIs
    
  real_time_webhooks:
    - Instant payment notifications
    - No polling required
    - Guaranteed delivery with retries
    
  advanced_features:
    - Token price feeds (future SPECIES pricing)
    - NFT support (future SPECIES NFTs)
    - Wallet profiling and analytics
    - Transaction history across all chains
    
  reliability:
    - 99.9% uptime SLA
    - 3,500 RPS on Pro plan
    - Global infrastructure
    - Automatic failover
    
  developer_experience:
    - Excellent documentation
    - SDKs for multiple languages
    - Active Discord support
    - Regular updates
    
cost_comparison:
  moralis_pro: "$99-249/month for unlimited requests"
  alternative_stack:
    - TronScan: "$99/month"
    - Etherscan: "$199/month"  
    - BSCScan: "$199/month"
    - Total: "$497/month"
  savings: "50-80% cost reduction"
```

---

## 6. ProfileTray - User Management

### Integration Requirements

```yaml
api_type: "REST"
authentication: "Bearer Token"
base_url: "https://api.profiletray.com"
website: "https://profiletray.com"

required_permissions:
  - user.read
  - user.secret.read
  - user.metadata.read
  - user.balance.read

sync_requirements:
  frequency: "Every 5 minutes"
  batch_size: 1000
  fields_needed:
    - user_id
    - onli_id
    - vault_id
    - status
    - created_at
    - metadata

webhook_events:
  - user.created
  - user.updated
  - user.deleted
  - user.status_changed
```

### Data Sync Configuration

```go
type ProfileTraySyncConfig struct {
    APIToken        string
    SyncInterval    time.Duration
    BatchSize       int
    RetryPolicy     RetryPolicy
    WebhookSecret   string
}

// Sync operations
type SyncOperations interface {
    GetUser(onliID string) (*User, error)
    GetUserSecret(onliID string) (string, error)
    BulkSync(since time.Time) ([]*User, error)
    ValidateWebhook(payload, signature string) bool
}
```

---

## 7. Onli Cloud - Asset Management

### Integration Requirements

```yaml
protocol: "gRPC"
port: 50051
tls_required: true
authentication: "mTLS certificates"
website: "https://onlicloud.com"
support: "https://www.onli.support"

required_services:
  IssueService:
    - Issue()
    - GetIssueStatus()
    
  AssetService:
    - ChangeOwner()
    - Ask2Receive()
    - GetBalance()
    
  OracleService:
    - RevealGenomes()
    - VerifyOperation()
    
  AuthService:
    - AuthorizeBehavior()

connection_requirements:
  endpoint: "grpc.onlicloud.com:50051"
  max_message_size: "10MB"
  keepalive_time: "30s"
  keepalive_timeout: "10s"
  connection_pool_size: 10
  
certificates:
  client_cert: "Required from onli.support"
  client_key: "Required from onli.support"
  ca_cert: "Required from onli.support"
```

### gRPC Configuration

```go
// Onli Cloud connection config
type OnliCloudConfig struct {
    Address         string
    CertFile        string
    KeyFile         string
    CAFile          string
    MaxMessageSize  int
    PoolSize        int
    Timeout         time.Duration
    RetryPolicy     RetryPolicy
}

// Required operations
type OnliCloudOperations interface {
    Issue(ctx context.Context, req *IssueRequest) (*IssueResponse, error)
    ChangeOwner(ctx context.Context, req *ChangeOwnerRequest) (*ChangeOwnerResponse, error)
    Ask2Receive(ctx context.Context, req *Ask2ReceiveRequest) (*Ask2ReceiveResponse, error)
    RevealGenomes(ctx context.Context, req *RevealRequest) (*RevealResponse, error)
    AuthorizeBehavior(ctx context.Context, req *AuthRequest) (*AuthResponse, error)
}
```

---

## 8. Firefly III - Accounting System

### Deployment Requirements

```yaml
deployment_platform: "Fly.io"
container_image: "fireflyiii/core:latest"
database: "PostgreSQL (dedicated)"
storage: "5GB persistent volume"

environment_configuration:
  APP_ENV: "production"
  APP_DEBUG: "false"
  DB_CONNECTION: "pgsql"
  TRUSTED_PROXIES: "**"
  LOG_CHANNEL: "daily"
  APP_LOG_LEVEL: "notice"
  AUDIT_LOG_LEVEL: "info"
  
features_required:
  - REST API v1
  - Webhook support
  - Multi-currency
  - Double-entry accounting
  - Audit logging
  - Budget tracking
  - Report generation
```

### API Configuration

```yaml
api_authentication: "OAuth 2.0 / Personal Access Token"
required_scopes:
  - transactions.create
  - transactions.read
  - accounts.create
  - accounts.read
  - categories.manage

account_structure:
  asset_accounts:
    - "SPECIES_Inventory"
    - "USDT_Cash"
    
  liability_accounts:
    - "User_Balances"
    - "Pending_Settlements"
    
  revenue_accounts:
    - "Transaction_Fees"
    - "Listing_Fees"
    
  expense_accounts:
    - "Network_Fees"
    - "Processing_Costs"
```

---

## 9. Monitoring Stack Requirements

### Prometheus

```yaml
deployment: "Fly.io"
storage: "10GB volume"
retention: "30 days"
scrape_interval: "15s"

targets:
  - All 10 microservices
  - NATS cluster
  - PostgreSQL exporter
  - Redis exporter
  
required_exporters:
  - node_exporter
  - postgres_exporter
  - redis_exporter
  - nats_exporter
```

### Grafana

```yaml
deployment: "Fly.io"
authentication: "OAuth 2.0"
persistence: "5GB volume"

required_dashboards:
  - Service Overview
  - Transaction Flow
  - Payment Processing
  - Error Analysis
  - Performance Metrics
  
alerting_channels:
  - Email
  - Slack
  - PagerDuty (optional)
```

---

## 10. Domain & DNS Requirements

### Domain Provider

```yaml
required_domains:
  - species.market (PRIMARY DOMAIN)
  
subdomains:
  - api.species.market (Fly.io - Main API)
  - mcp.species.market (Vercel - MCP Server)
  - metrics.species.market (Prometheus)
  - grafana.species.market (Grafana Dashboard)
  - docs.species.market (Documentation)
  
dns_records:
  A_records:
    - api → Fly.io IP
    
  CNAME_records:
    - mcp → cname.vercel-dns.com
    - www → species.market
    
  TXT_records:
    - SPF record for email
    - DMARC record
    - Domain verification records
    
ssl_certificates:
  - Automatic via Let's Encrypt
  - Wildcard certificate for *.species.market
  - Auto-renewal enabled
```

---

## 11. CI/CD Platform Requirements

### GitHub Actions / GitLab CI

```yaml
required_runners:
  - Ubuntu latest
  - 4 CPU / 8GB RAM
  
secrets_required:
  - FLY_API_TOKEN
  - VERCEL_TOKEN
  - UPSTASH_API_KEY
  - DOCKER_REGISTRY_TOKEN
  - SONAR_TOKEN (optional)
  
pipeline_stages:
  - test (unit, integration)
  - build (Docker images)
  - security (scanning)
  - deploy (staging)
  - smoke_test
  - deploy (production)
  
artifacts:
  - Test reports
  - Coverage reports
  - Docker images
  - Build logs
```

---

## 12. Security & Compliance Requirements

### SSL/TLS Certificates

```yaml
provider: "Let's Encrypt"
type: "Wildcard"
auto_renewal: true
min_tls_version: "1.2"
```

### Secret Management

```yaml
provider: "Fly.io Secrets / Vercel Env"
encryption: "At rest"
rotation: "90 days"

required_secrets:
  - Database credentials
  - API keys
  - JWT secrets
  - HMAC secrets
  - OAuth tokens
```

### Compliance

```yaml
requirements:
  - GDPR compliance (if EU users)
  - PCI DSS (not required - no card processing)
  - SOC 2 Type 1 (optional)
  
audit_logging:
  - All API calls
  - Authentication attempts
  - Payment verifications
  - Asset transfers
  
data_retention:
  - Transaction logs: 7 years
  - User data: Until deletion requested
  - System logs: 90 days
```

---

## Cost Summary

### Monthly Recurring Costs

| Provider | Service | Estimated Cost |
|----------|---------|----------------|
| **Fly.io** | Compute + Database | $270-350 |
| **Vercel** | Pro Plan + Usage | $25-30 |
| **Upstash** | Redis Global | $50-80 |
| **Moralis** | Pro API Access | $99-249 |
| **NOWPayments** | Processing Fees | 0.5-1% of volume |
| **Domain** | DNS + SSL | $15 |
| **Monitoring** | Included in Fly.io | $0 |
| **CI/CD** | GitHub Actions | $0-50 |
| **Total** | Infrastructure | **$459-774/month** |

### One-Time Setup Costs

| Item | Cost |
|------|------|
| Domain registration | $15-50/year |
| SSL certificates | Free (Let's Encrypt) |
| Business verification (NOWPayments) | $0-200 |
| Initial deposits | $100-500 |
| **Total Setup** | **$215-750** |

---

## Setup Checklist

### Week 1 - Accounts & Access
- [ ] Create Fly.io organization account
- [ ] Create Vercel Pro account
- [ ] Setup Upstash Redis account
- [ ] Apply for NOWPayments business account
- [ ] Register for Moralis Pro API (https://docs.moralis.com)
- [ ] Obtain ProfileTray API access (profiletray.com)
- [ ] Get Onli Cloud credentials (onli.support)
- [ ] Verify domain ownership (species.market)

### Week 2 - Infrastructure Setup
- [ ] Deploy PostgreSQL on Fly.io
- [ ] Setup NATS JetStream cluster
- [ ] Configure Upstash Redis
- [ ] Deploy Firefly III
- [ ] Setup monitoring stack
- [ ] Configure DNS records
- [ ] Generate SSL certificates
- [ ] Setup CI/CD pipelines

### Week 3 - Integration Testing
- [ ] Test all API connections
- [ ] Verify payment processing
- [ ] Test blockchain verification
- [ ] Validate gRPC connections
- [ ] Load testing
- [ ] Security scanning
- [ ] Backup verification

### Week 4 - Production Launch
- [ ] Final security audit
- [ ] Performance optimization
- [ ] Documentation complete
- [ ] Monitoring alerts configured
- [ ] Disaster recovery plan tested
- [ ] Go-live checklist complete

---

## Support Contacts

### Critical Services

| Provider | Support Level | Response Time | Contact |
|----------|--------------|---------------|---------|
| Fly.io | Pro Support | 1 hour | support@fly.io |
| Vercel | Pro Support | 4 hours | support@vercel.com |
| Upstash | Email Support | 24 hours | support@upstash.com |
| NOWPayments | Business Support | 4 hours | business@nowpayments.io |

### Escalation Path

1. **Level 1**: Development team
2. **Level 2**: Provider support
3. **Level 3**: Provider enterprise support
4. **Level 4**: Alternative provider failover

---

## Risk Mitigation

### Provider Failure Scenarios

| Provider | Risk | Mitigation |
|----------|------|------------|
| Fly.io | Region outage | Multi-region deployment |
| Vercel | Edge function limits | Fallback to Fly.io API |
| Upstash | Redis failure | Local cache + retry |
| NOWPayments | API down | Moralis blockchain verification |
| Moralis | Rate limiting | NOWPayments fallback + caching |

### Backup Providers

| Primary | Backup Option | Switch Time |
|---------|---------------|-------------|
| Fly.io | AWS ECS | 24 hours |
| Vercel | Cloudflare Workers | 2 hours |
| Upstash | Redis Cloud | 4 hours |
| NOWPayments | Moralis direct blockchain | Immediate |
| Moralis | Direct node access | 4 hours |

---

**Document Version**: 2.0  
**Last Updated**: November 2024  
**Primary Domain**: species.market  
**Status**: Ready for Provider Onboarding with Moralis Integration
