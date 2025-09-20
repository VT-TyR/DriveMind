#!/usr/bin/env node

/**
 * Load Testing Script for DriveMind
 * ALPHA-CODENAME v1.8 Compliant
 * 
 * Tests:
 * - Concurrent user simulations
 * - API endpoint stress testing
 * - Performance metrics collection
 * - P95/P99 latency measurement
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  baseUrl: process.env.TEST_URL || 'https://staging--drivemind-q69b7.us-central1.hosted.app',
  concurrent: parseInt(process.env.CONCURRENT_USERS) || 10,
  duration: parseInt(process.env.TEST_DURATION) || 60, // seconds
  rampUp: parseInt(process.env.RAMP_UP) || 10, // seconds
  endpoints: [
    { path: '/api/health', method: 'GET', weight: 3 },
    { path: '/api/metrics', method: 'GET', weight: 2 },
    { path: '/api/auth/status', method: 'GET', weight: 5 },
  ]
};

// Metrics storage
const metrics = {
  requests: [],
  errors: [],
  startTime: null,
  endTime: null
};

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Logging utility
function log(level, message) {
  const timestamp = new Date().toISOString();
  const color = {
    'INFO': colors.blue,
    'SUCCESS': colors.green,
    'WARNING': colors.yellow,
    'ERROR': colors.red
  }[level] || colors.reset;
  
  console.log(`${color}[${timestamp}] [${level}] ${message}${colors.reset}`);
}

// Make HTTP request
function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const url = new URL(CONFIG.baseUrl + endpoint.path);
    
    const options = {
      method: endpoint.method,
      headers: {
        'User-Agent': 'DriveMind-LoadTest/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000
    };
    
    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        metrics.requests.push({
          endpoint: endpoint.path,
          method: endpoint.method,
          status: res.statusCode,
          duration: duration,
          timestamp: startTime,
          success: res.statusCode >= 200 && res.statusCode < 400
        });
        
        resolve({
          status: res.statusCode,
          duration: duration
        });
      });
    });
    
    req.on('error', (error) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      metrics.errors.push({
        endpoint: endpoint.path,
        error: error.message,
        timestamp: startTime,
        duration: duration
      });
      
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// Select endpoint based on weights
function selectEndpoint() {
  const totalWeight = CONFIG.endpoints.reduce((sum, ep) => sum + ep.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const endpoint of CONFIG.endpoints) {
    random -= endpoint.weight;
    if (random <= 0) {
      return endpoint;
    }
  }
  
  return CONFIG.endpoints[0];
}

// Virtual user simulation
async function virtualUser(userId) {
  log('INFO', `Virtual user ${userId} started`);
  
  const userStartTime = Date.now();
  let requestCount = 0;
  
  while (Date.now() - metrics.startTime < CONFIG.duration * 1000) {
    const endpoint = selectEndpoint();
    
    try {
      const result = await makeRequest(endpoint);
      requestCount++;
      
      if (requestCount % 10 === 0) {
        log('INFO', `User ${userId}: ${requestCount} requests completed`);
      }
    } catch (error) {
      log('WARNING', `User ${userId} request failed: ${error.message}`);
    }
    
    // Random think time between requests (100-500ms)
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
  }
  
  log('SUCCESS', `Virtual user ${userId} completed: ${requestCount} requests`);
  return requestCount;
}

// Calculate percentiles
function calculatePercentile(arr, percentile) {
  if (arr.length === 0) return 0;
  
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

// Generate report
function generateReport() {
  const duration = (metrics.endTime - metrics.startTime) / 1000;
  const successfulRequests = metrics.requests.filter(r => r.success);
  const failedRequests = metrics.requests.filter(r => !r.success);
  const durations = successfulRequests.map(r => r.duration);
  
  const report = {
    summary: {
      duration: duration,
      totalRequests: metrics.requests.length,
      successfulRequests: successfulRequests.length,
      failedRequests: failedRequests.length + metrics.errors.length,
      requestsPerSecond: metrics.requests.length / duration,
      errorRate: ((failedRequests.length + metrics.errors.length) / metrics.requests.length * 100).toFixed(2) + '%'
    },
    latency: {
      min: Math.min(...durations),
      max: Math.max(...durations),
      mean: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: calculatePercentile(durations, 50),
      p95: calculatePercentile(durations, 95),
      p99: calculatePercentile(durations, 99)
    },
    endpoints: {}
  };
  
  // Per-endpoint statistics
  CONFIG.endpoints.forEach(endpoint => {
    const endpointRequests = metrics.requests.filter(r => r.endpoint === endpoint.path);
    const endpointDurations = endpointRequests.filter(r => r.success).map(r => r.duration);
    
    report.endpoints[endpoint.path] = {
      total: endpointRequests.length,
      successful: endpointRequests.filter(r => r.success).length,
      failed: endpointRequests.filter(r => !r.success).length,
      meanLatency: endpointDurations.length > 0 
        ? endpointDurations.reduce((a, b) => a + b, 0) / endpointDurations.length 
        : 0,
      p95: calculatePercentile(endpointDurations, 95),
      p99: calculatePercentile(endpointDurations, 99)
    };
  });
  
  // Compliance check
  report.compliance = {
    'P95 < 250ms': report.latency.p95 < 250,
    'P99 < 1000ms': report.latency.p99 < 1000,
    'Error rate < 1%': parseFloat(report.summary.errorRate) < 1,
    'ALPHA_COMPLIANT': report.latency.p95 < 250 && report.latency.p99 < 1000 && parseFloat(report.summary.errorRate) < 1
  };
  
  return report;
}

// Main execution
async function main() {
  console.log('================================================');
  console.log('DriveMind Load Testing');
  console.log('================================================');
  console.log(`Target: ${CONFIG.baseUrl}`);
  console.log(`Virtual Users: ${CONFIG.concurrent}`);
  console.log(`Duration: ${CONFIG.duration} seconds`);
  console.log(`Ramp-up: ${CONFIG.rampUp} seconds`);
  console.log('================================================\n');
  
  metrics.startTime = Date.now();
  
  // Start virtual users with ramp-up
  const users = [];
  for (let i = 0; i < CONFIG.concurrent; i++) {
    users.push(virtualUser(i + 1));
    
    // Ramp-up delay
    if (i < CONFIG.concurrent - 1) {
      await new Promise(resolve => 
        setTimeout(resolve, (CONFIG.rampUp * 1000) / CONFIG.concurrent)
      );
    }
  }
  
  // Wait for all users to complete
  log('INFO', 'Waiting for all virtual users to complete...');
  const results = await Promise.all(users);
  metrics.endTime = Date.now();
  
  // Generate and display report
  const report = generateReport();
  
  console.log('\n================================================');
  console.log('LOAD TEST RESULTS');
  console.log('================================================');
  console.log('\nSummary:');
  console.log(`  Duration: ${report.summary.duration.toFixed(2)}s`);
  console.log(`  Total Requests: ${report.summary.totalRequests}`);
  console.log(`  Successful: ${report.summary.successfulRequests}`);
  console.log(`  Failed: ${report.summary.failedRequests}`);
  console.log(`  Requests/sec: ${report.summary.requestsPerSecond.toFixed(2)}`);
  console.log(`  Error Rate: ${report.summary.errorRate}`);
  
  console.log('\nLatency (ms):');
  console.log(`  Min: ${report.latency.min}`);
  console.log(`  Mean: ${report.latency.mean.toFixed(2)}`);
  console.log(`  Max: ${report.latency.max}`);
  console.log(`  P50: ${report.latency.p50}`);
  console.log(`  P95: ${report.latency.p95}`);
  console.log(`  P99: ${report.latency.p99}`);
  
  console.log('\nEndpoint Performance:');
  Object.entries(report.endpoints).forEach(([endpoint, stats]) => {
    console.log(`  ${endpoint}:`);
    console.log(`    Requests: ${stats.total} (${stats.successful} successful)`);
    console.log(`    Mean Latency: ${stats.meanLatency.toFixed(2)}ms`);
    console.log(`    P95: ${stats.p95}ms, P99: ${stats.p99}ms`);
  });
  
  console.log('\nCompliance Status:');
  Object.entries(report.compliance).forEach(([check, passed]) => {
    const status = passed ? `${colors.green}✓ PASS${colors.reset}` : `${colors.red}✗ FAIL${colors.reset}`;
    console.log(`  ${check}: ${status}`);
  });
  
  // Save report to file
  const reportPath = path.join(
    __dirname, 
    '..',
    'deployment-logs',
    `load-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\nDetailed report saved to: ${reportPath}`);
  console.log('================================================\n');
  
  // Exit with appropriate code
  process.exit(report.compliance.ALPHA_COMPLIANT ? 0 : 1);
}

// Error handling
process.on('unhandledRejection', (error) => {
  log('ERROR', `Unhandled rejection: ${error.message}`);
  process.exit(1);
});

// Execute
main().catch(error => {
  log('ERROR', `Load test failed: ${error.message}`);
  process.exit(1);
});