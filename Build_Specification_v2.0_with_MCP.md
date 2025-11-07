# SPECIES Marketplace - Build Specification
## Technical Implementation Guide

---

## 1. Project Structure

```
species-marketplace/
├── cmd/
│   ├── authenticator/
│   ├── marketplace-api/
│   ├── validator/
│   ├── classifier/
│   ├── matching/
│   ├── cashier/
│   ├── asset-manager/
│   ├── floor-manager/
│   ├── reporter/
│   ├── config-service/
│   └── mcp-server/
├── internal/
│   ├── common/
│   │   ├── cache/
│   │   ├── circuit/
│   │   ├── events/
│   │   ├── logger/
│   │   └── metrics/
│   ├── models/
│   ├── repository/
│   └── services/
├── pkg/
│   ├── firefly/
│   ├── onlicloud/
│   ├── profiletray/
│   ├── nowpayments/
│   └── blockchain/
├── api/
│   ├── proto/
│   └── openapi/
├── configs/
├── deployments/
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
├── scripts/
│   ├── migrations/
│   └── setup/
├── test/
│   ├── unit/
│   ├── integration/
│   └── load/
├── docs/
├── go.mod
├── go.sum
├── Makefile
├── docker-compose.yml
└── README.md
```

---

## 2. Development Setup

### 2.1 Prerequisites

```bash
# Required Tools
go version  # Go 1.23+
docker --version  # Docker 24+
kubectl version  # Kubernetes 1.28+
psql --version  # PostgreSQL client 15+
redis-cli --version  # Redis client 7+

# Development Tools
golangci-lint --version  # v1.55+
mockgen --version  # v1.6+
protoc --version  # v3.21+
migrate --version  # v4.16+
```

### 2.2 Environment Setup

```bash
# Clone repository
git clone https://github.com/species/marketplace.git
cd species-marketplace

# Install dependencies
go mod download
go mod verify

# Install development tools
make install-tools

# Setup local environment
make setup-local

# Run database migrations
make migrate-up

# Generate code
make generate
```

### 2.3 Local Development

```bash
# Start infrastructure
docker-compose up -d postgres redis nats

# Run specific service
go run cmd/marketplace-api/main.go

# Run all services
make run-all

# Run with hot reload
air -c .air.toml
```

---

## 3. Service Implementation

### 3.1 Common Package Structure

```go
// internal/common/base_service.go
package common

import (
    "context"
    "github.com/nats-io/nats.go"
    "go.uber.org/zap"
)

type BaseService struct {
    Logger      *zap.Logger
    NatsConn    *nats.Conn
    JetStream   nats.JetStreamContext
    Metrics     *MetricsCollector
    Cache       CacheManager
    CircuitBreaker CircuitBreaker
}

type ServiceConfig struct {
    Name        string
    Version     string
    NatsURL     string
    RedisURL    string
    LogLevel    string
    MetricsPort int
}

func NewBaseService(cfg ServiceConfig) (*BaseService, error) {
    // Implementation
}
```

### 3.2 Event Bus Implementation

```go
// internal/common/events/bus.go
package events

import (
    "context"
    "encoding/json"
    "time"
    
    "github.com/nats-io/nats.go"
)

type EventBus interface {
    Publish(ctx context.Context, topic string, event Event) error
    Subscribe(ctx context.Context, topic string, handler EventHandler) error
    QueueSubscribe(ctx context.Context, topic string, queue string, handler EventHandler) error
}

type Event struct {
    ID        string          `json:"eventId"`
    Topic     string          `json:"topic"`
    Timestamp time.Time       `json:"timestamp"`
    Payload   json.RawMessage `json:"payload"`
    Metadata  EventMetadata   `json:"metadata"`
}

type EventMetadata struct {
    CorrelationID string            `json:"correlationId"`
    CausationID   string            `json:"causationId"`
    UserID        string            `json:"userId,omitempty"`
    TraceID       string            `json:"traceId"`
    SpanID        string            `json:"spanId"`
    Retries       int               `json:"retries"`
    Headers       map[string]string `json:"headers,omitempty"`
}

type EventHandler func(ctx context.Context, event Event) error
```

### 3.3 Cache Manager

```go
// internal/common/cache/manager.go
package cache

import (
    "context"
    "encoding/json"
    "fmt"
    "time"
    
    "github.com/redis/go-redis/v9"
    "github.com/patrickmn/go-cache"
)

type CacheManager interface {
    Get(ctx context.Context, key string, dest interface{}) error
    Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error
    Delete(ctx context.Context, key string) error
    Exists(ctx context.Context, key string) (bool, error)
}

type TieredCache struct {
    l1Cache *cache.Cache      // In-memory
    l2Cache *redis.Client     // Redis
    config  CacheConfig
}

type CacheConfig struct {
    L1TTL          time.Duration
    L1MaxSize      int
    L2TTL          time.Duration
    EnableL1       bool
    EnableL2       bool
    KeyPrefix      string
    SerializeFunc  func(interface{}) ([]byte, error)
    DeserializeFunc func([]byte, interface{}) error
}

func NewTieredCache(redisClient *redis.Client, config CacheConfig) *TieredCache {
    return &TieredCache{
        l1Cache: cache.New(config.L1TTL, config.L1TTL*2),
        l2Cache: redisClient,
        config:  config,
    }
}
```

### 3.4 Circuit Breaker

```go
// internal/common/circuit/breaker.go
package circuit

import (
    "context"
    "time"
    
    "github.com/sony/gobreaker"
)

type CircuitBreaker interface {
    Execute(ctx context.Context, fn func() (interface{}, error)) (interface{}, error)
    State() string
}

type BreakerConfig struct {
    Name            string
    MaxRequests     uint32
    Interval        time.Duration
    Timeout         time.Duration
    FailureRatio    float64
    MinRequests     uint32
    OnStateChange   func(name string, from, to gobreaker.State)
}

func NewCircuitBreaker(config BreakerConfig) CircuitBreaker {
    settings := gobreaker.Settings{
        Name:        config.Name,
        MaxRequests: config.MaxRequests,
        Interval:    config.Interval,
        Timeout:     config.Timeout,
        ReadyToTrip: func(counts gobreaker.Counts) bool {
            failureRatio := float64(counts.ConsecutiveFailures) / float64(counts.Requests)
            return counts.Requests >= config.MinRequests && failureRatio >= config.FailureRatio
        },
        OnStateChange: config.OnStateChange,
    }
    
    return &circuitBreakerImpl{
        breaker: gobreaker.NewCircuitBreaker(settings),
    }
}
```

---

## 4. Database Management

### 4.1 Migration Strategy

```sql
-- migrations/001_initial_schema.up.sql
BEGIN;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create enum types
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'INVITED');
CREATE TYPE listing_status AS ENUM ('PENDING', 'ACTIVE', 'RESERVED', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE match_status AS ENUM ('RESERVED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'DELIVERED', 'FAILED');

-- Create tables (as specified in PRD)
-- ... 

COMMIT;
```

### 4.2 Repository Pattern

```go
// internal/repository/user_repository.go
package repository

import (
    "context"
    "database/sql"
    "time"
    
    "github.com/jmoiron/sqlx"
)

type UserRepository interface {
    GetByOnliID(ctx context.Context, onliID string) (*MarketplaceUser, error)
    GetByAPIKey(ctx context.Context, apiKey string) (*MarketplaceUser, error)
    Create(ctx context.Context, user *MarketplaceUser) error
    Update(ctx context.Context, user *MarketplaceUser) error
    BulkUpsert(ctx context.Context, users []*MarketplaceUser) error
}

type userRepository struct {
    db *sqlx.DB
}

func NewUserRepository(db *sqlx.DB) UserRepository {
    return &userRepository{db: db}
}
```

---

## 5. External Integrations

### 5.1 ProfileTray Client

```go
// pkg/profiletray/client.go
package profiletray

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type Client interface {
    GetUserSecret(ctx context.Context, onliID string) (string, error)
    SyncUsers(ctx context.Context, page, pageSize int) ([]*User, error)
    UpdateUserContext(ctx context.Context, onliID string, context map[string]interface{}) error
}

type ProfileTrayClient struct {
    baseURL    string
    apiKey     string
    appKey     string
    httpClient *http.Client
    cache      CacheManager
}

func NewProfileTrayClient(baseURL, apiKey, appKey string, cache CacheManager) *ProfileTrayClient {
    return &ProfileTrayClient{
        baseURL: baseURL,
        apiKey:  apiKey,
        appKey:  appKey,
        httpClient: &http.Client{
            Timeout: 10 * time.Second,
        },
        cache: cache,
    }
}
```

### 5.2 Onli Cloud Client

```go
// pkg/onlicloud/client.go
package onlicloud

import (
    "context"
    "google.golang.org/grpc"
)

type Client interface {
    Issue(ctx context.Context, req *IssueRequest) (*IssueResponse, error)
    AskToMove(ctx context.Context, req *AskToMoveRequest) (*AskToMoveResponse, error)
    ChangeOwner(ctx context.Context, req *ChangeOwnerRequest) (*ChangeOwnerResponse, error)
    AuthorizeBehavior(ctx context.Context, req *AuthorizeBehaviorRequest) (*AuthorizeBehaviorResponse, error)
}

type OnliCloudClient struct {
    conn      *grpc.ClientConn
    issueClient IssueServiceClient
    assetClient AssetServiceClient
    authClient  AuthServiceClient
}
```

### 5.3 Payment Verification

```go
// pkg/nowpayments/client.go
package nowpayments

type Client interface {
    VerifyPayment(ctx context.Context, paymentID string) (*PaymentDetails, error)
    CreatePayment(ctx context.Context, req *PaymentRequest) (*PaymentResponse, error)
}

// pkg/blockchain/tron.go
package blockchain

type TronClient interface {
    VerifyTransaction(ctx context.Context, txHash string) (*TransactionDetails, error)
    GetConfirmations(ctx context.Context, txHash string) (int, error)
}
```

---

## 6. MCP Server Implementation

### 6.1 MCP Server Architecture

The Model Context Protocol (MCP) server provides AI-assisted interaction with the SPECIES Marketplace, enabling secure transaction creation and receipt interpretation through AI assistants.

```
┌─────────────────────────────────────────────┐
│         AI Assistant (Claude, etc.)          │
└─────────────────┬───────────────────────────┘
                  │ MCP Protocol
                  ▼
┌─────────────────────────────────────────────┐
│            MCP Server                        │
│  ┌─────────────────────────────────────┐    │
│  │  • Credential Management            │    │
│  │  • HMAC Signature Generation        │    │
│  │  • Receipt Interpretation           │    │
│  └─────────────────────────────────────┘    │
└─────────────────┬───────────────────────────┘
                  │ Authenticated API Calls
                  ▼
┌─────────────────────────────────────────────┐
│         SPECIES Marketplace API              │
└─────────────────────────────────────────────┘
```

### 6.2 MCP Service Implementation

```typescript
// cmd/mcp-server/main.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SpeciesMCPServer } from '../../pkg/mcp/protocol/server';
import { HMACAuthenticator } from '../../pkg/mcp/auth/hmac';
import { ReceiptInterpreter } from '../../pkg/mcp/receipt/interpreter';

async function main() {
  const config = {
    marketplaceUrl: process.env.MARKETPLACE_URL || 'https://api.species.io',
    environment: process.env.ENVIRONMENT || 'production',
  };
  
  const server = new SpeciesMCPServer({
    authenticator: new HMACAuthenticator(),
    interpreter: new ReceiptInterpreter(),
    config,
  });
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('SPECIES MCP Server started');
}

main().catch(console.error);
```

### 6.3 MCP Authentication Handler

```go
// pkg/mcp/auth/hmac.go
package auth

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/base64"
    "fmt"
    "time"
)

type HMACAuthenticator struct {
    credentials *UserCredentials
}

type UserCredentials struct {
    APIKey string `json:"apiKey"`
    Secret string `json:"secret"`
}

func (h *HMACAuthenticator) CreateHeaders(
    body string,
    eventID string,
) map[string]string {
    nonce := generateNonce()
    timestamp := time.Now().UTC().Format(time.RFC3339)
    
    signature := h.createSignature(body, nonce, timestamp)
    
    return map[string]string{
        "Content-Type": "application/json",
        "X-API-Key":    h.credentials.APIKey,
        "X-Nonce":      nonce,
        "X-Timestamp":  timestamp,
        "X-Signature":  signature,
        "X-Event-Id":   eventID,
    }
}

func (h *HMACAuthenticator) createSignature(
    body, nonce, timestamp string,
) string {
    message := body + nonce + timestamp
    mac := hmac.New(sha256.New, []byte(h.credentials.Secret))
    mac.Write([]byte(message))
    return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
```

### 6.4 MCP Receipt Interpreter

```go
// pkg/mcp/receipt/interpreter.go
package receipt

import (
    "fmt"
    "strings"
    "time"
)

type Interpreter struct{}

func (i *Interpreter) InterpretReceipt(receipt EventReceipt) string {
    var sb strings.Builder
    
    sb.WriteString("📋 TRANSACTION RECEIPT INTERPRETATION\n")
    sb.WriteString("═══════════════════════════════════════\n\n")
    
    // Status
    sb.WriteString(fmt.Sprintf("Event ID: %s\n", receipt.EventID))
    sb.WriteString(fmt.Sprintf("Status: %s\n", formatStatus(receipt.Status)))
    sb.WriteString(fmt.Sprintf("Type: %s\n\n", receipt.Intent))
    
    // Transaction flow
    sb.WriteString("📍 TRANSACTION FLOW:\n")
    sb.WriteString(fmt.Sprintf("From: %s\n", receipt.From.OnliID))
    if receipt.From.StartBalance != nil {
        sb.WriteString(fmt.Sprintf("  Start: %d SPECIES\n", *receipt.From.StartBalance))
        sb.WriteString(fmt.Sprintf("  End: %d SPECIES\n", *receipt.From.EndBalance))
    }
    
    sb.WriteString(fmt.Sprintf("\nTo: %s\n", receipt.To.OnliID))
    if receipt.To.StartBalance != nil {
        sb.WriteString(fmt.Sprintf("  Start: %d SPECIES\n", *receipt.To.StartBalance))
        sb.WriteString(fmt.Sprintf("  End: %d SPECIES\n", *receipt.To.EndBalance))
    }
    
    sb.WriteString(fmt.Sprintf("\nAmount: %d SPECIES\n", receipt.Amount))
    
    // Payment verification
    if len(receipt.Payments) > 0 {
        sb.WriteString("\n💳 PAYMENT VERIFICATION:\n")
        for _, payment := range receipt.Payments {
            sb.WriteString(fmt.Sprintf("Provider: %s\n", payment.Provider))
            sb.WriteString(fmt.Sprintf("Amount: %.2f USDT\n", payment.Amount))
            sb.WriteString(fmt.Sprintf("Confirmations: %d\n", payment.Confirmations))
        }
    }
    
    // Fees
    if receipt.Fees != nil && receipt.Fees.Total > 0 {
        sb.WriteString("\n💰 FEES:\n")
        sb.WriteString(fmt.Sprintf("Total: $%.2f USDT\n", receipt.Fees.Total))
    }
    
    // Summary
    sb.WriteString("\n📝 SUMMARY:\n")
    sb.WriteString(i.generateSummary(receipt))
    
    return sb.String()
}
```

### 6.5 MCP Tools Configuration

```yaml
# configs/mcp-tools.yaml
tools:
  - name: species_configure
    description: Configure API credentials
    requiresConfirmation: false
    inputSchema:
      type: object
      required: [apiKey, secret]
      properties:
        apiKey:
          type: string
          description: Marketplace API key
        secret:
          type: string
          description: ProfileTray secret
          
  - name: species_create_transaction
    description: Create SPECIES transaction
    requiresConfirmation: false  # Single call, user provides auth
    inputSchema:
      type: object
      required: [from, to, amount]
      properties:
        from:
          type: string
          description: Sender's onliId
        to:
          type: string
          description: Recipient's onliId or 'treasury'
        amount:
          type: number
          minimum: 1
        paymentProof:
          type: string
          description: Payment proof (npmt_* or tx hash)
        chain:
          type: string
          enum: [TRON, ETH, BSC]
          default: TRON
          
  - name: species_get_receipt
    description: Get and interpret transaction receipt
    requiresConfirmation: false
    inputSchema:
      type: object
      required: [eventId]
      properties:
        eventId:
          type: string
```

### 6.6 MCP Docker Configuration

```dockerfile
# deployments/docker/Dockerfile.mcp
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY cmd/mcp-server/package*.json ./
RUN npm ci --only=production

# Copy source
COPY cmd/mcp-server/ ./
COPY pkg/mcp/ ./pkg/mcp/

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:20-alpine

RUN apk add --no-cache tini
RUN addgroup -g 1001 -S species && \
    adduser -u 1001 -S species -G species

WORKDIR /app

COPY --from=builder --chown=species:species /app/dist ./dist
COPY --from=builder --chown=species:species /app/node_modules ./node_modules

USER species
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
```

### 6.7 MCP Integration Tests

```go
// test/integration/mcp_test.go
package integration

import (
    "testing"
    "github.com/species/marketplace/pkg/mcp/auth"
    "github.com/species/marketplace/pkg/mcp/receipt"
)

func TestMCPTransactionFlow(t *testing.T) {
    // Test credential configuration
    authenticator := &auth.HMACAuthenticator{}
    err := authenticator.Configure(&auth.UserCredentials{
        APIKey: "test_api_key",
        Secret: "test_secret",
    })
    assert.NoError(t, err)
    
    // Test header generation
    headers := authenticator.CreateHeaders(
        `{"from":"usr-1","to":"treasury","amount":1000}`,
        "evt-test-123",
    )
    assert.Contains(t, headers, "X-Signature")
    assert.Contains(t, headers, "X-API-Key")
    
    // Test receipt interpretation
    interpreter := &receipt.Interpreter{}
    interpretation := interpreter.InterpretReceipt(mockReceipt)
    assert.Contains(t, interpretation, "TRANSACTION RECEIPT")
    assert.Contains(t, interpretation, "COMPLETED")
}
```

---

## 7. Testing Framework

### 6.1 Unit Test Structure

```go
// test/unit/authenticator_test.go
package unit

import (
    "testing"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
)

func TestAuthenticator_ValidateHMAC(t *testing.T) {
    tests := []struct {
        name      string
        headers   map[string]string
        body      string
        secret    string
        wantErr   bool
        errorCode string
    }{
        {
            name: "valid signature",
            // ...
        },
        {
            name: "expired timestamp",
            // ...
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Test implementation
        })
    }
}
```

### 6.2 Integration Tests

```go
// test/integration/flow_test.go
package integration

import (
    "testing"
    "github.com/testcontainers/testcontainers-go"
)

func TestBuyTreasuryFlow(t *testing.T) {
    // Start test containers
    ctx := context.Background()
    postgres, _ := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
        ContainerRequest: testcontainers.ContainerRequest{
            Image: "postgres:15",
            // ...
        },
    })
    defer postgres.Terminate(ctx)
    
    // Run flow test
    // ...
}
```

### 6.3 Load Testing

```javascript
// test/load/scenarios.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<3000'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function() {
    // Test scenario
}
```

---

## 7. Deployment Pipeline

### 7.1 CI/CD Configuration

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - security
  - deploy

variables:
  GO_VERSION: "1.23"
  DOCKER_REGISTRY: "registry.species.io"

before_script:
  - apt-get update -qq && apt-get install -y -qq git
  - go version

build:
  stage: build
  script:
    - make build-all
    - make docker-build
  artifacts:
    paths:
      - bin/
    expire_in: 1 week

test:
  stage: test
  script:
    - make test-unit
    - make test-integration
  coverage: '/coverage: \d+.\d+%/'

security:
  stage: security
  script:
    - make security-scan
    - make dependency-check

deploy-staging:
  stage: deploy
  script:
    - make deploy-staging
  environment:
    name: staging
  when: manual

deploy-production:
  stage: deploy
  script:
    - make deploy-production
  environment:
    name: production
  when: manual
  only:
    - tags
```

### 7.2 Docker Compose Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Infrastructure
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: species
      POSTGRES_USER: species
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  nats:
    image: nats:latest
    ports:
      - "4222:4222"
      - "8222:8222"
    command: ["-js"]

  # Core Services
  marketplace-api:
    build:
      context: .
      dockerfile: deployments/docker/Dockerfile.marketplace-api
    ports:
      - "8080:8080"
    environment:
      - DB_HOST=postgres
      - REDIS_URL=redis:6379
      - NATS_URL=nats://nats:4222
    depends_on:
      - postgres
      - redis
      - nats

  authenticator:
    build:
      context: .
      dockerfile: deployments/docker/Dockerfile.authenticator
    environment:
      - DB_HOST=postgres
      - REDIS_URL=redis:6379
      - NATS_URL=nats://nats:4222
    depends_on:
      - postgres
      - redis
      - nats

  # MCP Server (AI Assistant Integration)
  mcp-server:
    build:
      context: .
      dockerfile: deployments/docker/Dockerfile.mcp
    ports:
      - "3000:3000"  # For MCP protocol
    environment:
      - MARKETPLACE_URL=http://marketplace-api:8080
      - ENVIRONMENT=development
    depends_on:
      - marketplace-api
    volumes:
      - ./configs/mcp-tools.yaml:/app/configs/mcp-tools.yaml:ro

  # Monitoring
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./configs/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    depends_on:
      - prometheus

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:
```

### 7.3 Kubernetes Deployment

```yaml
# deployments/kubernetes/marketplace-api.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: marketplace-api
  namespace: species
spec:
  replicas: 3
  selector:
    matchLabels:
      app: marketplace-api
  template:
    metadata:
      labels:
        app: marketplace-api
    spec:
      containers:
      - name: api
        image: registry.species.io/marketplace-api:v5
        ports:
        - containerPort: 8080
        env:
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: host
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
---
# MCP Server Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
  namespace: species
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
      - name: mcp
        image: registry.species.io/mcp-server:v1
        ports:
        - containerPort: 3000
          name: mcp
        env:
        - name: MARKETPLACE_URL
          value: "http://marketplace-api:8080"
        - name: ENVIRONMENT
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-server
  namespace: species
spec:
  selector:
    app: mcp-server
  ports:
  - port: 3000
    targetPort: 3000
    name: mcp
  type: ClusterIP
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
```

---

## 8. Monitoring Setup

### 8.1 Prometheus Configuration

```yaml
# configs/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'species-marketplace'
    static_configs:
      - targets: 
        - 'authenticator:9090'
        - 'marketplace-api:9090'
        - 'validator:9090'
        - 'classifier:9090'
        - 'matching:9090'
        - 'cashier:9090'
        - 'asset-manager:9090'
        - 'floor-manager:9090'
        - 'reporter:9090'
```

### 8.2 Grafana Dashboard

```json
{
  "dashboard": {
    "title": "SPECIES Marketplace",
    "panels": [
      {
        "title": "Transaction Volume",
        "targets": [
          {
            "expr": "sum(rate(species_transactions_total[5m])) by (intent)"
          }
        ]
      },
      {
        "title": "API Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ]
      }
    ]
  }
}
```

---

## 9. Development Workflow

### 9.1 Makefile Commands

```makefile
# Makefile
.PHONY: help
help: ## Display this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.PHONY: setup-local
setup-local: ## Setup local development environment
	@echo "Setting up local environment..."
	docker-compose up -d postgres redis nats
	make migrate-up
	make generate

.PHONY: build-all
build-all: ## Build all services
	@echo "Building all services..."
	@for service in cmd/*; do \
		if [ "$$(basename $$service)" = "mcp-server" ]; then \
			echo "Building MCP server (Node.js)..."; \
			cd $$service && npm ci && npm run build && cd ../..; \
		else \
			echo "Building $$service..."; \
			go build -o bin/$$(basename $$service) ./$$service; \
		fi \
	done

.PHONY: build-mcp
build-mcp: ## Build MCP server
	@echo "Building MCP server..."
	cd cmd/mcp-server && npm ci && npm run build

.PHONY: run-mcp
run-mcp: ## Run MCP server in development mode
	cd cmd/mcp-server && npm run dev

.PHONY: test-unit
test-unit: ## Run unit tests
	go test -v -cover ./internal/... ./pkg/...

.PHONY: test-integration
test-integration: ## Run integration tests
	go test -v -tags=integration ./test/integration/...

.PHONY: generate
generate: ## Generate code
	go generate ./...
	protoc --go_out=. --go-grpc_out=. api/proto/*.proto
	mockgen -source=internal/services/interfaces.go -destination=mocks/services.go

.PHONY: lint
lint: ## Run linters
	golangci-lint run --deadline=5m

.PHONY: migrate-up
migrate-up: ## Run database migrations
	migrate -path scripts/migrations -database "postgresql://$(DB_URL)" up

.PHONY: migrate-down
migrate-down: ## Rollback database migrations
	migrate -path scripts/migrations -database "postgresql://$(DB_URL)" down

.PHONY: docker-build-mcp
docker-build-mcp: ## Build MCP server Docker image
	docker build -t species-mcp-server:latest -f deployments/docker/Dockerfile.mcp .

.PHONY: test-mcp
test-mcp: ## Test MCP server integration
	cd cmd/mcp-server && npm test

.PHONY: mcp-dev
mcp-dev: ## Run MCP server with Claude Desktop
	cd cmd/mcp-server && npm run dev
```

### 9.2 Git Workflow

```bash
# Branch naming
feature/SPEC-123-add-caching
bugfix/SPEC-456-fix-validation
hotfix/SPEC-789-critical-issue

# Commit message format
feat: add caching layer to ProfileTray client
fix: validate payment proof amount within tolerance
docs: update API documentation for v5
test: add integration tests for listing flow
refactor: extract common validation logic
```

---

## 10. Performance Tuning

### 10.1 Database Optimization

```sql
-- Create indexes for common queries
CREATE INDEX CONCURRENTLY idx_users_onli_id ON marketplace_users(onli_id);
CREATE INDEX CONCURRENTLY idx_users_api_key ON marketplace_users(api_key_id);
CREATE INDEX CONCURRENTLY idx_listings_status_expires ON listings(status, expires_at) WHERE status IN ('ACTIVE', 'PENDING');
CREATE INDEX CONCURRENTLY idx_events_status_created ON event_ingress(status, created_at);

-- Partition large tables
CREATE TABLE event_ingress_2024_11 PARTITION OF event_ingress
FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
```

### 10.2 Connection Pooling

```go
// internal/database/pool.go
package database

import (
    "database/sql"
    "time"
    
    "github.com/jmoiron/sqlx"
)

func NewDBPool(dsn string) (*sqlx.DB, error) {
    db, err := sqlx.Open("postgres", dsn)
    if err != nil {
        return nil, err
    }
    
    // Configure connection pool
    db.SetMaxIdleConns(10)
    db.SetMaxOpenConns(100)
    db.SetConnMaxLifetime(time.Hour)
    db.SetConnMaxIdleTime(10 * time.Minute)
    
    return db, nil
}
```

---

## 11. Security Checklist

- [ ] HMAC signature validation on all endpoints
- [ ] Rate limiting configured per API key
- [ ] Circuit breakers on external services
- [ ] Secrets management via environment variables
- [ ] TLS enabled for all external communications
- [ ] Database connections use SSL
- [ ] Audit logging for all transactions
- [ ] Input validation and sanitization
- [ ] SQL injection prevention via parameterized queries
- [ ] Dependency scanning in CI/CD pipeline

---

## 12. Launch Checklist

### Pre-Production
- [ ] All services deployed and healthy
- [ ] Database migrations completed
- [ ] ProfileTray integration tested
- [ ] Payment providers configured
- [ ] Monitoring dashboards created
- [ ] Alerting rules configured
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Runbooks created

### Production Launch
- [ ] DNS records configured
- [ ] SSL certificates installed
- [ ] Backup strategy implemented
- [ ] Disaster recovery tested
- [ ] On-call rotation scheduled
- [ ] Feature flags configured
- [ ] Gradual rollout plan
- [ ] Rollback procedure tested
- [ ] Communication plan ready
- [ ] Support team trained

---

## 13. MCP Server Configuration

### 13.1 Claude Desktop Integration

To use the MCP server with Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "species-local": {
      "command": "node",
      "args": ["./cmd/mcp-server/dist/main.js"],
      "cwd": "/path/to/species-marketplace",
      "env": {
        "MARKETPLACE_URL": "http://localhost:8080",
        "ENVIRONMENT": "development"
      }
    },
    "species-production": {
      "command": "docker",
      "args": ["run", "-i", "species-mcp-server:latest"],
      "env": {
        "MARKETPLACE_URL": "https://api.species.io",
        "ENVIRONMENT": "production"
      }
    }
  }
}
```

### 13.2 MCP Development Workflow

```bash
# 1. Start local marketplace services
docker-compose up -d

# 2. Build MCP server
make build-mcp

# 3. Test MCP integration
make test-mcp

# 4. Run MCP server for Claude Desktop
make mcp-dev

# 5. In Claude Desktop, test with:
# "Configure my SPECIES account with API key 'mk_test' and secret 'secret_test'"
# "Buy 100 SPECIES from treasury, payment proof npmt_test123"
# "Get receipt for evt-123456"
```

### 13.3 MCP Security Considerations

```yaml
# configs/mcp-security.yaml
security:
  credentials:
    storage: "none"  # Never store user credentials
    transmission: "encrypted"  # TLS only
    
  authentication:
    method: "hmac-sha256"
    nonceWindow: 60  # seconds
    timestampTolerance: 60  # seconds
    
  rateLimit:
    global: 100  # requests per minute
    perUser: 20  # requests per minute
    
  audit:
    logLevel: "info"
    includeRequests: true
    includeResponses: false  # Don't log sensitive receipts
    retention: 90  # days
```

### 13.4 MCP Monitoring

```go
// internal/metrics/mcp.go
package metrics

var (
    MCPRequestTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "mcp_requests_total",
            Help: "Total MCP requests by tool",
        },
        []string{"tool", "status"},
    )
    
    MCPAuthFailures = prometheus.NewCounter(
        prometheus.CounterOpts{
            Name: "mcp_auth_failures_total",
            Help: "Total MCP authentication failures",
        },
    )
    
    MCPReceiptInterpretations = prometheus.NewHistogram(
        prometheus.HistogramOpts{
            Name: "mcp_receipt_interpretation_duration_seconds",
            Help: "Time to interpret receipts",
            Buckets: []float64{0.01, 0.05, 0.1, 0.5, 1.0},
        },
    )
)
```

### 13.5 MCP Error Handling

```typescript
// pkg/mcp/protocol/errors.ts
export enum MCPErrorCode {
  // Authentication
  AUTH_MISSING_CREDENTIALS = "MCP001",
  AUTH_INVALID_SIGNATURE = "MCP002",
  
  // Configuration
  CONFIG_NOT_SET = "MCP010",
  CONFIG_INVALID = "MCP011",
  
  // Transaction
  TRANSACTION_FAILED = "MCP020",
  RECEIPT_NOT_FOUND = "MCP021",
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = "MCP030",
}

export class MCPError extends Error {
  constructor(
    public code: MCPErrorCode,
    message: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "MCPError";
  }
}
```

---

## 14. Production Deployment Checklist

**Build Specification Version**: 1.1 (with MCP Server)  
**Date**: November 2024  
**Status**: Ready for Implementation

---

## 12. MCP Server Integration

### 12.1 Overview

The Model Context Protocol (MCP) server enables AI assistants to interact with the SPECIES Marketplace on behalf of users. It provides a secure, standardized interface for transaction creation and receipt interpretation using user-provided credentials.

### 12.2 Architecture

```
┌─────────────────────┐
│   AI Assistant      │
│   (Claude, etc.)    │
└──────────┬──────────┘
           │ MCP Protocol
           ▼
┌─────────────────────┐
│   MCP Server        │ ← User provides API key + secret
│   (Signing Proxy)   │
└──────────┬──────────┘
           │ HMAC-Signed API Call
           ▼
┌─────────────────────┐
│ Marketplace API     │
│ (Single Call)       │
└─────────────────────┘
           │
           ▼
    Returns Receipt
```

### 12.3 Key Design Principles

- **No Credential Storage**: User provides API key and secret each session
- **Single API Call**: One authenticated request per transaction
- **Receipt Interpretation**: Human-readable explanation of results
- **HMAC Authentication**: Secure request signing with user's secret

### 12.4 MCP Server Implementation

#### Directory Structure

```
cmd/mcp-server/
├── main.go                 # Entry point
├── server.go               # MCP server implementation
├── auth.go                 # HMAC signing logic
├── handlers.go             # Tool handlers
├── interpreter.go          # Receipt interpretation
└── README.md              # MCP documentation
```

#### Core Authentication Logic

```go
// cmd/mcp-server/auth.go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/base64"
    "encoding/json"
    "time"
)

func createAuthHeaders(apiKey, secret string, body interface{}, eventID string) map[string]string {
    nonce := generateUUID()
    timestamp := time.Now().Format(time.RFC3339)
    
    // Serialize body
    bodyBytes, _ := json.Marshal(body)
    
    // Create signature: HMAC-SHA256(body + nonce + timestamp, secret)
    message := string(bodyBytes) + nonce + timestamp
    h := hmac.New(sha256.New, []byte(secret))
    h.Write([]byte(message))
    signature := base64.StdEncoding.EncodeToString(h.Sum(nil))
    
    return map[string]string{
        "X-API-Key":   apiKey,
        "X-Nonce":     nonce,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
        "X-Event-Id":  eventID,
    }
}
```

#### MCP Tools

```go
// cmd/mcp-server/handlers.go
package main

// Tool 1: Configure credentials (session-only)
func (s *MCPServer) handleConfigure(args map[string]interface{}) Response {
    s.credentials = &UserCredentials{
        APIKey: args["apiKey"].(string),
        Secret: args["secret"].(string),
    }
    return Response{Success: true, Message: "Configured"}
}

// Tool 2: Create transaction (single API call)
func (s *MCPServer) handleCreateTransaction(args map[string]interface{}) Response {
    if s.credentials == nil {
        return Response{Error: "Configure credentials first"}
    }
    
    // Build event request
    eventID := generateEventID()
    request := EventRequest{
        EventID: eventID,
        From:    args["from"].(string),
        To:      args["to"].(string),
        Amount:  args["amount"].(float64),
    }
    
    // Add optional payment proof
    if proof, ok := args["paymentProof"].(string); ok {
        request.PayWith = &PaymentProof{
            Currency: "USDT",
            Chain:    "TRON",
            Proof:    proof,
        }
    }
    
    // Sign and send
    headers := createAuthHeaders(s.credentials.APIKey, s.credentials.Secret, request, eventID)
    response := s.callMarketplaceAPI("/marketplace/v1/events", request, headers)
    
    return Response{
        EventID: eventID,
        Status:  "ACCEPTED",
        Message: "Transaction created",
    }
}

// Tool 3: Get and interpret receipt
func (s *MCPServer) handleGetReceipt(args map[string]interface{}) Response {
    eventID := args["eventId"].(string)
    
    // Get receipt with authenticated call
    headers := createAuthHeaders(s.credentials.APIKey, s.credentials.Secret, nil, eventID)
    receipt := s.getReceipt(eventID, headers)
    
    // Interpret for human understanding
    interpretation := s.interpretReceipt(receipt)
    
    return Response{
        Receipt:        receipt,
        Interpretation: interpretation,
    }
}
```

#### Receipt Interpretation

```go
// cmd/mcp-server/interpreter.go
package main

func (s *MCPServer) interpretReceipt(receipt *EventReceipt) string {
    return fmt.Sprintf(`
📋 TRANSACTION RECEIPT INTERPRETATION
═══════════════════════════════════════

Event ID: %s
Status: %s (%s)
Transaction Type: %s

📍 TRANSACTION FLOW:
From: %s
  Starting Balance: %d SPECIES
  Ending Balance: %d SPECIES
  
To: %s
  Starting Balance: %d SPECIES
  Ending Balance: %d SPECIES

Amount Transferred: %d SPECIES

💳 PAYMENT VERIFICATION:
%s

💰 FEE BREAKDOWN:
%s

📝 SUMMARY:
%s
`,
        receipt.EventID,
        formatStatus(receipt.Status),
        receipt.Status,
        receipt.Intent,
        receipt.From.OnliID,
        receipt.From.StartBalance,
        receipt.From.EndBalance,
        receipt.To.OnliID,
        receipt.To.StartBalance,
        receipt.To.EndBalance,
        receipt.Amount,
        formatPayments(receipt.Payments),
        formatFees(receipt.Fees),
        generateSummary(receipt),
    )
}
```

### 12.5 Build Configuration

#### Makefile Addition

```makefile
# MCP Server targets
.PHONY: build-mcp
build-mcp: ## Build MCP server
	@echo "Building MCP server..."
	go build -ldflags="-X main.Version=$(VERSION)" \
		-o bin/mcp-server cmd/mcp-server/main.go

.PHONY: run-mcp
run-mcp: build-mcp ## Run MCP server locally
	./bin/mcp-server

.PHONY: docker-mcp
docker-mcp: ## Build MCP server Docker image
	docker build -f deployments/docker/Dockerfile.mcp \
		-t $(DOCKER_REGISTRY)/mcp-server:$(VERSION) .

.PHONY: test-mcp
test-mcp: ## Test MCP server
	go test -v -cover ./cmd/mcp-server/...
```

### 12.6 Docker Configuration

```dockerfile
# deployments/docker/Dockerfile.mcp
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o mcp-server ./cmd/mcp-server

# Runtime
FROM alpine:latest

RUN apk add --no-cache ca-certificates
RUN adduser -D -g '' mcpuser

WORKDIR /app
COPY --from=builder /app/mcp-server .
RUN chown mcpuser:mcpuser mcp-server

USER mcpuser
EXPOSE 3000

ENTRYPOINT ["./mcp-server"]
```

### 12.7 Docker Compose Integration

```yaml
# docker-compose.yml addition
  mcp-server:
    build:
      context: .
      dockerfile: deployments/docker/Dockerfile.mcp
    ports:
      - "3000:3000"
    environment:
      - MARKETPLACE_URL=http://marketplace-api:8080
      - LOG_LEVEL=info
      - PORT=3000
    depends_on:
      - marketplace-api
    networks:
      - species-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 12.8 Testing

```go
// test/integration/mcp_test.go
package integration

import (
    "testing"
    "github.com/stretchr/testify/suite"
)

type MCPTestSuite struct {
    suite.Suite
    client *MCPTestClient
}

func (suite *MCPTestSuite) SetupTest() {
    suite.client = NewMCPTestClient("localhost:3000")
}

func (suite *MCPTestSuite) TestCompleteFlow() {
    // Step 1: Configure
    err := suite.client.Configure("test-api-key", "test-secret")
    suite.NoError(err)
    
    // Step 2: Create transaction
    resp, err := suite.client.CreateTransaction(TransactionRequest{
        From:         "usr-test-sender",
        To:           "treasury",
        Amount:       1000,
        PaymentProof: "npmt_test_123",
    })
    suite.NoError(err)
    suite.NotEmpty(resp.EventID)
    
    // Step 3: Get receipt
    receipt, err := suite.client.GetReceipt(resp.EventID)
    suite.NoError(err)
    suite.Contains(receipt.Interpretation, "TRANSACTION RECEIPT")
    suite.Equal("COMPLETED", receipt.Status)
}

func TestMCPSuite(t *testing.T) {
    suite.Run(t, new(MCPTestSuite))
}
```

### 12.9 Environment Variables

```bash
# .env.example - MCP Server section
# MCP Server Configuration
MCP_SERVER_PORT=3000
MCP_SERVER_HOST=0.0.0.0

# Marketplace Integration
MCP_MARKETPLACE_URL=http://marketplace-api:8080
MCP_REQUEST_TIMEOUT=30s

# Security
MCP_RATE_LIMIT_RPS=10
MCP_MAX_REQUEST_SIZE=1048576
MCP_SIGNATURE_WINDOW=60

# Monitoring
MCP_METRICS_ENABLED=true
MCP_METRICS_PORT=9091
MCP_HEALTH_CHECK_PATH=/health

# Logging
MCP_LOG_LEVEL=info
MCP_LOG_FORMAT=json
```

### 12.10 Monitoring

```yaml
# configs/prometheus/mcp-alerts.yml
groups:
  - name: mcp_alerts
    rules:
      - alert: MCPHighErrorRate
        expr: rate(mcp_requests_total{status="error"}[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High MCP error rate"
          
      - alert: MCPAuthFailures
        expr: rate(mcp_auth_failures_total[5m]) > 0.1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "High authentication failure rate"
```

### 12.11 Claude Desktop Configuration

Users configure Claude Desktop to use the MCP server:

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "species": {
      "command": "docker",
      "args": ["run", "-i", "species.io/mcp-server:latest"]
    }
  }
}
```

### 12.12 Usage Flow

1. **User obtains credentials**:
   - Gets API key from SPECIES Marketplace
   - Gets secret from ProfileTray

2. **User configures MCP**:
   ```
   "Configure my SPECIES account with API key 'mk_xxx' and secret 'secret_yyy'"
   ```

3. **User creates transaction**:
   ```
   "Buy 1000 SPECIES from treasury, payment proof is npmt_123"
   ```

4. **MCP makes single authenticated call**:
   - Signs request with HMAC-SHA256
   - Sends to Marketplace API
   - Receives and interprets receipt

5. **User gets human-readable result**:
   ```
   ✅ Transaction COMPLETED
   You purchased 1,000 SPECIES from treasury
   Balance: 0 → 1,000 SPECIES
   Cost: 10 USDT (verified)
   ```

---

## Updated Services Overview

The SPECIES Marketplace now includes 11 core services:

1. **Authenticator** - HMAC signature validation
2. **Marketplace API** - Request ingestion with idempotency
3. **Validator** - Dual-path payment verification
4. **Classifier** - Intent routing
5. **Matching** - Order resolution
6. **Cashier** - Firefly ledger management
7. **Asset Manager** - Onli Cloud operations
8. **Floor Manager** - Oracle verification & reconciliation
9. **Reporter** - Read-only projections
10. **Configuration** - Runtime settings & ProfileTray sync
11. **MCP Server** - AI assistant integration *(NEW)*

The MCP Server is a lightweight signing proxy that enables AI assistants to help users transact on SPECIES without handling credentials directly.

---

**Build Specification Version**: 2.0
**MCP Integration**: Complete
**Date**: November 2024
**Status**: Production Ready
