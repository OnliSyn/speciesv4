# SPECIES Marketplace v5 - AI Agent Build Plan
## OpenSpec Format for Autonomous Implementation with Moralis Integration

---

## Project Metadata

```yaml
openspec_version: "1.0.0"
project:
  name: "SPECIES Marketplace"
  version: "5.1.0"
  domain: "species.market"
  type: "distributed-microservices"
  deployment:
    primary: "fly.io"
    mcp: "vercel"
    cache: "upstash-redis"
    blockchain: "moralis"
  timeline: "8 days"
  agents_required: 5
```

## Infrastructure Architecture

```yaml
deployment_topology:
  edge:
    vercel:
      - mcp_server (TypeScript)
      - api_gateway (Next.js)
  
  compute:
    fly_io:
      regions: ["iad", "lax", "fra"]
      services:
        - authenticator (Go)
        - marketplace_api (Go)
        - validator (Go)
        - classifier (Go)
        - matching (Go)
        - cashier (Go)
        - asset_manager (Go)
        - floor_manager (Go)
        - reporter (Go)
        - config_service (Go)
  
  data:
    fly_postgres:
      - primary (iad)
      - read_replica (lax)
      - read_replica (fra)
    
    upstash_redis:
      - global_cache
      - session_store
      - event_queue
    
    firefly_iii:
      - self_hosted (fly.io)
  
  messaging:
    nats_jetstream:
      - cluster (3 nodes on fly.io)
```

## Day-by-Day Implementation Plan

### Day 0: Infrastructure Setup (4 hours)

```yaml
task_id: "day0-infrastructure"
agent: "DevOps Agent"
parallel: true
environment: "production"

tasks:
  - id: "fly-setup"
    description: "Initialize Fly.io organization and apps"
    commands:
      - fly auth login
      - fly orgs create species-marketplace
      - fly apps create species-api --org species-marketplace
      - fly apps create species-services --org species-marketplace
    outputs:
      - FLY_API_TOKEN
      - APP_NAMES
  
  - id: "vercel-setup"
    description: "Configure Vercel project"
    commands:
      - vercel login
      - vercel project create species-mcp
      - vercel env add MARKETPLACE_URL
      - vercel env add REDIS_URL
    outputs:
      - VERCEL_PROJECT_ID
      - VERCEL_TOKEN
  
  - id: "redis-setup"
    description: "Setup Upstash Redis"
    api_calls:
      - POST https://api.upstash.com/v2/redis/database
      - body: |
          {
            "name": "species-marketplace",
            "region": "global",
            "tls": true,
            "eviction": true,
            "type": "global"
          }
    outputs:
      - UPSTASH_REDIS_REST_URL
      - UPSTASH_REDIS_REST_TOKEN
  
  - id: "moralis-setup"
    description: "Setup Moralis Pro account for blockchain verification"
    api_calls:
      - url: "https://admin.moralis.io/register"
      - plan: "Pro"
      - documentation: "https://docs.moralis.com"
    configuration:
      - name: "SPECIES Payment Verification"
      - chains: ["ETH", "BSC", "TRON", "POLYGON"]
      - rate_limit: "3500 RPS"
      - webhook_url: "https://api.species.market/webhooks/moralis"
    outputs:
      - MORALIS_API_KEY
      - MORALIS_WEBHOOK_SECRET
      - STREAM_IDS
  
  - id: "postgres-setup"
    description: "Deploy PostgreSQL on Fly.io"
    commands:
      - fly postgres create --name species-db --region iad
      - fly postgres attach species-db --app species-api
      - fly postgres users create marketplace_user
    outputs:
      - DATABASE_URL
      - REPLICA_DATABASE_URL
```

### Day 1: Foundation Services (8 hours)

```yaml
task_id: "day1-foundation"
agent: "Backend Agent"
dependencies: ["day0-infrastructure"]

services:
  authenticator:
    language: "go"
    framework: "gin"
    database: "postgres"
    cache: "redis"
    
    implementation:
      - file: "cmd/authenticator/main.go"
        template: |
          package main
          
          import (
              "github.com/gin-gonic/gin"
              "github.com/species/marketplace/internal/auth"
              "github.com/species/marketplace/pkg/profiletray"
          )
          
          func main() {
              r := gin.Default()
              
              // HMAC validation middleware
              r.Use(auth.HMACMiddleware())
              
              // Rate limiting
              r.Use(auth.RateLimitMiddleware())
              
              // Routes
              r.POST("/authenticate", auth.HandleAuthenticate)
              
              r.Run(":8081")
          }
      
      - file: "internal/auth/hmac.go"
        template: |
          package auth
          
          import (
              "crypto/hmac"
              "crypto/sha256"
              "encoding/base64"
          )
          
          func ValidateHMAC(body, nonce, timestamp, signature, secret string) bool {
              message := body + nonce + timestamp
              h := hmac.New(sha256.New, []byte(secret))
              h.Write([]byte(message))
              expected := base64.StdEncoding.EncodeToString(h.Sum(nil))
              return hmac.Equal([]byte(signature), []byte(expected))
          }
    
    deployment:
      fly_toml: |
        app = "species-authenticator"
        primary_region = "iad"
        
        [build]
          builder = "paketobuildpacks/builder:base"
          buildpacks = ["gcr.io/paketo-buildpacks/go"]
        
        [[services]]
          internal_port = 8081
          protocol = "tcp"
          
          [[services.ports]]
            port = 443
            handlers = ["tls", "http"]
          
          [[services.ports]]
            port = 80
            handlers = ["http"]
        
        [env]
          PORT = "8081"
          
        [[services.http_checks]]
          interval = "10s"
          timeout = "2s"
          grace_period = "5s"
          method = "GET"
          path = "/health"

  marketplace_api:
    language: "go"
    framework: "gin"
    features:
      - idempotency
      - event_publishing
      - request_validation
    
    implementation:
      - file: "cmd/marketplace-api/main.go"
        template: |
          package main
          
          import (
              "github.com/gin-gonic/gin"
              "github.com/species/marketplace/internal/api"
              "github.com/species/marketplace/internal/events"
          )
          
          func main() {
              r := gin.Default()
              
              // Idempotency middleware
              r.Use(api.IdempotencyMiddleware())
              
              // Event publisher setup
              publisher := events.NewNATSPublisher()
              
              // Routes
              r.POST("/marketplace/v1/events", api.HandleEventRequest(publisher))
              r.GET("/marketplace/v1/health", api.HandleHealth)
              
              r.Run(":8080")
          }
    
    database_migrations:
      - file: "migrations/001_initial_schema.sql"
        content: |
          CREATE TABLE marketplace_users (
              marketplace_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              onli_id VARCHAR(255) UNIQUE NOT NULL,
              vault_id VARCHAR(255),
              api_key_id UUID,
              status VARCHAR(20) NOT NULL,
              profile_tray_ref VARCHAR(255),
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
              last_sync TIMESTAMP
          );
          
          CREATE INDEX idx_onli_id ON marketplace_users(onli_id);
          CREATE INDEX idx_api_key ON marketplace_users(api_key_id);
          CREATE INDEX idx_status ON marketplace_users(status);
          
          CREATE TABLE event_ingress (
              event_id UUID PRIMARY KEY,
              body_hash VARCHAR(64) NOT NULL,
              raw_body TEXT NOT NULL,
              status VARCHAR(20) NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              completed_at TIMESTAMP,
              UNIQUE(event_id, body_hash)
          );

  common_packages:
    cache:
      implementation: |
        package cache
        
        import (
            "github.com/redis/go-redis/v9"
            "github.com/patrickmn/go-cache"
            "time"
        )
        
        type TieredCache struct {
            l1 *cache.Cache  // In-memory
            l2 *redis.Client // Redis
        }
        
        func NewTieredCache(redisURL string) *TieredCache {
            opt, _ := redis.ParseURL(redisURL)
            return &TieredCache{
                l1: cache.New(5*time.Minute, 10*time.Minute),
                l2: redis.NewClient(opt),
            }
        }
    
    circuit_breaker:
      implementation: |
        package circuit
        
        import "github.com/sony/gobreaker"
        
        func NewBreaker(name string) *gobreaker.CircuitBreaker {
            settings := gobreaker.Settings{
                Name:        name,
                MaxRequests: 3,
                Interval:    10 * time.Second,
                Timeout:     30 * time.Second,
                ReadyToTrip: func(counts gobreaker.Counts) bool {
                    failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
                    return counts.Requests >= 3 && failureRatio >= 0.6
                },
            }
            return gobreaker.NewCircuitBreaker(settings)
        }

deployment_commands:
  - fly deploy --app species-authenticator --config fly.authenticator.toml
  - fly deploy --app species-api --config fly.api.toml
  - fly secrets set DATABASE_URL=$DATABASE_URL --app species-api
  - fly secrets set REDIS_URL=$UPSTASH_REDIS_REST_URL --app species-api
```

### Day 2-3: Core Services (16 hours)

```yaml
task_id: "day2-3-core"
agent: "Backend Agent"
dependencies: ["day1-foundation"]

services:
  validator:
    priority: "critical"
    features:
      - dual_path_verification
      - payment_proof_validation
      - circuit_breaker
    
    implementation:
      - file: "cmd/validator/main.go"
        template: |
          package main
          
          import (
              "github.com/species/marketplace/internal/validator"
              "github.com/species/marketplace/pkg/nowpayments"
              "github.com/species/marketplace/pkg/moralis"
          )
          
          func main() {
              // Initialize clients with circuit breakers
              npClient := nowpayments.NewClient(
                  os.Getenv("NOWPAYMENTS_API_KEY"),
                  circuit.NewBreaker("nowpayments"),
              )
              
              moralisClient := moralis.NewClient(
                  os.Getenv("MORALIS_API_KEY"),
                  circuit.NewBreaker("moralis"),
              )
              
              validator := validator.New(npClient, moralisClient)
              validator.Start()
          }
      
      - file: "internal/validator/dual_path.go"
        template: |
          package validator
          
          func (v *Validator) VerifyPayment(proof string, chain string, amount float64) (*VerificationResult, error) {
              // Try Moralis first (blockchain verification)
              result, err := v.verifyWithMoralis(proof, chain, amount)
              if err == nil && result.Valid {
                  return result, nil
              }
              
              // Fallback to NOWPayments
              return v.verifyWithNOWPayments(proof, amount)
          }
      
      - file: "pkg/moralis/client.go"
        template: |
          package moralis
          
          import (
              "encoding/json"
              "fmt"
              "net/http"
              "time"
          )
          
          type Client struct {
              apiKey  string
              baseURL string
              client  *http.Client
          }
          
          func NewClient(apiKey string, breaker *circuit.Breaker) *Client {
              return &Client{
                  apiKey:  apiKey,
                  baseURL: "https://deep-index.moralis.io/api/v2",
                  client:  &http.Client{Timeout: 30 * time.Second},
              }
          }
          
          // Multi-chain transaction verification
          func (c *Client) VerifyTransaction(hash, chain string) (*TxResult, error) {
              var endpoint string
              switch chain {
              case "TRON":
                  endpoint = fmt.Sprintf("%s/tron/transaction/%s", c.baseURL, hash)
              case "ETH":
                  endpoint = fmt.Sprintf("%s/transaction/%s?chain=0x1", c.baseURL, hash)
              case "BSC":
                  endpoint = fmt.Sprintf("%s/transaction/%s?chain=0x38", c.baseURL, hash)
              default:
                  return nil, fmt.Errorf("unsupported chain: %s", chain)
              }
              
              req, _ := http.NewRequest("GET", endpoint, nil)
              req.Header.Set("X-API-Key", c.apiKey)
              
              resp, err := c.client.Do(req)
              if err != nil {
                  return nil, err
              }
              defer resp.Body.Close()
              
              var result TxResult
              json.NewDecoder(resp.Body).Decode(&result)
              
              return &result, nil
          }

  classifier:
    priority: "high"
    type: "pure_function"
    
    implementation:
      - file: "internal/classifier/rules.go"
        template: |
          package classifier
          
          type Intent string
          
          const (
              ISSUE     Intent = "BUY_TREASURY"
              BUY_MARKET Intent = "BUY_MARKET"
              SELL_MARKET Intent = "SELL_MARKET"
              TRANSFER   Intent = "TRANSFER"
              REDEEM     Intent = "REDEEM"
          )
          
          func Classify(event Event) Intent {
              if event.ListingID != "" {
                  return BUY_MARKET
              }
              if event.To == "treasury" || strings.Contains(event.To, "treasury") {
                  return ISSUE
              }
              if event.PutProceeds != nil {
                  return SELL_MARKET
              }
              if event.To == "liquidity_pool" {
                  return REDEEM
              }
              return TRANSFER
          }

  matching:
    priority: "high"
    database: "postgres"
    
    implementation:
      - file: "internal/matching/engine.go"
        template: |
          package matching
          
          type MatchingEngine struct {
              db    *sql.DB
              cache *cache.TieredCache
          }
          
          func (m *MatchingEngine) Match(order Order) (*Match, error) {
              switch order.Intent {
              case SELL_MARKET:
                  return m.createListing(order)
              case BUY_MARKET:
                  return m.matchWithListing(order)
              default:
                  return m.directMatch(order)
              }
          }

  cashier:
    priority: "critical"
    integration: "firefly_iii"
    
    implementation:
      - file: "pkg/firefly/client.go"
        template: |
          package firefly
          
          type FireflyClient struct {
              baseURL string
              apiKey  string
              client  *http.Client
          }
          
          func (f *FireflyClient) CreateTransaction(t Transaction) error {
              // Double-entry bookkeeping
              entries := []Entry{
                  {Account: t.From, Type: "debit", Amount: t.Amount},
                  {Account: t.To, Type: "credit", Amount: t.Amount},
              }
              
              return f.postEntries(entries)
          }

nats_setup:
  deployment: |
    # Deploy NATS JetStream cluster on Fly.io
    fly apps create species-nats --org species-marketplace
    fly volumes create nats_data --size 10 --region iad --app species-nats
    fly deploy --app species-nats --config nats.fly.toml
  
  configuration: |
    # nats.fly.toml
    app = "species-nats"
    
    [build]
      image = "nats:2.10-alpine"
    
    [env]
      NATS_SERVER_NAME = "species-nats-1"
    
    [[services]]
      internal_port = 4222
      protocol = "tcp"
    
    [mounts]
      source = "nats_data"
      destination = "/data"
```

### Day 4-5: Asset Operations & Reconciliation (16 hours)

```yaml
task_id: "day4-5-assets"
agent: "Integration Agent"
dependencies: ["day2-3-core"]

services:
  asset_manager:
    priority: "critical"
    integration: "onli_cloud"
    protocol: "grpc"
    
    implementation:
      - file: "pkg/onlicloud/client.go"
        template: |
          package onlicloud
          
          import (
              "google.golang.org/grpc"
              "google.golang.org/grpc/credentials/insecure"
          )
          
          type OnliCloudClient struct {
              conn   *grpc.ClientConn
              issue  pb.IssueServiceClient
              asset  pb.AssetServiceClient
              oracle pb.OracleServiceClient
          }
          
          func NewClient(addr string) (*OnliCloudClient, error) {
              conn, err := grpc.Dial(
                  addr,
                  grpc.WithTransportCredentials(insecure.NewCredentials()),
                  grpc.WithDefaultCallOptions(
                      grpc.MaxCallRecvMsgSize(10*1024*1024),
                  ),
              )
              
              return &OnliCloudClient{
                  conn:   conn,
                  issue:  pb.NewIssueServiceClient(conn),
                  asset:  pb.NewAssetServiceClient(conn),
                  oracle: pb.NewOracleServiceClient(conn),
              }, err
          }
      
      - file: "internal/asset/operations.go"
        template: |
          package asset
          
          func (a *AssetManager) ExecuteIssue(event Event) error {
              req := &pb.IssueRequest{
                  To:        event.To,
                  AppSymbol: "SPECIES",
                  Amount:    strconv.Itoa(event.Amount),
                  Device:    "cloud",
              }
              
              resp, err := a.client.Issue(ctx, req)
              if err != nil {
                  return fmt.Errorf("issue failed: %w", err)
              }
              
              return a.emitOwnershipChanged(event.EventID, resp.IssueId)
          }

  floor_manager:
    priority: "high"
    features:
      - oracle_verification
      - receipt_generation
      - reconciliation
    
    implementation:
      - file: "internal/floor/reconciler.go"
        template: |
          package floor
          
          type Reconciler struct {
              oracle   *onlicloud.OracleClient
              firefly  *firefly.Client
              reporter *reporter.Client
          }
          
          func (r *Reconciler) Reconcile(event Event) (*Receipt, error) {
              // Verify with Oracle
              oracleResult, err := r.verifyWithOracle(event)
              if err != nil {
                  return nil, fmt.Errorf("oracle verification failed: %w", err)
              }
              
              // Generate comprehensive receipt
              receipt := &Receipt{
                  EventID:   event.EventID,
                  Status:    "COMPLETED",
                  Intent:    event.Intent,
                  Timestamp: time.Now(),
                  Oracle:    oracleResult,
              }
              
              // Store and emit
              r.reporter.StoreReceipt(receipt)
              return receipt, nil
          }

  reporter:
    priority: "medium"
    type: "read_only"
    cache: "aggressive"
    
    implementation:
      - file: "cmd/reporter/main.go"
        template: |
          package main
          
          import (
              "github.com/gin-gonic/gin"
              "github.com/species/marketplace/internal/reporter"
          )
          
          func main() {
              r := gin.Default()
              
              // Enable response caching
              r.Use(reporter.CacheMiddleware())
              
              // Read-only endpoints
              r.GET("/marketplace/v1/receipts/:eventId", reporter.GetReceipt)
              r.GET("/marketplace/v1/listings", reporter.GetActiveListings)
              r.GET("/marketplace/v1/users/:onliId/balance", reporter.GetBalance)
              r.GET("/marketplace/v1/users/:onliId/transactions", reporter.GetTransactions)
              
              r.Run(":8089")
          }

database_optimizations:
  indexes:
    - CREATE INDEX idx_listings_status_expires ON listings(status, expires_at) WHERE status = 'ACTIVE';
    - CREATE INDEX idx_receipts_event_id ON receipts(event_id);
    - CREATE INDEX idx_transactions_user_date ON transactions(user_id, created_at DESC);
  
  partitioning:
    - |
      CREATE TABLE event_ingress_2024_11 PARTITION OF event_ingress
      FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
```

### Day 6: MCP Server on Vercel (8 hours)

```yaml
task_id: "day6-mcp"
agent: "Frontend Agent"
platform: "vercel"
dependencies: ["day4-5-assets"]

mcp_server:
  framework: "next.js"
  runtime: "edge"
  
  project_structure:
    - api/
      - mcp/
        - configure.ts
        - transaction.ts
        - receipt.ts
    - lib/
      - mcp-sdk.ts
      - auth.ts
      - interpreter.ts
    - middleware.ts
    - next.config.js
    - vercel.json
  
  implementation:
    - file: "api/mcp/configure.ts"
      template: |
        import { NextRequest, NextResponse } from 'next/server';
        import { Redis } from '@upstash/redis';
        
        const redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
        
        export const runtime = 'edge';
        export const config = {
          api: {
            bodyParser: {
              sizeLimit: '1mb',
            },
          },
        };
        
        // API endpoint: https://mcp.species.market/api/mcp/configure
        
        export async function POST(request: NextRequest) {
          const { apiKey, secret } = await request.json();
          const sessionId = request.headers.get('x-session-id');
          
          if (!sessionId) {
            return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
          }
          
          // Store credentials in Redis with TTL
          await redis.setex(`session:${sessionId}`, 3600, {
            apiKey,
            secret: await hashSecret(secret),
          });
          
          return NextResponse.json({ 
            success: true, 
            message: 'Configuration stored for session' 
          });
        }
    
    - file: "api/mcp/transaction.ts"
      template: |
        import { NextRequest, NextResponse } from 'next/server';
        import { createHMAC, callMarketplaceAPI } from '@/lib/auth';
        
        export const runtime = 'edge';
        
        export async function POST(request: NextRequest) {
          const sessionId = request.headers.get('x-session-id');
          const credentials = await getCredentials(sessionId);
          
          if (!credentials) {
            return NextResponse.json({ error: 'Configure credentials first' }, { status: 401 });
          }
          
          const body = await request.json();
          const eventId = `evt-${Date.now()}-${generateId()}`;
          
          // Build event request
          const eventRequest = {
            eventId,
            from: body.from,
            to: body.to,
            amount: body.amount,
            payWith: body.paymentProof ? {
              currency: 'USDT',
              chain: body.chain || 'TRON',
              proof: body.paymentProof,
            } : undefined,
            putProceeds: body.usdtAddress ? {
              usdtAddress: body.usdtAddress,
              chain: body.chain || 'TRON',
            } : undefined,
          };
          
          // Create HMAC signature
          const headers = createHMACHeaders(
            credentials.apiKey,
            credentials.secret,
            eventRequest,
            eventId
          );
          
          // Make single API call
          const response = await callMarketplaceAPI('/marketplace/v1/events', {
            method: 'POST',
            headers,
            body: JSON.stringify(eventRequest),
          });
          
          return NextResponse.json({
            eventId,
            status: 'ACCEPTED',
            message: 'Transaction created successfully',
          });
        }
    
    - file: "lib/interpreter.ts"
      template: |
        export function interpretReceipt(receipt: EventReceipt): string {
          const status = receipt.status === 'COMPLETED' ? '✅' : '❌';
          
          return `
        📋 TRANSACTION RECEIPT
        ═════════════════════
        
        Event ID: ${receipt.eventId}
        Status: ${status} ${receipt.status}
        Type: ${receipt.intent}
        
        📍 TRANSACTION FLOW:
        From: ${receipt.from.onliId}
          Balance: ${receipt.from.startBalance} → ${receipt.from.endBalance} SPECIES
        
        To: ${receipt.to.onliId}
          Balance: ${receipt.to.startBalance} → ${receipt.to.endBalance} SPECIES
        
        Amount: ${receipt.amount.toLocaleString()} SPECIES
        
        💰 FEES:
        ${receipt.fees ? formatFees(receipt.fees) : 'No fees'}
        
        📝 SUMMARY:
        ${generateSummary(receipt)}
          `;
        }
    
    - file: "vercel.json"
      template: |
        {
          "functions": {
            "api/mcp/*.ts": {
              "runtime": "edge",
              "maxDuration": 10
            }
          },
          "env": {
            "MARKETPLACE_URL": "@marketplace-url",
            "UPSTASH_REDIS_REST_URL": "@upstash-redis-rest-url",
            "UPSTASH_REDIS_REST_TOKEN": "@upstash-redis-rest-token"
          },
          "headers": [
            {
              "source": "/api/mcp/(.*)",
              "headers": [
                {
                  "key": "Access-Control-Allow-Origin",
                  "value": "*"
                },
                {
                  "key": "Access-Control-Allow-Methods",
                  "value": "POST, OPTIONS"
                }
              ]
            }
          ]
        }
    
    - file: "middleware.ts"
      template: |
        import { NextResponse } from 'next/server';
        import type { NextRequest } from 'next/server';
        import { Ratelimit } from '@upstash/ratelimit';
        import { Redis } from '@upstash/redis';
        
        const ratelimit = new Ratelimit({
          redis: Redis.fromEnv(),
          limiter: Ratelimit.slidingWindow(10, '1 s'),
        });
        
        export async function middleware(request: NextRequest) {
          const ip = request.ip ?? '127.0.0.1';
          const { success } = await ratelimit.limit(ip);
          
          if (!success) {
            return NextResponse.json(
              { error: 'Rate limit exceeded' },
              { status: 429 }
            );
          }
          
          return NextResponse.next();
        }
        
        export const config = {
          matcher: '/api/mcp/:path*',
        };

deployment:
  commands:
    - vercel --prod
    - vercel env pull .env.production
    - vercel domains add mcp.species.market
  
  environment_variables:
    - MARKETPLACE_URL=https://api.species.fly.dev
    - UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
    - UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}
```

### Day 7: Monitoring & Observability (8 hours)

```yaml
task_id: "day7-monitoring"
agent: "DevOps Agent"
dependencies: ["day6-mcp"]

monitoring_stack:
  prometheus:
    deployment: |
      fly apps create species-prometheus --org species-marketplace
      fly volumes create prometheus_data --size 10 --region iad
      fly deploy --app species-prometheus --config prometheus.fly.toml
    
    configuration: |
      global:
        scrape_interval: 15s
        evaluation_interval: 15s
      
      scrape_configs:
        - job_name: 'fly-apps'
          consul_sd_configs:
            - server: 'consul.service.consul:8500'
              services:
                - species-api
                - species-authenticator
                - species-validator
          
        - job_name: 'vercel-mcp'
          static_configs:
            - targets: ['mcp.species.market:443']
          metrics_path: '/api/metrics'
  
  grafana:
    dashboards:
      - title: "SPECIES Marketplace Overview"
        panels:
          - transaction_volume
          - api_latency_p95
          - payment_verification_success_rate
          - mcp_usage
          - error_rate
    
    alerts:
      - name: "HighErrorRate"
        expr: "rate(http_requests_total{status=~'5..'}[5m]) > 0.01"
        severity: "critical"
      
      - name: "PaymentVerificationFailure"
        expr: "rate(payment_verification_total{status='failed'}[5m]) > 0.05"
        severity: "high"
      
      - name: "SlowMCPResponse"
        expr: "histogram_quantile(0.95, mcp_request_duration_seconds) > 1"
        severity: "warning"
  
  distributed_tracing:
    implementation: |
      # OpenTelemetry setup for all services
      import (
          "go.opentelemetry.io/otel"
          "go.opentelemetry.io/otel/exporters/otlp/otlptrace"
          "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
      )
      
      func InitTracing() {
          exporter, _ := otlptrace.New(
              context.Background(),
              otlptracehttp.NewClient(
                  otlptracehttp.WithEndpoint("otel-collector.fly.dev"),
                  otlptracehttp.WithInsecure(),
              ),
          )
          
          tp := trace.NewTracerProvider(
              trace.WithBatcher(exporter),
              trace.WithResource(resource.NewWithAttributes(
                  semconv.SchemaURL,
                  semconv.ServiceNameKey.String("species-marketplace"),
              )),
          )
          
          otel.SetTracerProvider(tp)
      }
  
  health_checks:
    endpoints:
      - /health/live
      - /health/ready
      - /metrics
    
    implementation: |
      func HealthCheck() gin.HandlerFunc {
          return func(c *gin.Context) {
              checks := map[string]bool{
                  "database": checkDatabase(),
                  "redis": checkRedis(),
                  "nats": checkNATS(),
                  "external_apis": checkExternalAPIs(),
              }
              
              healthy := true
              for _, v := range checks {
                  if !v {
                      healthy = false
                      break
                  }
              }
              
              if healthy {
                  c.JSON(200, gin.H{"status": "healthy", "checks": checks})
              } else {
                  c.JSON(503, gin.H{"status": "unhealthy", "checks": checks})
              }
          }
      }
```

### Day 8: Production Deployment & Testing (8 hours)

```yaml
task_id: "day8-production"
agent: "DevOps Agent"
dependencies: ["day7-monitoring"]

production_deployment:
  blue_green_strategy:
    steps:
      - Deploy to green environment
      - Run smoke tests
      - Run load tests
      - Switch traffic (10% → 50% → 100%)
      - Monitor for 2 hours
      - Keep blue as fallback
  
  load_testing:
    tool: "k6"
    scenarios:
      - name: "normal_load"
        vus: 100
        duration: "10m"
        rps: 10
        
      - name: "peak_load"
        vus: 500
        duration: "5m"
        rps: 50
        
      - name: "stress_test"
        vus: 1000
        duration: "2m"
        rps: 100
    
    script: |
      import http from 'k6/http';
      import { check } from 'k6';
      import { Rate } from 'k6/metrics';
      
      const errorRate = new Rate('errors');
      
      export default function() {
        const payload = {
          from: 'usr-test-1',
          to: 'treasury',
          amount: 1000,
          paymentProof: 'npmt_test_123',
        };
        
        const params = {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': __ENV.API_KEY,
            'X-Signature': generateHMAC(payload),
          },
        };
        
        const res = http.post(
          'https://api.species.fly.dev/marketplace/v1/events',
          JSON.stringify(payload),
          params
        );
        
        const success = check(res, {
          'status is 202': (r) => r.status === 202,
          'response time < 3000ms': (r) => r.timings.duration < 3000,
        });
        
        errorRate.add(!success);
      }
      
      export const options = {
        thresholds: {
          http_req_duration: ['p(95)<3000'],
          errors: ['rate<0.01'],
        },
      };
  
  security_scan:
    tools:
      - trivy (container scanning)
      - gosec (Go security)
      - npm audit (Node.js)
    
    commands:
      - trivy image species-marketplace:latest
      - gosec -fmt json -out gosec-report.json ./...
      - cd mcp-server && npm audit --production
  
  chaos_engineering:
    experiments:
      - name: "database_failure"
        action: "kill postgres primary"
        expected: "failover to read replica"
        
      - name: "redis_slowdown"
        action: "add 500ms latency to redis"
        expected: "degraded but operational"
        
      - name: "service_crash"
        action: "kill random service pod"
        expected: "auto-restart and recovery < 30s"
  
  rollback_plan:
    triggers:
      - Error rate > 1%
      - P95 latency > 5 seconds
      - Payment verification < 99%
    
    steps:
      - Switch traffic back to blue
      - Investigate issues
      - Fix and redeploy to green
      - Retry deployment

final_checklist:
  infrastructure:
    - [ ] All services deployed on Fly.io
    - [ ] MCP server live on Vercel
    - [ ] Redis cluster operational
    - [ ] PostgreSQL with replicas
    - [ ] NATS JetStream cluster ready
    
  functionality:
    - [ ] All transaction types working
    - [ ] Payment verification operational
    - [ ] MCP tools functional
    - [ ] Receipt generation accurate
    
  performance:
    - [ ] P95 latency < 3 seconds
    - [ ] Success rate > 99.9%
    - [ ] Load tests passed
    
  security:
    - [ ] HMAC validation working
    - [ ] Rate limiting active
    - [ ] Secrets properly managed
    - [ ] TLS everywhere
    
  monitoring:
    - [ ] Metrics flowing to Prometheus
    - [ ] Dashboards in Grafana
    - [ ] Alerts configured
    - [ ] Logs aggregated
    
  documentation:
    - [ ] API documentation complete
    - [ ] Runbooks created
    - [ ] MCP usage guide published
    - [ ] Deployment guide updated
```

## Success Metrics

```yaml
technical_kpis:
  uptime: ">99.95%"
  transaction_success_rate: ">99.9%"
  p95_latency: "<3 seconds"
  mcp_response_time: "<1 second"
  cache_hit_ratio: ">80%"

business_kpis:
  daily_active_users: 1000
  transaction_volume: "$1M/month"
  ai_initiated_transactions: "20% of volume"
  cost_per_transaction: "<$0.01"

operational_kpis:
  deployment_frequency: "daily"
  mean_time_to_recovery: "<15 minutes"
  error_budget_remaining: ">90%"
  runbook_coverage: "100%"
```

## Cost Optimization

```yaml
fly_io_costs:
  compute:
    - 10x shared-cpu-1x@$5.70 = $57/month
    - 3x dedicated-cpu-2x@$62 = $186/month (critical services)
  
  storage:
    - PostgreSQL 10GB = $20/month
    - Volumes 50GB = $7.50/month
  
  total_fly: ~$270/month

vercel_costs:
  - Pro plan = $20/month
  - Edge functions = ~$5/month
  - Total: $25/month

upstash_redis:
  - Pay-as-you-go = ~$50/month
  - Global replication included

moralis_costs:
  - Pro plan = $99-249/month
  - Unlimited requests
  - All chains included
  - Real-time webhooks

total_infrastructure: ~$444-594/month

comparison_to_alternatives:
  traditional_approach:
    - AWS/GCP: ~$735/month
    - Multiple blockchain APIs: ~$497/month
  our_approach:
    - 40-60% cost reduction
    - Better performance
    - Simpler operations
```

---

**Document Version**: 2.0.0  
**OpenSpec Version**: 1.0.0  
**Status**: Ready for AI Agent Execution  
**Timeline**: 8 days with 5 parallel agents  
**Primary Domain**: species.market  
**Blockchain Verification**: Moralis Pro
