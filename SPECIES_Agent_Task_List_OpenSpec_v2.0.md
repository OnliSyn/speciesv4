# SPECIES Marketplace - AI Agent Task List
## OpenSpec Format for Autonomous Execution with Moralis Integration

---

## Agent Configuration

```yaml
openspec_version: "1.0.0"
project: "species-marketplace"
domain: "species.market"
total_agents: 5
execution_mode: "parallel_with_dependencies"
orchestrator: "gpt-4-turbo"
blockchain_api: "moralis"

agents:
  - id: "devops-agent"
    model: "gpt-4-turbo"
    capabilities: ["infrastructure", "deployment", "monitoring"]
    tools: ["fly_cli", "vercel_cli", "terraform", "kubectl"]
    
  - id: "backend-agent"
    model: "claude-3-opus"
    capabilities: ["golang", "microservices", "database", "grpc"]
    tools: ["go", "postgres", "redis", "protoc"]
    
  - id: "integration-agent"
    model: "gpt-4-turbo"
    capabilities: ["api_integration", "testing", "documentation"]
    tools: ["postman", "k6", "swagger"]
    
  - id: "frontend-agent"
    model: "claude-3-opus"
    capabilities: ["typescript", "nextjs", "react", "mcp"]
    tools: ["npm", "vercel", "typescript"]
    
  - id: "security-agent"
    model: "gpt-4-turbo"
    capabilities: ["security", "compliance", "audit"]
    tools: ["trivy", "gosec", "owasp"]
```

## Task Execution Plan

### PHASE 0: Infrastructure Setup (4 hours)

```yaml
task_group: "infrastructure_setup"
parallel: true
estimated_time: "4 hours"

tasks:
  - task_id: "INFRA-001"
    agent: "devops-agent"
    priority: "critical"
    description: "Initialize Fly.io organization and applications"
    
    acceptance_criteria:
      - Fly.io organization created
      - Applications registered (10 services)
      - Regions configured (iad, lax, fra)
      - Environment variables set
    
    commands:
      - |
        fly auth login
        fly orgs create species-marketplace
        
        # Create applications
        for service in authenticator marketplace-api validator classifier matching cashier asset-manager floor-manager reporter config-service; do
          fly apps create species-$service --org species-marketplace
        done
        
        # Create shared secrets
        fly secrets set DATABASE_URL=$DATABASE_URL --app species-marketplace-api
    
    outputs:
      - FLY_API_TOKEN
      - APP_URLS (map[string]string)
    
    validation:
      script: |
        fly apps list --org species-marketplace | grep -c "species-" | test = 10

  - task_id: "INFRA-002"
    agent: "devops-agent"
    priority: "critical"
    description: "Setup Upstash Redis global cluster"
    
    acceptance_criteria:
      - Redis cluster created
      - Global replication enabled
      - TLS configured
      - Connection tested
    
    api_calls:
      - method: POST
        url: "https://api.upstash.com/v2/redis/database"
        headers:
          Authorization: "Bearer ${UPSTASH_API_KEY}"
        body: |
          {
            "name": "species-marketplace",
            "region": "global",
            "tls": true,
            "eviction": true,
            "eviction_policy": "allkeys-lru",
            "consistent": true
          }
    
    outputs:
      - UPSTASH_REDIS_REST_URL
      - UPSTASH_REDIS_REST_TOKEN
      - REDIS_CONNECTION_STRING
    
    validation:
      script: |
        redis-cli --tls -u $REDIS_CONNECTION_STRING ping

  - task_id: "INFRA-003"
    agent: "devops-agent"
    priority: "critical"
    description: "Deploy PostgreSQL with read replicas on Fly.io"
    
    acceptance_criteria:
      - Primary database deployed in iad
      - Read replicas in lax and fra
      - Connection pooling configured
      - Backups enabled
    
    commands:
      - |
        # Create primary database
        fly postgres create --name species-db --region iad --initial-cluster-size 3
        
        # Attach to applications
        fly postgres attach species-db --app species-marketplace-api
        
        # Create read replicas
        fly postgres replicate species-db --region lax
        fly postgres replicate species-db --region fra
        
        # Configure connection pooling
        fly postgres config update --app species-db --max-connections 100
    
    outputs:
      - DATABASE_URL (primary)
      - DATABASE_REPLICA_LAX_URL
      - DATABASE_REPLICA_FRA_URL
    
    validation:
      script: |
        psql $DATABASE_URL -c "SELECT version();"

  - task_id: "INFRA-004"
    agent: "devops-agent"
    priority: "critical"
    description: "Setup Moralis Pro for blockchain verification"
    
    acceptance_criteria:
      - Moralis Pro account created
      - API key generated
      - Webhook streams configured
      - Multi-chain support enabled
    
    api_calls:
      - method: POST
        url: "https://admin.moralis.io/api/auth/register"
        body: |
          {
            "email": "tech@species.market",
            "password": "${MORALIS_PASSWORD}",
            "plan": "pro"
          }
      
      - method: POST
        url: "https://deep-index.moralis.io/api/v2/streams/evm"
        headers:
          X-API-Key: "${MORALIS_API_KEY}"
        body: |
          {
            "webhookUrl": "https://api.species.market/webhooks/moralis",
            "description": "USDT Payment Monitoring",
            "tag": "USDT",
            "topic0": ["Transfer(address,address,uint256)"],
            "includeNativeTxs": false,
            "chainIds": ["0x1", "0x38", "0x89"]
          }
    
    outputs:
      - MORALIS_API_KEY
      - MORALIS_WEBHOOK_SECRET
      - STREAM_ID
    
    validation:
      script: |
        # Test Moralis API
        curl -X GET "https://deep-index.moralis.io/api/v2/transaction/0x123?chain=0x1" \
          -H "X-API-Key: ${MORALIS_API_KEY}"
  
  - task_id: "INFRA-005"
    agent: "frontend-agent"
    priority: "high"
    description: "Initialize Vercel project for MCP server"
    
    acceptance_criteria:
      - Vercel project created
      - Environment variables configured
      - Domain configured (mcp.species.market)
      - Edge functions enabled
    
    commands:
      - |
        vercel login
        vercel project create species-mcp
        
        # Set environment variables
        vercel env add MARKETPLACE_URL production --value https://api.species.market
        vercel env add UPSTASH_REDIS_REST_URL production
        vercel env add UPSTASH_REDIS_REST_TOKEN production
        vercel env add MORALIS_API_KEY production
        
        # Configure domain
        vercel domains add mcp.species.market --project species-mcp
    
    outputs:
      - VERCEL_PROJECT_ID
      - VERCEL_TOKEN
      - MCP_ENDPOINT_URL
    agent: "frontend-agent"
    priority: "high"
    description: "Initialize Vercel project for MCP server"
    
    acceptance_criteria:
      - Vercel project created
      - Environment variables configured
      - Domain configured
      - Edge functions enabled
    
    commands:
      - |
        vercel login
        vercel project create species-mcp
        
        # Set environment variables
        vercel env add MARKETPLACE_URL production
        vercel env add UPSTASH_REDIS_REST_URL production
        vercel env add UPSTASH_REDIS_REST_TOKEN production
        
        # Configure domain
        vercel domains add mcp.species.io --project species-mcp
    
    outputs:
      - VERCEL_PROJECT_ID
      - VERCEL_TOKEN
      - MCP_ENDPOINT_URL
```

### PHASE 1: Foundation Services (Day 1)

```yaml
task_group: "foundation_services"
parallel: false
estimated_time: "8 hours"
dependencies: ["infrastructure_setup"]

tasks:
  - task_id: "FOUND-001"
    agent: "backend-agent"
    priority: "critical"
    description: "Implement common packages (cache, circuit breaker, event bus)"
    
    acceptance_criteria:
      - Tiered cache implementation (L1 + L2)
      - Circuit breaker with configurable thresholds
      - Event bus abstraction for NATS
      - Structured logging with zap
      - Prometheus metrics collector
    
    files_to_create:
      - path: "internal/common/cache/cache.go"
        content: |
          package cache
          
          import (
              "context"
              "encoding/json"
              "time"
              
              "github.com/patrickmn/go-cache"
              "github.com/redis/go-redis/v9"
          )
          
          type TieredCache struct {
              l1     *cache.Cache
              l2     *redis.Client
              prefix string
          }
          
          func NewTieredCache(redisURL, prefix string) *TieredCache {
              opt, _ := redis.ParseURL(redisURL)
              return &TieredCache{
                  l1:     cache.New(5*time.Minute, 10*time.Minute),
                  l2:     redis.NewClient(opt),
                  prefix: prefix,
              }
          }
          
          func (t *TieredCache) Get(ctx context.Context, key string, dest interface{}) error {
              // Check L1 first
              if val, found := t.l1.Get(key); found {
                  return json.Unmarshal(val.([]byte), dest)
              }
              
              // Check L2
              val, err := t.l2.Get(ctx, t.prefix+key).Bytes()
              if err == nil {
                  // Populate L1
                  t.l1.Set(key, val, cache.DefaultExpiration)
                  return json.Unmarshal(val, dest)
              }
              
              return err
          }
      
      - path: "internal/common/circuit/breaker.go"
        content: |
          package circuit
          
          import (
              "time"
              "github.com/sony/gobreaker"
          )
          
          type Config struct {
              Name            string
              MaxRequests     uint32
              Interval        time.Duration
              Timeout         time.Duration
              FailureRatio    float64
              MinRequests     uint32
          }
          
          func NewBreaker(cfg Config) *gobreaker.CircuitBreaker {
              settings := gobreaker.Settings{
                  Name:        cfg.Name,
                  MaxRequests: cfg.MaxRequests,
                  Interval:    cfg.Interval,
                  Timeout:     cfg.Timeout,
                  ReadyToTrip: func(counts gobreaker.Counts) bool {
                      failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
                      return counts.Requests >= cfg.MinRequests && failureRatio >= cfg.FailureRatio
                  },
                  OnStateChange: func(name string, from, to gobreaker.State) {
                      log.Printf("Circuit breaker %s: %s -> %s", name, from, to)
                  },
              }
              return gobreaker.NewCircuitBreaker(settings)
          }
    
    tests_to_create:
      - path: "internal/common/cache/cache_test.go"
        type: "unit"
        coverage_target: 90
      
      - path: "internal/common/circuit/breaker_test.go"
        type: "unit"
        coverage_target: 85
    
    validation:
      script: |
        go test ./internal/common/... -cover | grep -E "coverage: [8-9][0-9]\.[0-9]%|coverage: 100\.0%"

  - task_id: "FOUND-002"
    agent: "backend-agent"
    priority: "critical"
    description: "Implement Authenticator service with HMAC validation"
    
    acceptance_criteria:
      - HMAC-SHA256 signature validation
      - API key lookup with caching
      - ProfileTray integration for secrets
      - Rate limiting (global + per-key)
      - Nonce replay protection
      - Health check endpoint
    
    files_to_create:
      - path: "cmd/authenticator/main.go"
        content: |
          package main
          
          import (
              "log"
              "os"
              
              "github.com/gin-gonic/gin"
              "github.com/species/marketplace/internal/auth"
              "github.com/species/marketplace/internal/common/cache"
              "github.com/species/marketplace/pkg/profiletray"
          )
          
          func main() {
              r := gin.New()
              r.Use(gin.Recovery())
              r.Use(gin.Logger())
              
              // Initialize dependencies
              cache := cache.NewTieredCache(os.Getenv("REDIS_URL"), "auth:")
              ptClient := profiletray.NewClient(os.Getenv("PROFILETRAY_URL"))
              
              authService := auth.NewService(cache, ptClient)
              
              // Middleware
              r.Use(auth.RateLimitMiddleware())
              r.Use(auth.NonceProtectionMiddleware(cache))
              
              // Routes
              r.POST("/authenticate", authService.Authenticate)
              r.GET("/health", auth.HealthCheck)
              
              port := os.Getenv("PORT")
              if port == "" {
                  port = "8081"
              }
              
              log.Printf("Authenticator starting on port %s", port)
              r.Run(":" + port)
          }
      
      - path: "internal/auth/hmac.go"
        content: |
          package auth
          
          import (
              "crypto/hmac"
              "crypto/sha256"
              "encoding/base64"
              "fmt"
              "time"
          )
          
          type HMACValidator struct {
              windowSeconds int
          }
          
          func NewHMACValidator(windowSeconds int) *HMACValidator {
              return &HMACValidator{windowSeconds: windowSeconds}
          }
          
          func (h *HMACValidator) Validate(body, nonce, timestamp, signature, secret string) error {
              // Check timestamp freshness
              ts, err := time.Parse(time.RFC3339, timestamp)
              if err != nil {
                  return fmt.Errorf("invalid timestamp format")
              }
              
              if time.Since(ts) > time.Duration(h.windowSeconds)*time.Second {
                  return fmt.Errorf("timestamp expired")
              }
              
              // Calculate expected signature
              message := body + nonce + timestamp
              mac := hmac.New(sha256.New, []byte(secret))
              mac.Write([]byte(message))
              expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
              
              // Constant time comparison
              if !hmac.Equal([]byte(signature), []byte(expected)) {
                  return fmt.Errorf("invalid signature")
              }
              
              return nil
          }
    
    deployment:
      platform: "fly.io"
      config: |
        app = "species-authenticator"
        primary_region = "iad"
        
        [build]
          builder = "paketobuildpacks/builder:base"
        
        [[services]]
          internal_port = 8081
          protocol = "tcp"
          
          [[services.ports]]
            port = 443
            handlers = ["tls", "http"]
          
        [env]
          PORT = "8081"
          
        [[services.http_checks]]
          interval = "10s"
          timeout = "2s"
          method = "GET"
          path = "/health"
    
    validation:
      script: |
        # Test HMAC validation
        curl -X POST https://species-authenticator.fly.dev/authenticate \
          -H "X-API-Key: test-key" \
          -H "X-Nonce: $(uuidgen)" \
          -H "X-Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          -H "X-Signature: test-sig" \
          -d '{"test": "data"}'

  - task_id: "FOUND-003"
    agent: "backend-agent"
    priority: "critical"
    description: "Implement Marketplace API with idempotency"
    
    acceptance_criteria:
      - Event request validation
      - Idempotency handling
      - Event publishing to NATS
      - Request/response logging
      - OpenAPI documentation
    
    database_migration:
      - |
        CREATE TABLE event_ingress (
            event_id UUID PRIMARY KEY,
            body_hash VARCHAR(64) NOT NULL,
            raw_body TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMP,
            metadata JSONB,
            UNIQUE(event_id, body_hash)
        );
        
        CREATE INDEX idx_event_status ON event_ingress(status, created_at);
        CREATE INDEX idx_event_hash ON event_ingress(body_hash);
    
    validation:
      type: "integration"
      script: |
        # Test idempotency
        EVENT_ID=$(uuidgen)
        BODY='{"from":"usr1","to":"usr2","amount":100}'
        
        # First request
        RESP1=$(curl -X POST $API_URL/marketplace/v1/events \
          -H "X-Event-Id: $EVENT_ID" \
          -d "$BODY")
        
        # Duplicate request
        RESP2=$(curl -X POST $API_URL/marketplace/v1/events \
          -H "X-Event-Id: $EVENT_ID" \
          -d "$BODY")
        
        # Both should return 202
        test "$(echo $RESP1 | jq -r .status)" = "ACCEPTED"
        test "$(echo $RESP2 | jq -r .status)" = "ACCEPTED"
```

### PHASE 2: Core Services (Days 2-3)

```yaml
task_group: "core_services"
parallel: true
estimated_time: "16 hours"
dependencies: ["foundation_services"]

tasks:
  - task_id: "CORE-001"
    agent: "backend-agent"
    priority: "critical"
    description: "Implement Validator with dual-path payment verification"
    
    acceptance_criteria:
      - NOWPayments API integration
      - Moralis blockchain verification (multi-chain)
      - Circuit breaker for external APIs
      - Payment proof caching
      - Webhook signature verification
    
    external_integrations:
      - name: "NOWPayments"
        type: "REST"
        base_url: "https://api.nowpayments.io/v1"
        auth: "API_KEY"
        
      - name: "Moralis"
        type: "REST"
        base_url: "https://deep-index.moralis.io/api/v2"
        auth: "X-API-Key"
        documentation: "https://docs.moralis.com"
        features:
          - Multi-chain support (ETH, BSC, TRON, Polygon)
          - Real-time webhooks
          - 3500 RPS rate limit
    
    files_to_create:
      - path: "internal/validator/dual_path.go"
        content: |
          package validator
          
          import (
              "context"
              "fmt"
              "time"
              
              "github.com/species/marketplace/internal/common/circuit"
              "github.com/species/marketplace/pkg/nowpayments"
              "github.com/species/marketplace/pkg/moralis"
          )
          
          type DualPathValidator struct {
              npClient      *nowpayments.Client
              moralisClient *moralis.Client
              npBreaker     *circuit.CircuitBreaker
              moralisBreaker *circuit.CircuitBreaker
              cache         *cache.TieredCache
          }
          
          func (v *DualPathValidator) Verify(ctx context.Context, proof string, chain string, expectedAmount float64) (*VerificationResult, error) {
              // Check cache first
              var cached VerificationResult
              cacheKey := fmt.Sprintf("proof:%s:%s", chain, proof)
              if err := v.cache.Get(ctx, cacheKey, &cached); err == nil {
                  return &cached, nil
              }
              
              // Try Moralis first (blockchain verification)
              var result *VerificationResult
              var err error
              
              v.moralisBreaker.Execute(func() error {
                  result, err = v.verifyWithMoralis(ctx, proof, chain, expectedAmount)
                  return err
              })
              
              if err == nil && result.Valid {
                  v.cache.Set(ctx, cacheKey, result, 10*time.Minute)
                  return result, nil
              }
              
              // Fallback to NOWPayments verification
              v.npBreaker.Execute(func() error {
                  result, err = v.verifyWithNOWPayments(ctx, proof, expectedAmount)
                  return err
              })
              
              if err == nil && result.Valid {
                  v.cache.Set(ctx, cacheKey, result, 10*time.Minute)
                  return result, nil
              }
              
              return nil, fmt.Errorf("payment verification failed: %w", err)
          }
    
    performance_requirements:
      - latency_p95: "< 2 seconds"
      - throughput: "> 100 RPS"
      - error_rate: "< 0.1%"
    
    validation:
      script: |
        # Load test payment verification
        k6 run --vus 10 --duration 30s validator_load_test.js

  - task_id: "CORE-002"
    agent: "backend-agent"
    priority: "high"
    description: "Implement Classifier for transaction intent routing"
    
    acceptance_criteria:
      - Pure function classification
      - No external dependencies
      - 100% deterministic
      - < 1ms classification time
    
    classification_rules:
      - rule: "ListingID provided"
        intent: "BUY_MARKET"
        
      - rule: "To == 'treasury'"
        intent: "BUY_TREASURY"
        
      - rule: "PutProceeds provided"
        intent: "SELL_MARKET"
        
      - rule: "To == 'liquidity_pool'"
        intent: "REDEEM"
        
      - rule: "Default"
        intent: "TRANSFER"
    
    validation:
      type: "unit"
      test_cases:
        - input: {to: "treasury", payWith: {proof: "npmt_123"}}
          expected: "BUY_TREASURY"
          
        - input: {listingId: "lst_456", payWith: {proof: "npmt_789"}}
          expected: "BUY_MARKET"
          
        - input: {putProceeds: {usdtAddress: "TRX..."}}
          expected: "SELL_MARKET"

  - task_id: "CORE-003"
    agent: "backend-agent"
    priority: "critical"
    description: "Implement Matching engine with order book management"
    
    acceptance_criteria:
      - Listing creation and management
      - Order matching algorithm
      - Partial fill support
      - Expiration handling
      - Match reservation system
    
    database_schema:
      - |
        CREATE TABLE listings (
            listing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            seller_id VARCHAR(255) NOT NULL,
            amount DECIMAL(20,0) NOT NULL,
            price_usdt DECIMAL(20,6) NOT NULL,
            available_amount DECIMAL(20,0) NOT NULL,
            status VARCHAR(20) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL,
            metadata JSONB,
            CHECK (available_amount >= 0),
            CHECK (available_amount <= amount)
        );
        
        CREATE INDEX idx_active_listings ON listings(status, expires_at) 
        WHERE status = 'ACTIVE';
        
        CREATE TABLE match_reservations (
            match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            listing_id UUID REFERENCES listings(listing_id),
            buyer_id VARCHAR(255) NOT NULL,
            amount DECIMAL(20,0) NOT NULL,
            status VARCHAR(20) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL
        );
    
    matching_algorithm:
      type: "FIFO"
      features:
        - price_time_priority
        - partial_fills
        - minimum_size_enforcement
    
    validation:
      script: |
        # Test matching engine
        go test ./internal/matching -run TestMatchingEngine -v

  - task_id: "CORE-004"
    agent: "integration-agent"
    priority: "high"
    description: "Implement Cashier with Firefly III integration"
    
    acceptance_criteria:
      - Double-entry bookkeeping
      - Transaction recording
      - Balance queries
      - Fee calculation
      - Audit trail
    
    firefly_setup:
      deployment: |
        # Deploy Firefly III on Fly.io
        fly apps create species-firefly --org species-marketplace
        fly postgres create --name firefly-db --region iad
        fly postgres attach firefly-db --app species-firefly
        
        # Deploy Firefly
        fly deploy --app species-firefly --image fireflyiii/core:latest \
          --env DB_CONNECTION=pgsql \
          --env APP_KEY=$(openssl rand -base64 32)
    
    account_structure:
      assets:
        - "USDT_cash"
        - "SPECIES_balance"
        
      liabilities:
        - "USDT_settlement_payable"
        - "SPECIES_locked"
        
      revenue:
        - "listing_fees"
        - "issuance_fees"
        - "liquidity_fees"
    
    validation:
      script: |
        # Test double-entry balance
        curl $FIREFLY_URL/api/v1/accounts | \
          jq '.data[].attributes | select(.current_balance != 0)' | \
          jq -s 'map(.current_balance | tonumber) | add' | \
          test = 0  # Should sum to zero
```

### PHASE 3: Asset Operations (Days 4-5)

```yaml
task_group: "asset_operations"
parallel: false
estimated_time: "16 hours"
dependencies: ["core_services"]

tasks:
  - task_id: "ASSET-001"
    agent: "integration-agent"
    priority: "critical"
    description: "Implement Asset Manager with Onli Cloud gRPC integration"
    
    acceptance_criteria:
      - gRPC client implementation
      - Connection pooling
      - Retry logic with backoff
      - Asset operations (Issue, ChangeOwner, Ask2Receive)
      - Oracle verification
    
    grpc_setup:
      proto_files:
        - path: "api/proto/onlicloud.proto"
          content: |
            syntax = "proto3";
            package onlicloud;
            
            service IssueService {
              rpc Issue(IssueRequest) returns (IssueResponse);
            }
            
            service AssetService {
              rpc ChangeOwner(ChangeOwnerRequest) returns (ChangeOwnerResponse);
              rpc Ask2Receive(Ask2ReceiveRequest) returns (Ask2ReceiveResponse);
            }
            
            service OracleService {
              rpc RevealGenomes(RevealRequest) returns (RevealResponse);
            }
            
            message IssueRequest {
              string to = 1;
              string app_symbol = 2;
              string amount = 3;
              string device = 4;
            }
            
            message IssueResponse {
              string issue_id = 1;
              string delivered_at = 2;
              string pkg_tag = 3;
            }
      
      generate_command: |
        protoc --go_out=. --go-grpc_out=. api/proto/*.proto
    
    connection_config:
      pool_size: 10
      max_message_size: "10MB"
      keepalive: "30s"
      timeout: "30s"
    
    validation:
      script: |
        # Test gRPC connection
        grpcurl -plaintext localhost:50051 list

  - task_id: "ASSET-002"
    agent: "backend-agent"
    priority: "high"
    description: "Implement Floor Manager for reconciliation and receipt generation"
    
    acceptance_criteria:
      - Oracle verification
      - Receipt composition
      - Final ledger posting
      - State cleanup
      - Event emission
    
    receipt_structure:
      fields:
        - event_id
        - status
        - intent
        - from_balance_change
        - to_balance_change
        - payment_receipts
        - asset_receipts
        - fee_breakdown
        - timestamps
        - oracle_verification
    
    validation:
      script: |
        # Test receipt generation
        RECEIPT=$(curl $API_URL/marketplace/v1/receipts/test-event-id)
        echo $RECEIPT | jq -e '.status == "COMPLETED"'

  - task_id: "ASSET-003"
    agent: "backend-agent"
    priority: "medium"
    description: "Implement Reporter service for read-only queries"
    
    acceptance_criteria:
      - Receipt retrieval API
      - Listing queries
      - Balance queries
      - Transaction history
      - Response caching
      - Pagination support
    
    cache_strategy:
      - receipts: "1 hour"
      - listings: "5 minutes"
      - balances: "30 seconds"
      - history: "5 minutes"
    
    api_endpoints:
      - GET /marketplace/v1/receipts/:eventId
      - GET /marketplace/v1/listings?status=ACTIVE
      - GET /marketplace/v1/users/:onliId/balance
      - GET /marketplace/v1/users/:onliId/transactions
    
    validation:
      script: |
        # Test API endpoints
        for endpoint in receipts/test-id listings users/test-user/balance; do
          curl -f $API_URL/marketplace/v1/$endpoint
        done
```

### PHASE 4: MCP Server on Vercel (Day 6)

```yaml
task_group: "mcp_server"
parallel: false
estimated_time: "8 hours"
dependencies: ["asset_operations"]

tasks:
  - task_id: "MCP-001"
    agent: "frontend-agent"
    priority: "critical"
    description: "Implement MCP server on Vercel with Edge Functions"
    
    acceptance_criteria:
      - Three MCP tools implemented
      - HMAC signature generation
      - Session-based credential storage
      - Receipt interpretation
      - Rate limiting
      - CORS configuration
    
    project_structure:
      - api/mcp/configure.ts
      - api/mcp/transaction.ts
      - api/mcp/receipt.ts
      - lib/auth.ts
      - lib/interpreter.ts
      - middleware.ts
    
    files_to_create:
      - path: "api/mcp/configure.ts"
        content: |
          import { NextRequest } from 'next/server';
          import { kv } from '@vercel/kv';
          
          export const runtime = 'edge';
          
          export async function POST(request: NextRequest) {
            const sessionId = request.headers.get('x-session-id');
            if (!sessionId) {
              return Response.json(
                { error: 'Session ID required' },
                { status: 400 }
              );
            }
            
            const { apiKey, secret } = await request.json();
            
            // Store in KV with TTL
            await kv.setex(
              `session:${sessionId}`,
              3600,
              { apiKey, secretHash: await hashSecret(secret) }
            );
            
            return Response.json({
              success: true,
              message: 'Configuration stored'
            });
          }
      
      - path: "lib/auth.ts"
        content: |
          import { createHmac } from 'crypto';
          
          export function createHMACSignature(
            body: string,
            nonce: string,
            timestamp: string,
            secret: string
          ): string {
            const message = body + nonce + timestamp;
            const hmac = createHmac('sha256', secret);
            hmac.update(message);
            return hmac.digest('base64');
          }
          
          export function createAuthHeaders(
            apiKey: string,
            secret: string,
            body: any,
            eventId: string
          ) {
            const nonce = crypto.randomUUID();
            const timestamp = new Date().toISOString();
            const bodyStr = JSON.stringify(body);
            
            return {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
              'X-Nonce': nonce,
              'X-Timestamp': timestamp,
              'X-Signature': createHMACSignature(bodyStr, nonce, timestamp, secret),
              'X-Event-Id': eventId,
            };
          }
    
    vercel_config:
      - path: "vercel.json"
        content: |
          {
            "functions": {
              "api/mcp/*.ts": {
                "runtime": "@vercel/edge",
                "maxDuration": 10
              }
            },
            "rewrites": [
              {
                "source": "/mcp/:path*",
                "destination": "/api/mcp/:path*"
              }
            ]
          }
    
    deployment:
      commands:
        - vercel --prod
        - vercel alias set mcp.species.market
    
    validation:
      script: |
        # Test MCP endpoints
        curl -X POST https://mcp.species.market/api/mcp/configure \
          -H "X-Session-ID: test-session" \
          -d '{"apiKey":"test","secret":"test"}'

  - task_id: "MCP-002"
    agent: "frontend-agent"
    priority: "high"
    description: "Implement receipt interpretation logic"
    
    acceptance_criteria:
      - Human-readable formatting
      - Status interpretation
      - Balance change display
      - Fee breakdown
      - Error explanation
    
    interpretation_features:
      - emoji_status_indicators
      - balance_flow_visualization
      - fee_itemization
      - timeline_display
      - error_contextualization
    
    validation:
      test_receipt: |
        {
          "eventId": "evt-test",
          "status": "COMPLETED",
          "intent": "BUY_TREASURY",
          "from": {
            "onliId": "usr-buyer",
            "startBalance": 0,
            "endBalance": 1000
          },
          "to": {
            "onliId": "treasury",
            "startBalance": 1000000,
            "endBalance": 999000
          },
          "amount": 1000,
          "fees": {
            "issuance": 0.01,
            "total": 0.01
          }
        }
      
      expected_output: |
        ✅ Transaction COMPLETED
        Bought 1,000 SPECIES from treasury
        Balance: 0 → 1,000 SPECIES
        Fees: $0.01 USDT
```

### PHASE 5: Monitoring & Production (Days 7-8)

```yaml
task_group: "production_deployment"
parallel: true
estimated_time: "16 hours"
dependencies: ["mcp_server"]

tasks:
  - task_id: "MON-001"
    agent: "devops-agent"
    priority: "critical"
    description: "Deploy monitoring stack (Prometheus + Grafana)"
    
    acceptance_criteria:
      - Prometheus scraping all services
      - Grafana dashboards created
      - Alerts configured
      - Log aggregation setup
      - Distributed tracing enabled
    
    prometheus_config: |
      global:
        scrape_interval: 15s
      
      scrape_configs:
        - job_name: 'species-services'
          consul_sd_configs:
            - server: 'consul.fly.internal:8500'
          relabel_configs:
            - source_labels: [__meta_consul_service]
              regex: species-(.*)
              target_label: service
    
    grafana_dashboards:
      - name: "SPECIES Overview"
        panels:
          - transaction_volume
          - success_rate
          - p95_latency
          - error_rate
          
      - name: "Payment Verification"
        panels:
          - nowpayments_success_rate
          - tron_fallback_usage
          - verification_latency
          
      - name: "MCP Performance"
        panels:
          - mcp_requests_per_second
          - mcp_latency
          - session_count
    
    alerts:
      - name: "HighErrorRate"
        expr: "rate(errors_total[5m]) > 0.01"
        severity: "page"
        
      - name: "PaymentVerificationDown"
        expr: "up{job='validator'} == 0"
        severity: "page"
        
      - name: "SlowTransactions"
        expr: "histogram_quantile(0.95, transaction_duration_seconds) > 3"
        severity: "warning"
    
    validation:
      script: |
        # Check Prometheus targets
        curl $PROMETHEUS_URL/api/v1/targets | jq '.data.activeTargets | length' | test -gt 10
        
        # Check Grafana dashboards
        curl -H "Authorization: Bearer $GRAFANA_TOKEN" \
          $GRAFANA_URL/api/dashboards | jq '.[] | .title'

  - task_id: "TEST-001"
    agent: "integration-agent"
    priority: "critical"
    description: "Execute comprehensive load testing"
    
    acceptance_criteria:
      - Normal load: 100 concurrent users
      - Peak load: 500 concurrent users
      - Stress test: 1000 concurrent users
      - P95 latency < 3 seconds
      - Success rate > 99.9%
    
    k6_script: |
      import http from 'k6/http';
      import { check } from 'k6';
      import { Rate } from 'k6/metrics';
      
      const errorRate = new Rate('errors');
      
      export const options = {
        scenarios: {
          normal: {
            executor: 'constant-vus',
            vus: 100,
            duration: '10m',
          },
          peak: {
            executor: 'ramping-vus',
            startVUs: 100,
            stages: [
              { duration: '2m', target: 500 },
              { duration: '3m', target: 500 },
              { duration: '2m', target: 100 },
            ],
          },
          stress: {
            executor: 'ramping-vus',
            startVUs: 100,
            stages: [
              { duration: '1m', target: 1000 },
              { duration: '2m', target: 1000 },
              { duration: '1m', target: 100 },
            ],
          },
        },
        thresholds: {
          http_req_duration: ['p(95)<3000'],
          errors: ['rate<0.001'],
        },
      };
      
      export default function() {
        const res = http.post(
          'https://api.species.fly.dev/marketplace/v1/events',
          JSON.stringify({
            from: 'usr-test',
            to: 'treasury',
            amount: 1000,
            paymentProof: 'npmt_test',
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': __ENV.API_KEY,
              'X-Signature': __ENV.generateSignature(),
            },
          }
        );
        
        check(res, {
          'status is 202': (r) => r.status === 202,
          'latency OK': (r) => r.timings.duration < 3000,
        });
        
        errorRate.add(res.status >= 400);
      }
    
    validation:
      script: |
        k6 run --out cloud load-test.js
        # Check results
        k6 inspect --percentile 95

  - task_id: "SEC-001"
    agent: "security-agent"
    priority: "critical"
    description: "Execute security audit and penetration testing"
    
    acceptance_criteria:
      - No critical vulnerabilities
      - HMAC validation tested
      - SQL injection prevention verified
      - Rate limiting functional
      - Secrets properly managed
    
    security_tests:
      - tool: "trivy"
        target: "docker images"
        
      - tool: "gosec"
        target: "go source code"
        
      - tool: "sqlmap"
        target: "API endpoints"
        
      - tool: "nuclei"
        target: "web vulnerabilities"
    
    validation:
      script: |
        # Run security scan
        trivy image --severity CRITICAL,HIGH species-marketplace:latest
        gosec -fmt json -out security-report.json ./...
        
        # Check for vulnerabilities
        cat security-report.json | jq '.Issues | length' | test -eq 0

  - task_id: "DEPLOY-001"
    agent: "devops-agent"
    priority: "critical"
    description: "Execute blue-green deployment"
    
    acceptance_criteria:
      - Zero-downtime deployment
      - Automatic rollback on failure
      - Traffic gradually shifted
      - Health checks passing
      - Metrics collected
    
    deployment_steps:
      - step: "Deploy to green"
        command: |
          fly deploy --strategy bluegreen --app species-marketplace
          
      - step: "Run smoke tests"
        command: |
          ./scripts/smoke-test.sh green
          
      - step: "Shift traffic 10%"
        command: |
          fly scale --app species-marketplace --regions iad=0.1
          
      - step: "Monitor metrics"
        duration: "10 minutes"
        
      - step: "Shift traffic 50%"
        command: |
          fly scale --app species-marketplace --regions iad=0.5
          
      - step: "Monitor metrics"
        duration: "10 minutes"
        
      - step: "Shift traffic 100%"
        command: |
          fly scale --app species-marketplace --regions iad=1.0
          
      - step: "Keep blue as backup"
        duration: "24 hours"
    
    rollback_triggers:
      - error_rate: "> 1%"
      - p95_latency: "> 5 seconds"
      - health_check: "failing"
    
    validation:
      script: |
        # Check deployment status
        fly status --app species-marketplace
        
        # Verify all services healthy
        for service in authenticator api validator classifier matching cashier asset-manager floor-manager reporter; do
          fly status --app species-$service | grep "Deployment Status: successful"
        done
```

## Agent Coordination Protocol

```yaml
coordination:
  communication:
    channel: "slack"
    webhook: "${SLACK_WEBHOOK_URL}"
    
  status_updates:
    frequency: "every 2 hours"
    format: |
      Agent: {agent_id}
      Task: {task_id}
      Status: {status}
      Progress: {percentage}%
      Blockers: {blockers}
      ETA: {estimated_completion}
  
  dependency_management:
    check_interval: "15 minutes"
    retry_policy:
      max_retries: 3
      backoff: "exponential"
      
  conflict_resolution:
    priority: ["security-agent", "devops-agent", "backend-agent", "integration-agent", "frontend-agent"]
    escalation: "human-operator"
```

## Validation Gates

```yaml
gates:
  - name: "Infrastructure Ready"
    after: "infrastructure_setup"
    checks:
      - All Fly.io apps created
      - Redis cluster operational
      - PostgreSQL accessible
      - Vercel project configured
    
  - name: "Foundation Complete"
    after: "foundation_services"
    checks:
      - Authentication working
      - API accepting requests
      - Events publishing
      - Cache operational
    
  - name: "Core Services Ready"
    after: "core_services"
    checks:
      - Payment verification working
      - Classification accurate
      - Matching engine operational
      - Accounting functional
    
  - name: "Assets Operational"
    after: "asset_operations"
    checks:
      - Onli Cloud connected
      - Receipts generating
      - Reporter serving data
    
  - name: "MCP Functional"
    after: "mcp_server"
    checks:
      - Tools accessible
      - HMAC signing working
      - Receipt interpretation accurate
    
  - name: "Production Ready"
    after: "production_deployment"
    checks:
      - All tests passing
      - Monitoring active
      - Security audit passed
      - Performance targets met
```

## Success Criteria

```yaml
technical_success:
  - all_services_deployed: true
  - integration_tests_passing: 100%
  - load_test_targets_met: true
  - security_vulnerabilities: 0
  - monitoring_coverage: 100%

performance_success:
  - p95_latency: "< 3 seconds"
  - success_rate: "> 99.9%"
  - payment_verification: "> 99.95%"
  - mcp_response_time: "< 1 second"

operational_success:
  - zero_downtime_deployment: true
  - rollback_capability: true
  - disaster_recovery_tested: true
  - runbooks_complete: true
```

---

**Document Version**: 2.0.0  
**OpenSpec Version**: 1.0.0  
**Total Tasks**: 28  
**Estimated Time**: 8 days (64 hours)  
**Status**: Ready for Agent Execution  
**Primary Domain**: species.market  
**Blockchain API**: Moralis Pro (multi-chain)  
**Infrastructure Cost**: ~$444-594/month
