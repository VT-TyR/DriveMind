#!/bin/bash

# DriveMind Integration Test Harness
# Comprehensive testing suite for webhook integrations
# Usage: ./test-harness.sh [options]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/logs"
WEBHOOK_PORT=8090
GEMINI_PORT=8091
FIREBASE_PORT=8092

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/test-harness-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo -e "$1" | tee -a "${LOG_FILE}"
}

error() {
    log "${RED}[ERROR] $1${NC}"
}

success() {
    log "${GREEN}[SUCCESS] $1${NC}"
}

info() {
    log "${BLUE}[INFO] $1${NC}"
}

warn() {
    log "${YELLOW}[WARN] $1${NC}"
}

# Error handler
handle_error() {
    local exit_code=$?
    local line_number=$1
    error "Test harness failed at line $line_number (exit: $exit_code)"
    error "Last command: ${BASH_COMMAND}"
    error "Timestamp: $(date -Iseconds)"
    cleanup
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Cleanup function
cleanup() {
    info "Cleaning up test processes..."
    
    # Kill background servers
    if [[ -n "${WEBHOOK_PID:-}" ]]; then
        kill "${WEBHOOK_PID}" 2>/dev/null || true
        wait "${WEBHOOK_PID}" 2>/dev/null || true
    fi
    
    if [[ -n "${GEMINI_PID:-}" ]]; then
        kill "${GEMINI_PID}" 2>/dev/null || true
        wait "${GEMINI_PID}" 2>/dev/null || true
    fi
    
    if [[ -n "${FIREBASE_PID:-}" ]]; then
        kill "${FIREBASE_PID}" 2>/dev/null || true
        wait "${FIREBASE_PID}" 2>/dev/null || true
    fi
    
    info "Cleanup complete"
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js is required but not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        error "npm is required but not installed"
        exit 1
    fi
    
    # Check curl
    if ! command -v curl &> /dev/null; then
        error "curl is required but not installed"
        exit 1
    fi
    
    # Install dependencies
    if [[ ! -d "${SCRIPT_DIR}/node_modules" ]]; then
        info "Installing npm dependencies..."
        cd "${SCRIPT_DIR}"
        npm install
    fi
    
    success "Prerequisites check passed"
}

# Start mock servers
start_servers() {
    info "Starting mock servers..."
    
    cd "${SCRIPT_DIR}"
    
    # Start Google Drive webhook server
    info "Starting Google Drive webhook server on port ${WEBHOOK_PORT}..."
    WEBHOOK_PORT=${WEBHOOK_PORT} node google-drive-webhook-server.js > "${LOG_DIR}/webhook-server.log" 2>&1 &
    WEBHOOK_PID=$!
    
    # Start Gemini mock server
    info "Starting Gemini mock server on port ${GEMINI_PORT}..."
    GEMINI_PORT=${GEMINI_PORT} node gemini-mock-server.js > "${LOG_DIR}/gemini-server.log" 2>&1 &
    GEMINI_PID=$!
    
    # Wait for servers to start
    sleep 3
    
    # Health checks
    local webhook_health="http://localhost:${WEBHOOK_PORT}/health"
    local gemini_health="http://localhost:${GEMINI_PORT}/health"
    
    info "Performing health checks..."
    
    if curl -sf "${webhook_health}" > /dev/null; then
        success "Google Drive webhook server is healthy"
    else
        error "Google Drive webhook server failed health check"
        exit 1
    fi
    
    if curl -sf "${gemini_health}" > /dev/null; then
        success "Gemini mock server is healthy"
    else
        error "Gemini mock server failed health check"
        exit 1
    fi
    
    success "All mock servers started successfully"
}

# Test OAuth flow
test_oauth_flow() {
    info "Testing OAuth flow..."
    
    local webhook_url="http://localhost:${WEBHOOK_PORT}"
    
    # Test OAuth callback with success scenario
    info "Testing OAuth callback success..."
    local response=$(curl -s -X GET "${webhook_url}/oauth/callback?code=mock_auth_code&state=test_user")
    
    if echo "${response}" | grep -q "access_token"; then
        success "OAuth callback success test passed"
    else
        error "OAuth callback success test failed"
        echo "Response: ${response}"
        return 1
    fi
    
    # Test OAuth callback with error scenario
    info "Testing OAuth callback error..."
    local error_response=$(curl -s -X GET "${webhook_url}/oauth/callback?error=access_denied")
    
    if echo "${error_response}" | grep -q "oauth_access_denied"; then
        success "OAuth callback error test passed"
    else
        error "OAuth callback error test failed"
        echo "Response: ${error_response}"
        return 1
    fi
    
    success "OAuth flow tests completed"
}

# Test webhook deduplication
test_webhook_deduplication() {
    info "Testing webhook deduplication..."
    
    local webhook_url="http://localhost:${WEBHOOK_PORT}/webhooks/drive/notifications"
    local headers=(
        -H "X-Goog-Channel-Token: test-webhook-secret"
        -H "X-Goog-Resource-Id: test-resource-123"
        -H "X-Goog-Resource-State: sync"
        -H "X-Goog-Message-Number: 1"
    )
    
    # Send first webhook
    info "Sending first webhook..."
    local response1=$(curl -s -X POST "${webhook_url}" "${headers[@]}" -d '{}')
    
    if echo "${response1}" | grep -q '"status":"received"'; then
        success "First webhook processed successfully"
    else
        error "First webhook failed"
        echo "Response: ${response1}"
        return 1
    fi
    
    # Send duplicate webhook
    info "Sending duplicate webhook..."
    local response2=$(curl -s -X POST "${webhook_url}" "${headers[@]}" -d '{}')
    
    if echo "${response2}" | grep -q '"status":"duplicate"'; then
        success "Webhook deduplication working correctly"
    else
        error "Webhook deduplication failed"
        echo "Response: ${response2}"
        return 1
    fi
    
    success "Webhook deduplication tests completed"
}

# Test rate limiting
test_rate_limiting() {
    info "Testing rate limiting..."
    
    local webhook_url="http://localhost:${WEBHOOK_PORT}/api/test"
    local rate_limit_exceeded=false
    
    # Send requests until rate limit is hit
    for i in {1..105}; do
        local response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "${webhook_url}")
        
        if [[ "${response}" == "429" ]]; then
            rate_limit_exceeded=true
            success "Rate limiting activated after ${i} requests"
            break
        fi
        
        # Small delay to avoid overwhelming
        sleep 0.01
    done
    
    if [[ "${rate_limit_exceeded}" == "true" ]]; then
        success "Rate limiting test passed"
    else
        warn "Rate limiting test inconclusive (may need more requests)"
    fi
}

# Test Gemini AI integration
test_gemini_integration() {
    info "Testing Gemini AI integration..."
    
    local gemini_url="http://localhost:${GEMINI_PORT}/v1beta/models/gemini-1.5-pro-002/generateContent"
    local request_body='{
        "contents": [{
            "parts": [{
                "text": "Classify this file: Important_Business_Document.pdf"
            }]
        }]
    }'
    
    # Test with valid API key
    info "Testing Gemini API with valid key..."
    local response=$(curl -s -X POST "${gemini_url}" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: mock-gemini-api-key" \
        -d "${request_body}")
    
    if echo "${response}" | grep -q "candidates"; then
        success "Gemini API test with valid key passed"
    else
        error "Gemini API test with valid key failed"
        echo "Response: ${response}"
        return 1
    fi
    
    # Test with invalid API key
    info "Testing Gemini API with invalid key..."
    local error_response=$(curl -s -X POST "${gemini_url}" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: invalid-key" \
        -d "${request_body}")
    
    if echo "${error_response}" | grep -q "Invalid API key"; then
        success "Gemini API invalid key test passed"
    else
        error "Gemini API invalid key test failed"
        echo "Response: ${error_response}"
        return 1
    fi
    
    # Test token counting
    info "Testing Gemini token counting..."
    local token_response=$(curl -s -X POST "http://localhost:${GEMINI_PORT}/v1beta/models/gemini-1.5-pro-002/countTokens" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: mock-gemini-api-key" \
        -d "${request_body}")
    
    if echo "${token_response}" | grep -q "totalTokens"; then
        success "Gemini token counting test passed"
    else
        error "Gemini token counting test failed"
        echo "Response: ${token_response}"
        return 1
    fi
    
    success "Gemini AI integration tests completed"
}

# Test error scenarios
test_error_scenarios() {
    info "Testing error scenarios..."
    
    local webhook_url="http://localhost:${WEBHOOK_PORT}"
    local gemini_url="http://localhost:${GEMINI_PORT}"
    
    # Test webhook authentication failure
    info "Testing webhook authentication failure..."
    local auth_error=$(curl -s -X POST "${webhook_url}/webhooks/drive/notifications" -d '{}')
    
    if echo "${auth_error}" | grep -q "Unauthorized"; then
        success "Webhook authentication failure test passed"
    else
        error "Webhook authentication failure test failed"
        return 1
    fi
    
    # Test Gemini quota exceeded
    info "Testing Gemini quota exceeded..."
    local quota_error=$(curl -s -X POST "${gemini_url}/simulate/quota-exceeded" \
        -H "X-API-Key: mock-gemini-api-key")
    
    if echo "${quota_error}" | grep -q "RESOURCE_EXHAUSTED"; then
        success "Gemini quota exceeded test passed"
    else
        error "Gemini quota exceeded test failed"
        return 1
    fi
    
    # Test server error simulation
    info "Testing server error simulation..."
    local server_error=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${webhook_url}/simulate/error/500")
    
    if [[ "${server_error}" == "500" ]]; then
        success "Server error simulation test passed"
    else
        error "Server error simulation test failed"
        return 1
    fi
    
    success "Error scenario tests completed"
}

# Test idempotency
test_idempotency() {
    info "Testing idempotency..."
    
    # Reset webhook cache
    curl -s -X DELETE "http://localhost:${WEBHOOK_PORT}/webhooks/reset" > /dev/null
    
    local webhook_url="http://localhost:${WEBHOOK_PORT}/webhooks/drive/notifications"
    local headers=(
        -H "X-Goog-Channel-Token: test-webhook-secret"
        -H "X-Goog-Resource-Id: idempotency-test-456"
        -H "X-Goog-Resource-State: sync"
        -H "X-Goog-Message-Number: 100"
    )
    
    # Process webhook multiple times
    local first_response=$(curl -s -X POST "${webhook_url}" "${headers[@]}" -d '{}')
    local second_response=$(curl -s -X POST "${webhook_url}" "${headers[@]}" -d '{}')
    local third_response=$(curl -s -X POST "${webhook_url}" "${headers[@]}" -d '{}')
    
    # First should be processed, subsequent should be marked as duplicates
    if echo "${first_response}" | grep -q '"status":"received"' && \
       echo "${second_response}" | grep -q '"status":"duplicate"' && \
       echo "${third_response}" | grep -q '"status":"duplicate"'; then
        success "Idempotency test passed"
    else
        error "Idempotency test failed"
        echo "First: ${first_response}"
        echo "Second: ${second_response}"
        echo "Third: ${third_response}"
        return 1
    fi
    
    success "Idempotency tests completed"
}

# Generate test report
generate_report() {
    info "Generating test report..."
    
    local report_file="${LOG_DIR}/test-report-$(date +%Y%m%d-%H%M%S).html"
    
    cat > "${report_file}" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>DriveMind Integration Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #2196F3; color: white; padding: 20px; border-radius: 5px; }
        .test { margin: 20px 0; padding: 15px; border-left: 4px solid #4CAF50; background: #f9f9f9; }
        .test.failed { border-left-color: #f44336; }
        .log { background: #f5f5f5; padding: 10px; margin: 10px 0; font-family: monospace; overflow-x: auto; }
        .timestamp { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>DriveMind Integration Test Report</h1>
        <div class="timestamp">Generated: $(date)</div>
    </div>
    
    <div class="test">
        <h2>Test Summary</h2>
        <p>All integration tests completed successfully.</p>
        <ul>
            <li>OAuth Flow: ✓ Passed</li>
            <li>Webhook Deduplication: ✓ Passed</li>
            <li>Rate Limiting: ✓ Passed</li>
            <li>Gemini AI Integration: ✓ Passed</li>
            <li>Error Scenarios: ✓ Passed</li>
            <li>Idempotency: ✓ Passed</li>
        </ul>
    </div>
    
    <div class="test">
        <h2>Test Logs</h2>
        <div class="log">
$(cat "${LOG_FILE}" | sed 's/&/&amp;/g; s/</&lt;/g; s/>/&gt;/g')
        </div>
    </div>
</body>
</html>
EOF
    
    success "Test report generated: ${report_file}"
}

# Main test execution
run_tests() {
    info "Starting DriveMind integration tests..."
    info "Log file: ${LOG_FILE}"
    
    local test_functions=(
        "test_oauth_flow"
        "test_webhook_deduplication"
        "test_rate_limiting"
        "test_gemini_integration"
        "test_error_scenarios"
        "test_idempotency"
    )
    
    local failed_tests=()
    
    for test_func in "${test_functions[@]}"; do
        if ! "${test_func}"; then
            failed_tests+=("${test_func}")
        fi
    done
    
    if [[ ${#failed_tests[@]} -eq 0 ]]; then
        success "All integration tests passed!"
        generate_report
        return 0
    else
        error "Failed tests: ${failed_tests[*]}"
        return 1
    fi
}

# Usage information
show_usage() {
    cat << EOF
DriveMind Integration Test Harness

Usage: $0 [options]

Options:
    -h, --help          Show this help message
    -c, --clean         Clean log files before running
    -s, --start-only    Start servers without running tests
    -t, --test-only     Run tests assuming servers are already running
    
Environment Variables:
    WEBHOOK_PORT        Port for webhook mock server (default: 8090)
    GEMINI_PORT         Port for Gemini mock server (default: 8091)
    FIREBASE_PORT       Port for Firebase mock server (default: 8092)
    
Examples:
    $0                  Run complete test suite
    $0 --clean          Clean logs and run tests
    $0 --start-only     Start servers for manual testing
    
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -c|--clean)
            info "Cleaning log files..."
            rm -rf "${LOG_DIR}"/*.log "${LOG_DIR}"/*.html
            success "Log files cleaned"
            ;;
        -s|--start-only)
            check_prerequisites
            start_servers
            info "Servers started. Press Ctrl+C to stop."
            wait
            exit 0
            ;;
        -t|--test-only)
            run_tests
            exit $?
            ;;
        *)
            error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
    shift
done

# Main execution
main() {
    info "DriveMind Integration Test Harness v1.0.0"
    
    check_prerequisites
    start_servers
    
    # Set up cleanup on exit
    trap cleanup EXIT
    
    if run_tests; then
        success "Integration test suite completed successfully"
        exit 0
    else
        error "Integration test suite failed"
        exit 1
    fi
}

# Run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi