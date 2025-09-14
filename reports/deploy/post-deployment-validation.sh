#!/bin/bash
# DriveMind v1.2.1 Post-Deployment Validation Script
# Comprehensive security and functionality validation

set -euo pipefail

# Configuration
DEPLOYMENT_URL="https://studio--drivemind-q69b7.us-central1.hosted.app"
TIMEOUT=10
LOG_FILE="deployment-validation.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Test function with colored output
test_endpoint() {
    local endpoint="$1"
    local expected_status="$2"
    local description="$3"
    
    log "${BLUE}Testing: $description${NC}"
    
    local response
    local status_code
    
    if response=$(curl -s -w "HTTPSTATUS:%{http_code}" --connect-timeout "$TIMEOUT" "$endpoint"); then
        status_code=$(echo "$response" | grep -o "HTTPSTATUS:.*" | cut -d: -f2)
        
        if [[ "$status_code" == "$expected_status" ]]; then
            log "${GREEN}✅ PASSED: $description (Status: $status_code)${NC}"
            return 0
        else
            log "${RED}❌ FAILED: $description (Expected: $expected_status, Got: $status_code)${NC}"
            return 1
        fi
    else
        log "${RED}❌ FAILED: $description (Connection timeout or error)${NC}"
        return 1
    fi
}

# Security header validation
test_security_headers() {
    local url="$1"
    local description="$2"
    
    log "${BLUE}Testing: $description${NC}"
    
    local headers
    if headers=$(curl -sI --connect-timeout "$TIMEOUT" "$url"); then
        local passed=0
        local total=0
        
        # Test HSTS
        ((total++))
        if echo "$headers" | grep -qi "strict-transport-security"; then
            log "${GREEN}✅ HSTS header present${NC}"
            ((passed++))
        else
            log "${RED}❌ HSTS header missing${NC}"
        fi
        
        # Test X-Frame-Options
        ((total++))
        if echo "$headers" | grep -qi "x-frame-options"; then
            log "${GREEN}✅ X-Frame-Options header present${NC}"
            ((passed++))
        else
            log "${RED}❌ X-Frame-Options header missing${NC}"
        fi
        
        # Test Content-Security-Policy
        ((total++))
        if echo "$headers" | grep -qi "content-security-policy"; then
            log "${GREEN}✅ Content-Security-Policy header present${NC}"
            ((passed++))
        else
            log "${RED}❌ Content-Security-Policy header missing${NC}"
        fi
        
        # Test X-Content-Type-Options
        ((total++))
        if echo "$headers" | grep -qi "x-content-type-options"; then
            log "${GREEN}✅ X-Content-Type-Options header present${NC}"
            ((passed++))
        else
            log "${RED}❌ X-Content-Type-Options header missing${NC}"
        fi
        
        log "${BLUE}Security Headers Score: $passed/$total${NC}"
        
        if [[ $passed -eq $total ]]; then
            return 0
        else
            return 1
        fi
    else
        log "${RED}❌ FAILED: Could not retrieve headers for $description${NC}"
        return 1
    fi
}

# Performance test
test_performance() {
    local url="$1"
    local description="$2"
    
    log "${BLUE}Testing: $description${NC}"
    
    local response_time
    if response_time=$(curl -s -w "%{time_total}" -o /dev/null --connect-timeout "$TIMEOUT" "$url"); then
        local ms_time=$(echo "$response_time * 1000" | bc -l | cut -d. -f1)
        
        if [[ $ms_time -lt 2000 ]]; then
            log "${GREEN}✅ PASSED: $description (${ms_time}ms < 2000ms threshold)${NC}"
            return 0
        else
            log "${YELLOW}⚠️  SLOW: $description (${ms_time}ms >= 2000ms threshold)${NC}"
            return 1
        fi
    else
        log "${RED}❌ FAILED: $description (Connection timeout or error)${NC}"
        return 1
    fi
}

# JSON validation
test_json_endpoint() {
    local endpoint="$1"
    local description="$2"
    
    log "${BLUE}Testing: $description${NC}"
    
    local response
    if response=$(curl -s --connect-timeout "$TIMEOUT" "$endpoint"); then
        if echo "$response" | jq . >/dev/null 2>&1; then
            log "${GREEN}✅ PASSED: $description (Valid JSON response)${NC}"
            
            # Log key information from response
            if echo "$response" | jq -e '.status' >/dev/null 2>&1; then
                local status
                status=$(echo "$response" | jq -r '.status')
                log "${BLUE}   Status: $status${NC}"
            fi
            
            return 0
        else
            log "${RED}❌ FAILED: $description (Invalid JSON response)${NC}"
            log "${RED}   Response: ${response:0:200}...${NC}"
            return 1
        fi
    else
        log "${RED}❌ FAILED: $description (Connection timeout or error)${NC}"
        return 1
    fi
}

# Main validation function
main() {
    log "${BLUE}========================================${NC}"
    log "${BLUE}DriveMind v1.2.1 Post-Deployment Validation${NC}"
    log "${BLUE}Target: $DEPLOYMENT_URL${NC}"
    log "${BLUE}========================================${NC}"
    
    local total_tests=0
    local passed_tests=0
    
    # Test 1: Basic connectivity
    ((total_tests++))
    if test_endpoint "$DEPLOYMENT_URL" "200" "Basic connectivity to homepage"; then
        ((passed_tests++))
    fi
    
    # Test 2: Health endpoint
    ((total_tests++))
    if test_json_endpoint "$DEPLOYMENT_URL/api/health" "Health endpoint"; then
        ((passed_tests++))
    fi
    
    # Test 3: Security headers on homepage
    ((total_tests++))
    if test_security_headers "$DEPLOYMENT_URL" "Homepage security headers"; then
        ((passed_tests++))
    fi
    
    # Test 4: OAuth begin endpoint (should be available)
    ((total_tests++))
    if test_endpoint "$DEPLOYMENT_URL/api/auth/drive/status" "405" "OAuth status endpoint (GET not allowed)"; then
        ((passed_tests++))
    fi
    
    # Test 5: About page (version info)
    ((total_tests++))
    if test_endpoint "$DEPLOYMENT_URL/about" "200" "About page (version info)"; then
        ((passed_tests++))
    fi
    
    # Test 6: Performance test
    ((total_tests++))
    if test_performance "$DEPLOYMENT_URL" "Homepage response time"; then
        ((passed_tests++))
    fi
    
    # Test 7: API endpoints security headers
    ((total_tests++))
    if test_security_headers "$DEPLOYMENT_URL/api/health" "API endpoint security headers"; then
        ((passed_tests++))
    fi
    
    # Test 8: Static assets
    ((total_tests++))
    if test_endpoint "$DEPLOYMENT_URL/favicon.ico" "200" "Static assets accessibility"; then
        ((passed_tests++))
    fi
    
    # Test 9: Dashboard page
    ((total_tests++))
    if test_endpoint "$DEPLOYMENT_URL/dashboard" "200" "Dashboard page"; then
        ((passed_tests++))
    fi
    
    # Test 10: AI page
    ((total_tests++))
    if test_endpoint "$DEPLOYMENT_URL/ai" "200" "AI interface page"; then
        ((passed_tests++))
    fi
    
    # Final results
    log "${BLUE}========================================${NC}"
    log "${BLUE}DEPLOYMENT VALIDATION RESULTS${NC}"
    log "${BLUE}========================================${NC}"
    
    local success_rate=$((passed_tests * 100 / total_tests))
    
    if [[ $passed_tests -eq $total_tests ]]; then
        log "${GREEN}🎉 ALL TESTS PASSED: $passed_tests/$total_tests (100%)${NC}"
        log "${GREEN}✅ DEPLOYMENT SUCCESSFUL${NC}"
        exit 0
    elif [[ $success_rate -ge 80 ]]; then
        log "${YELLOW}⚠️  MOSTLY SUCCESSFUL: $passed_tests/$total_tests ($success_rate%)${NC}"
        log "${YELLOW}⚠️  DEPLOYMENT FUNCTIONAL WITH MINOR ISSUES${NC}"
        exit 1
    else
        log "${RED}❌ DEPLOYMENT ISSUES DETECTED: $passed_tests/$total_tests ($success_rate%)${NC}"
        log "${RED}❌ INVESTIGATION REQUIRED${NC}"
        exit 2
    fi
}

# Check dependencies
if ! command -v curl &> /dev/null; then
    log "${RED}❌ curl is required but not installed${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    log "${RED}❌ jq is required but not installed${NC}"
    exit 1
fi

if ! command -v bc &> /dev/null; then
    log "${RED}❌ bc is required but not installed${NC}"
    exit 1
fi

# Run validation
main "$@"