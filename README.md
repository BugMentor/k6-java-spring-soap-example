# Payment Service: Enterprise-Grade Clean Architecture

<p align="center">
  <img src="https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white" alt="Java 21">
  <img src="https://img.shields.io/badge/Spring_Boot-3.2-6DB33F?style=for-the-badge&logo=spring-boot&logoColor=white" alt="Spring Boot 3.2">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 16">
  <img src="https://img.shields.io/badge/Kubernetes-EKS-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white" alt="Kubernetes">
  <img src="https://img.shields.io/badge/OpenTelemetry-Instrumented-000000?style=for-the-badge&logo=opentelemetry&logoColor=white" alt="OpenTelemetry">
  <img src="https://img.shields.io/badge/Grafana-LGTM-F46800?style=for-the-badge&logo=grafana&logoColor=white" alt="Grafana LGTM">
  <img src="https://img.shields.io/badge/Tests-152-green?style=for-the-badge" alt="152 Tests">
  <img src="https://img.shields.io/badge/Code_Coverage-100%25-green?style=for-the-badge" alt="100% Coverage">
  <img src="https://img.shields.io/badge/Load_Test-50K_VUs-red?style=for-the-badge" alt="50K VUs">
</p>

**Payment Service** is a production-ready Java backend for financial transactions. Built with Clean Architecture, TDD, 152 tests at 100% domain/application coverage. Fully observable via **LGTM (Loki, Grafana, Tempo, Mimir)** powered by **OpenTelemetry**. Auto-scales on Kubernetes with HPA at CPU 80% and Memory 60%.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                 PRESENTATION LAYER                       │
│  REST Controllers (/v1/)  │  SOAP Endpoint (/ws)        │
├─────────────────────────────────────────────────────────┤
│                 APPLICATION LAYER                        │
│  9 Use Cases (all @WithSpan)  │  PaymentRepositoryPort  │
├─────────────────────────────────────────────────────────┤
│                   DOMAIN LAYER                           │
│  User │ Merchant │ Wallet │ Payment │ PaymentSummary    │
├─────────────────────────────────────────────────────────┤
│               INFRASTRUCTURE LAYER                       │
│  JPA Repositories │ HikariCP │ OTel Collector │ Mimir   │
└─────────────────────────────────────────────────────────┘
```

## LGTM Observability Stack (Zero Prometheus)

```
  Payment Service ──► OTel Collector ──► Mimir  (metrics)
                      │              ├─► Loki   (logs)
                      │              └─► Tempo  (traces)
                      ▼
                   Grafana ── Unified LGTM dashboard
```

All metrics, traces, and logs flow through the **OpenTelemetry Collector** to LGTM backends. Mimir provides long-term metrics storage with PromQL-compatible queries.

## Testing Pyramid (152 tests, 0 failures)

| Level | Pattern | Count | Type |
|-------|---------|-------|------|
| L0 | `L0_Test*.java` | 7 | Domain unit tests (entities, validation, business rules) |
| L1 | `L1_Test*.java` | 9 | Mocked application tests (use cases with mocked ports) |
| L2 | `L2_Test*.java` | 6 | Real DB integration tests (PostgreSQL) |
| L3 | `L3_Test*.java` | 4 | API contract tests (REST Assured + Spring Boot) |

Tests run against **real PostgreSQL** (no H2, no SQLite).

## Kubernetes HPA Auto-Scaling

```yaml
minReplicas: 2
maxReplicas: 20
metrics:
  - cpu:    80% utilization
  - memory: 60% utilization
behavior:
  scaleUp:   100% every 15s
  scaleDown: 300s stabilization
```

Tested on **KinD** (Kubernetes in Docker) with HPA auto-scaling from 2 to 20 pods under 50,000 concurrent users. See `benchmark/k8s/`.

## Load Testing Suite (k6)

| Test | Default VUs | Description |
|------|-------------|-------------|
| `escalation-test.js` | 250 | Wallet transfers, batch, SOAP, search, refunds |
| `cpu-stress-test.js` | 100 | CPU-heavy operations (transfers, batches, reports) |
| `memory-stress-test.js` | 100 | Memory-heavy (large payloads, concurrent holds) |
| `combined-stress-test.js` | 150 | CPU + Memory simultaneous |
| `hpa-verify-test.js` | 100 | Validates HPA pod count changes |
| `payment-service-load-test.js` | 50 | General comparison benchmark |

```bash
# Run all tests for 1 hour
./benchmark/run-benchmark.sh all

# Individual test with custom VUs
k6 run benchmark/k6/escalation-test.js -e BASE_URL=http://localhost:8080 -e TARGET_VUS=5000
```

## Quick Start

```bash
# Start full LGTM stack + PostgreSQL + Payment Service
docker compose -f docker-compose.yaml up -d

# Grafana:    http://localhost:3000 (admin/admin)
# Dashboard:  http://localhost:3000/d/payment-service-lgtm
# Service:    http://localhost:8080
# Postman:    postman/payment-service-collection.json (41 requests)

# Run tests (against real PostgreSQL)
mvn test

# Run load tests
k6 run benchmark/k6/escalation-test.js -e BASE_URL=http://localhost:8080
```

## API Endpoints

### REST (`/v1/`)
- `POST/GET/DELETE /users`, `/merchants`, `/wallets`
- `POST /payments`, `/payments/wallet-transfer`, `/payments/batch`
- `POST /payments/wallets/{id}/topup`
- `PUT /payments/{id}/refund`
- `GET /payments/{id}`, `/payments/user/{userId}`, `/payments/search`, `/payments/reports/summary`

### SOAP (`/ws`)
- `GetPaymentById`, `ProcessPayment`, `RefundPayment`
- `ListUserPayments`, `SearchPayments`, `GetPaymentSummary`
- WSDL: `GET /ws/payments.wsdl`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Java 17, Spring Boot 3.2.5, Maven |
| Database | PostgreSQL 16 (HikariCP pool, max 50 connections) |
| Observability | OpenTelemetry, OTel Collector, Mimir, Loki, Tempo, Grafana |
| Testing | JUnit 5, Mockito, REST Assured, Spring Cloud Contract |
| Load Testing | k6 (up to 50K VUs tested) |
| Container | Docker, KinD (K8s in Docker), EKS manifests |
| Concurrency | Pessimistic locks (wallet), Optimistic locks (payment) |
| CI/CD | GitHub Actions, JaCoCo 100% coverage enforcement |

## Spec-Driven Development

All features follow GitHub Spec Kit methodology. Specs live in `.specify/specs/001-payment-service/`:
- `spec.md` — User stories and requirements
- `data-model.md` — Entity diagrams and domain rules
- `plan.md` — Architecture decisions
- `tasks.md` — TDD-ordered implementation (44 tasks)
- `contracts/api-contracts.md` — Full REST + SOAP API schemas
- `research.md` — Technical decisions and alternatives

## Project Structure

```
├── .specify/          # Spec Kit artifacts
├── src/main/          # Application source
├── src/test/          # L0-L3 tests (real PostgreSQL)
├── benchmark/         # K8s, k6, Grafana, LGTM configs
│   ├── k8s/           # EKS simulation manifests + HPA
│   ├── k6/            # 6 load test scripts
│   ├── grafana/       # Dashboard JSON + datasources
│   └── lgtm/          # Mimir config
├── postman/           # 41-request collection (all scripted)
└── docker-compose.yaml # Full LGTM stack
```
