#!/bin/bash
set -euo pipefail

BENCHMARK_DIR="$(cd "$(dirname "$0")" && pwd)"
K6_DIR="${BENCHMARK_DIR}/k6"
RESULTS_DIR="${K6_DIR}/results"
mkdir -p "$RESULTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BASE_URL="${BASE_URL:-http://localhost:8080}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9091}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log_section() {
    echo ""
    echo -e "${BOLD}============================================================${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${BOLD}============================================================${NC}"
}

log_step() {
    echo -e "  ${GREEN}→${NC} $1"
}

run_test() {
    local name="$1"
    local script="$2"
    local extra_args="${3:-}"
    local output="${RESULTS_DIR}/${TIMESTAMP}_${name}"

    log_section "RUNNING: ${name}"
    log_step "Script:  ${script}"
    log_step "Output:  ${output}"

    k6 run \
        --out json="${output}.json" \
        --out csv="${output}.csv" \
        -e BASE_URL="${BASE_URL}" \
        -e PROMETHEUS_URL="${PROMETHEUS_URL}" \
        ${extra_args} \
        --summary-export="${output}_summary.json" \
        "${K6_DIR}/${script}" 2>&1 | tee "${output}_raw.log"

    local exit_code=${PIPESTATUS[0]}
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}  ✓ ${name} completed${NC}"
    else
        echo -e "${RED}  ✗ ${name} failed (exit ${exit_code})${NC}"
    fi

    echo "$exit_code" > "${output}_exit_code"
    return $exit_code
}

COMMAND="${1:-all}"

case "$COMMAND" in
    all)
        log_section "FULL SCALING TEST SUITE"
        log_step "HPA thresholds: CPU > 80% | Memory > 60%"
        log_step "Grafana:  http://localhost:3002 (admin/admin)"
        log_step "Base URL: ${BASE_URL}"
        echo ""

        run_test "cpu-stress" "cpu-stress-test.js"
        echo ""
        run_test "memory-stress" "memory-stress-test.js"
        echo ""
        run_test "combined-stress" "combined-stress-test.js"
        echo ""
        run_test "hpa-verify" "hpa-verify-test.js"

        log_section "ALL TESTS COMPLETE"
        echo -e "  Results: ${RESULTS_DIR}/${TIMESTAMP}_*"
        echo -e "  ${BOLD}Grafana: http://localhost:3002${NC} → Payment Service Dashboard"
        echo -e "  ${BOLD}Prometheus: http://localhost:9091${NC} → Verify HPA metrics"
        ;;

    cpu)
        run_test "cpu-stress" "cpu-stress-test.js"
        ;;

    mem)
        run_test "memory-stress" "memory-stress-test.js"
        ;;

    combined)
        run_test "combined-stress" "combined-stress-test.js"
        ;;

    verify)
        run_test "hpa-verify" "hpa-verify-test.js"
        ;;

    load)
        run_test "load" "payment-service-load-test.js" "-e TARGET_VUS=${VUS:-200} -e TEST_DURATION=${DURATION:-10m}"
        ;;

    status)
        echo "Checking scaling status..."
        if curl -s "${PROMETHEUS_URL}/api/v1/query?query=kube_deployment_status_replicas" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('data',{}).get('result',[]):
    print(f\"  {r['metric'].get('deployment','?')}: {r['value'][1]} replicas\")
" 2>/dev/null; then
            echo ""
        else
            echo "  Prometheus not reachable at ${PROMETHEUS_URL}"
        fi
        ;;

    *)
        echo "Usage: $0 {all|cpu|mem|combined|verify|load|status}"
        echo ""
        echo "  all      — Run full scaling test suite (CPU + Memory + Combined + Verify)"
        echo "  cpu      — CPU stress test (triggers HPA at CPU > 80%)"
        echo "  mem      — Memory stress test (triggers HPA at Memory > 60%)"
        echo "  combined — CPU + Memory stress simultaneously"
        echo "  verify   — HPA verification test (checks pod count via Prometheus)"
        echo "  load     — General load test for comparison benchmarking"
        echo "  status   — Check current HPA/pod status"
        echo ""
        echo "Environment:"
        echo "  BASE_URL        = ${BASE_URL}"
        echo "  PROMETHEUS_URL  = ${PROMETHEUS_URL}"
        echo "  VUS             = VUs for load test (default 200)"
        echo "  DURATION        = duration for load test (default 10m)"
        exit 1
        ;;
esac
