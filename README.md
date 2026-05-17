# Payment Service: Enterprise-Grade Clean Architecture

<p align="center">
  <img src="https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white" alt="Java 21">
  <img src="https://img.shields.io/badge/Spring_Boot-3.2-6DB33F?style=for-the-badge&logo=spring-boot&logoColor=white" alt="Spring Boot 3.2">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 16">
  <img src="https://img.shields.io/badge/Kubernetes-EKS-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white" alt="Kubernetes">
  <img src="https://img.shields.io/badge/OpenTelemetry-Instrumented-000000?style=for-the-badge&logo=opentelemetry&logoColor=white" alt="OpenTelemetry">
  <img src="https://img.shields.io/badge/Grafana-LGTM-F46800?style=for-the-badge&logo=grafana&logoColor=white" alt="Grafana">
  <img src="https://img.shields.io/badge/Testcontainers-Verified-000000?style=for-the-badge&logo=docker&logoColor=white" alt="Testcontainers">
  <img src="https://img.shields.io/badge/Locking-Pessimistic-red?style=for-the-badge" alt="Pessimistic Locking">
  <img src="https://img.shields.io/badge/Tests-147_Zero_Skips-green?style=for-the-badge" alt="147 Tests">
  <img src="https://img.shields.io/badge/Code_Coverage-100%25-green?style=for-the-badge" alt="100% Coverage">
  <img src="https://codecov.io/gh/your-org/payment-service/branch/main/graph/badge.svg" alt="Codecov">
</p>

The **Payment Service** is a production-ready, highly scalable Java backend designed for mission-critical financial transactions. Built with a strict adherence to **Clean Architecture** and **Test-Driven Development (TDD)**, it ensures maximum maintainability and zero dependency leakage into the core business domain. Every transaction is fully observable via an integrated **LGTM (Loki, Grafana, Tempo, Mimir)** stack powered by **OpenTelemetry**, providing deep insights into distributed traces, metrics, and logs in a cloud-native Kubernetes environment.

---

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Infrastructure (Kubernetes)](#infrastructure-kubernetes)
3. [Data & Request Flow](#data--request-flow)
4. [Tech Stack](#tech-stack)
5. [Getting Started](#getting-started)
6. [Testing Pyramid](#testing-pyramid)
7. [Deployment](#deployment)
8. [Troubleshooting](#troubleshooting)
9. [API References](#api-references)

---

## 🏗 Architecture Overview

### Clean Architecture Boundaries
The service is decoupled into four distinct layers. The **Domain** layer is the core and has zero dependencies on external frameworks. This expansion introduces **Wallets** and **Merchants** to simulate a real-world financial ecosystem.

```mermaid
graph TB
    subgraph "External World"
        User((User/Client))
        Merchant_Ext((Merchant Portal))
    end

    subgraph "Payment Service"
        subgraph "Presentation Layer"
            REST[REST Controller]
            SOAP[SOAP Endpoint]
            ExceptionHandler[Global Exception Handler]
        end

        subgraph "Application Layer"
            WalletUC[WalletTransferUseCase]
            TopUpUC[TopUpWalletUseCase]
            SearchUC[SearchPaymentsUseCase]
            PORT_OUT[RepositoryPorts]
        end

        subgraph "Infrastructure Layer"
            JPA[Spring Data JPA]
            DB_IMPL[Postgres Persistence]
            OTEL_IMPL[OTel Instrumentation]
            FLYWAY[Flyway Migrations]
        end

        subgraph "Domain Layer"
            WalletEntity[Wallet Entity]
            PaymentEntity[Payment Entity]
            MerchantEntity[Merchant Entity]
            Logic[Pessimistic Locking Logic]
        end
    end

    User --> REST
    Merchant_Ext --> REST
    REST --> WalletUC
    REST --> TopUpUC
    WalletUC --> WalletEntity
    WalletUC --> PORT_OUT
    PORT_OUT --> DB_IMPL
```

### ACID & Locking Strategy
To handle extreme write contention during load tests, the service implements a dual-locking strategy:
- **Pessimistic Locking**: `SELECT ... FOR UPDATE` via `@Lock(LockModeType.PESSIMISTIC_WRITE)` for critical wallet balance debits.
- **Optimistic Locking**: `@Version` field for state updates in `payments` to detect and reject stale concurrent requests.

---

## ☸️ Infrastructure (Kubernetes)

The application is architected for **Cloud-Native** resilience, simulating an AWS EKS environment with strict resource quotas and an internal OpenTelemetry Collector sidecar/centralized deployment.

```mermaid
graph TD
    subgraph "K8s Cluster (EKS Simulation)"
        subgraph "Default Namespace"
            SVC[Payment Service Pods x2]
            OTEL[OTel Collector Pod]
            PG[(PostgreSQL 16 Pod)]
        end

        subgraph "Monitoring Namespace"
            GRAFANA[Grafana Dashboard]
            TEMPO[Tempo Traces]
            LOKI[Loki Logs]
            PROM[Prometheus Metrics]
        end
    end

    SVC -->|OTLP/gRPC| OTEL
    SVC -->|JDBC + Hikari| PG
    OTEL -->|Export Traces| TEMPO
    OTEL -->|Export Logs| LOKI
    OTEL -->|Export Metrics| PROM
```

### Service Details
| Port | Protocol | Purpose |
| :--- | :--- | :--- |
| 8080 | HTTP | Application REST/SOAP API |
| 4317 | gRPC | OTel Collector Ingestion (OTLP) |
| 5432 | TCP | PostgreSQL Database |
| 3000 | HTTP | Grafana UI (LGTM Stack) |

---

## 🔄 Data & Request Flow (Wallet Transfer)

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Controller as Presentation
    participant UseCase as Application (Transactional)
    participant Wallet as Domain (Wallet)
    participant Repo as Infrastructure (Postgres)
    participant OTel as OpenTelemetry

    Client->>Controller: POST /v1/payments/wallet-transfer
    Controller->>UseCase: execute(walletId, amount)
    UseCase->>Repo: findByIdWithLock(walletId)
    Note over Repo: SELECT ... FOR UPDATE
    Repo-->>UseCase: Locked Wallet Entity
    UseCase->>Wallet: debit(amount)
    alt Insufficient Funds
        Wallet-->>UseCase: IllegalArgumentException
        UseCase->>OTel: Attribute: rejection=insufficient_funds
        UseCase-->>Controller: Exception
        Controller-->>Client: 400 Bad Request
    else Success
        UseCase->>Repo: save(wallet)
        UseCase->>Repo: insert(payment)
        UseCase-->>Controller: Success
        Controller-->>Client: 200 OK
    end
```

---

## 🛠 Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Language** | Java 21 (LTS) | Core platform with Virtual Threads ready. |
| **Framework** | Spring Boot 3.2 | Application dependency injection and web layer. |
| **Persistence** | Spring Data JPA | ACID compliant data access. |
| **Database** | PostgreSQL 16 | Relational persistence with Row-Level Locking. |
| **Observability** | OpenTelemetry | Full OTLP stack (Traces, Metrics, Logs). |
| **Migrations** | Flyway | Automated versioned schema management. |
| **Integration** | Testcontainers | Multi-threaded concurrency verification. |

---

## 🚀 Getting Started

### Prerequisites
- JDK 21+
- Docker & Kubernetes
- Maven 3.9+

### Build & Deployment
```bash
# 1. Build & Test (147 tests, 0 skips)
mvn clean test -Dspring.profiles.active=test

# 2. Deploy Infrastructure
kubectl apply -f k8s/otel-collector.yaml

# 3. Deploy the Payment Service
kubectl apply -f k8s/payment-service.yaml
```

---

## 📐 Testing Pyramid

```mermaid
block-beta
    columns 1
    block:L4:1
        Contract_Tests["L4: Spring Cloud Contract (17 tests)"]
    end
    block:L3:1
        E2E_Tests["L3: K6 Load Tests (Write Contention)"]
    end
    block:L2:1
        Integration_Tests["L2: H2 Integration (25 tests)"]
    end
    block:L1:1
        Unit_Tests["L1: Use Case Tests (27 tests)"]
    end
    block:L0:1
        Domain_Logic["L0: Domain Tests (78 tests)"]
    end
```

**Total: 147 tests - Zero skips**

---

## 🔍 Troubleshooting

| Issue | Potential Cause | Resolution |
| :--- | :--- | :--- |
| `409 Conflict` | Optimistic Lock Failure | Normal under high load. Client should retry. |
| `DeadlockDetected` | Pessimistic Lock Contention | Check query order or increase DB connection pool. |
| `500 Server Error` | Database Unreachable | Verify `PostgresService` in Kubernetes. |

---

## 🔗 API References

### REST Endpoints

#### Payments
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/v1/payments` | Create a new payment. |
| `POST` | `/v1/payments/wallet-transfer` | ACID transfer with Pessimistic Locking. |
| `POST` | `/v1/payments/wallets/{id}/topup` | High-frequency wallet balance top-up. |
| `POST` | `/v1/payments/batch` | JDBC batch insert (up to 500 items). |
| `PUT` | `/v1/payments/{id}/refund` | Refund an existing payment. |
| `GET` | `/v1/payments/{id}` | Get a payment by ID. |
| `GET` | `/v1/payments/user/{userId}` | List payments for a user (filterable by status). |
| `GET` | `/v1/payments/reports/summary` | Get payment summary report by date range. |
| `GET` | `/v1/payments/search` | Dynamic search with amount, currency, status filters. |

#### Wallets
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/v1/wallets` | Create a new wallet for a user. |
| `GET` | `/v1/wallets/{id}` | Get a wallet by ID. |
| `GET` | `/v1/wallets` | List all wallets. |
| `GET` | `/v1/wallets/user/{userId}` | Get a wallet by user ID. |

#### Merchants
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/v1/merchants` | Register a new merchant. |
| `GET` | `/v1/merchants/{id}` | Get a merchant by ID. |
| `GET` | `/v1/merchants` | List all merchants. |
| `DELETE` | `/v1/merchants/{id}` | Delete a merchant. |

#### Users
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/v1/users` | Register a new user. |
| `GET` | `/v1/users/{id}` | Get a user by ID. |
| `GET` | `/v1/users` | List all users. |
| `DELETE` | `/v1/users/{id}` | Delete a user. |

### SOAP Endpoints

All SOAP operations are served at `POST /ws` with XML/SOAP envelopes. WSDL available at `GET /ws/payments.wsdl`.

| Operation | Request Element | Purpose |
| :--- | :--- | :--- |
| `GetPaymentById` | `GetPaymentByIdRequest` | Get a payment by ID. |
| `ProcessPayment` | `ProcessPaymentRequest` | Create a new payment. |
| `RefundPayment` | `RefundPaymentRequest` | Refund an existing payment. |
| `ListUserPayments` | `ListUserPaymentsRequest` | List payments for a user by status. |
| `SearchPayments` | `SearchPaymentsRequest` | Search payments by amount, currency, status. |
| `GetPaymentSummary` | `GetPaymentSummaryRequest` | Get payment summary totals by status. |

---
**Developed by the Enterprise Architecture Team.** 🛡️🚀👾
