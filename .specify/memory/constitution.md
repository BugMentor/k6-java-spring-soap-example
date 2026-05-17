# Project Constitution

## 1. Mission

Enterprise Payment Service — a production-grade, ACID-compliant payment platform that processes financial transactions with full observability.

## 2. Non-Negotiable Principles

### Data Integrity First
- All wallet balance mutations use pessimistic locking (`SELECT ... FOR UPDATE`)
- All payment state transitions use optimistic locking (`@Version`)
- Every transaction is atomic, consistent, isolated, and durable (ACID)

### Clean Architecture
- Domain layer has ZERO framework annotations (except JPA `@Entity` for Spring Data conventions)
- Dependencies point inward: Presentation → Application → Domain ← Infrastructure
- Port interfaces live in the application layer; adapters live in infrastructure

### Test-Driven Development
- L0: Domain unit tests (pure Java, no mocks needed)
- L1: Application use case tests (mocked ports)
- L2: Integration tests (H2 in-memory database)
- L3: Contract tests (Spring Cloud Contract + REST Assured)
- 100% line and branch coverage enforced on domain and application layers (JaCoCo)

### Full Observability
- OpenTelemetry traces and metrics on every use case (`@WithSpan`)
- Structured logging with `trace_id` and `span_id` in every log line
- OTLP gRPC export to Grafana LGTM stack
- Prometheus metrics endpoint exposed via Actuator

### Spec-Driven Development
- Every feature begins with a specification in `.specify/specs/`
- Specs are committed alongside code
- No code without a corresponding spec

## 3. Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | Java 17 |
| Framework | Spring Boot 3.2.5 |
| Build | Maven |
| Database | PostgreSQL 16 (production), H2 (tests) |
| Messaging | RabbitMQ (planned) |
| Observability | OpenTelemetry, OTLP gRPC, Prometheus, Grafana, Loki, Tempo |
| Testing | JUnit 5, Mockito, Testcontainers, REST Assured, Spring Cloud Contract |
| Container | Docker, Kubernetes manifests in `k8s/` |

## 4. Git Workflow

- `main` — production, protected
- `develop` — integration, protected
- `###-feature-name` — feature branches
- Squash-merge PRs only
- Never force-push to `main` or `develop`
- Tag releases: `v<major>.<minor>.<patch>`
