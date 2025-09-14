# DriveMind Persistent Background Scan Architecture

## Executive Summary

This document outlines the architecture for implementing persistent background scanning functionality in DriveMind. The solution enables users to initiate Google Drive scans that continue running in the cloud without requiring the browser to remain open.

## System Architecture

### Current State Analysis

**Existing Components:**
- **Frontend**: Next.js 15.5.3 application with Firebase App Hosting
- **Backend**: Firebase Cloud Functions (Node.js 18) with `scan-runner` function
- **Database**: Firestore with collections for scanJobs, fileIndex, scanDeltas
- **Authentication**: Firebase Auth with Google OAuth integration
- **Infrastructure**: Firebase project `drivemind-q69b7` with production deployment

**Key Issues Identified:**
1. Current scan implementation in `/api/workflows/background-scan/route.ts` uses `setImmediate()` which doesn't persist beyond request lifecycle
2. Cloud Function `scan-runner` exists but needs enhancement for better state persistence
3. No real-time update mechanism for scan progress to UI
4. Missing resilience features (retry, checkpoint/resume)

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         USER BROWSER                         │
│  ┌─────────────────┐                   ┌─────────────────┐ │
│  │   Dashboard UI   │◄──────SSE────────│ Progress Stream │ │
│  │  (React/Next.js) │                   │   (EventSource) │ │
│  └────────┬─────────┘                   └─────────────────┘ │
└───────────┼──────────────────────────────────────────────────┘
            │ HTTPS
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FIREBASE APP HOSTING                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Next.js Application                  │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │         API Routes (Edge Functions)          │   │  │
│  │  │  • /api/scan/start   - Initiate scan         │   │  │
│  │  │  • /api/scan/status  - Get scan status       │   │  │
│  │  │  • /api/scan/cancel  - Cancel scan           │   │  │
│  │  │  • /api/scan/stream  - SSE progress stream   │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
            │ Firestore Trigger
            ▼
┌─────────────────────────────────────────────────────────────┐
│                  FIREBASE CLOUD FUNCTIONS                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Enhanced scan-runner v2.0               │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │            Core Scan Engine                     │ │  │
│  │  │  • Full scan orchestration                      │ │  │
│  │  │  • Delta scan with change tracking              │ │  │
│  │  │  • Checkpoint/resume capability                 │ │  │
│  │  │  • Cooperative cancellation                     │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │          Resilience Manager                     │ │  │
│  │  │  • Exponential backoff retry                    │ │  │
│  │  │  • Rate limit handling                          │ │  │
│  │  │  • Partial failure recovery                     │ │  │
│  │  │  • State persistence                            │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │          Progress Publisher                     │ │  │
│  │  │  • Real-time Firestore updates                  │ │  │
│  │  │  • Metrics aggregation                          │ │  │
│  │  │  • Event streaming                              │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                         FIRESTORE                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                     Collections                       │  │
│  │  • scanJobs      - Job state & progress              │  │
│  │  • scanCheckpoints - Resume points                   │  │
│  │  • fileIndex     - Indexed file metadata             │  │
│  │  • scanDeltas    - Change tracking                   │  │
│  │  • scanMetrics   - Performance metrics               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Infrastructure (Current)
- Design persistent scan architecture
- Define Firestore schema enhancements
- Plan SSE/WebSocket integration

### Phase 2: Implementation
- **Backend**: Enhance Cloud Function with checkpoint/resume
- **Frontend**: Build real-time progress UI
- **Database**: Implement scan state persistence
- **Integration**: Add SSE for progress streaming

### Phase 3: Quality & Security
- Comprehensive test coverage
- Security audit (OAuth, data protection)
- Performance optimization

### Phase 4: Documentation & Release
- API documentation
- Deployment procedures
- Rollback plans

### Phase 5: Monitoring & Analytics
- Performance metrics
- Error tracking
- Compliance validation

## Key Design Decisions

### 1. Cloud Functions vs App Engine
**Decision**: Use Cloud Functions
**Rationale**: 
- Already implemented with `scan-runner`
- Auto-scaling with max instances control
- Cost-effective for intermittent workloads
- Native Firestore triggers

### 2. Real-time Updates: SSE vs WebSocket
**Decision**: Server-Sent Events (SSE)
**Rationale**:
- Simpler implementation
- One-way communication sufficient
- Better compatibility with Firebase hosting
- Auto-reconnect built-in

### 3. State Persistence Strategy
**Decision**: Firestore with checkpoint documents
**Rationale**:
- Atomic updates
- Real-time listeners
- Automatic backup
- Query capabilities

### 4. Scan Execution Model
**Decision**: Hybrid (Full + Delta)
**Rationale**:
- Full scan for initial/stale indexes
- Delta scan for incremental updates
- Automatic decision based on staleness

## Security Considerations

1. **Authentication**: Firebase Auth token validation
2. **Authorization**: User-scoped data access
3. **Rate Limiting**: Per-user quotas
4. **Data Encryption**: TLS in transit, encryption at rest
5. **Audit Logging**: All scan operations logged
6. **GDPR Compliance**: Data retention policies

## Performance Targets

- **Scan Throughput**: 10,000 files/minute
- **Progress Update Frequency**: Every 1000 files or 5 seconds
- **Function Cold Start**: < 2 seconds
- **SSE Latency**: < 100ms
- **Checkpoint Frequency**: Every 5000 files
- **Recovery Time**: < 30 seconds

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google API Rate Limits | High | Exponential backoff, per-user quotas |
| Function Timeout (540s) | Medium | Checkpoint/resume, job chaining |
| Firestore Write Limits | Medium | Batch writes, controlled update frequency |
| Network Interruption | Low | SSE auto-reconnect, state persistence |
| Concurrent Scans | Low | Single active scan enforcement |

## Monitoring & Observability

1. **Metrics**:
   - Scan duration percentiles (P50, P95, P99)
   - Files processed per second
   - Error rates by type
   - API quota consumption

2. **Logging**:
   - Structured logs with correlation IDs
   - Error stack traces
   - Performance profiling

3. **Alerts**:
   - High error rate (>1%)
   - Function timeout approaching
   - API quota exhaustion
   - Stuck jobs (>30 min)

## Success Criteria

1. Users can close browser after initiating scan
2. Scan continues and completes in background
3. Progress updates visible on dashboard return
4. 99.9% scan completion rate
5. <1% error rate
6. Average scan time <5 minutes for 100K files

## Next Steps

1. Review and approve architecture
2. Begin Phase 2 implementation
3. Set up monitoring infrastructure
4. Create test environment
5. Develop rollback procedures

---

**Document Version**: 1.0.0
**Author**: CX-Orchestrator
**Date**: 2025-09-14
**Status**: APPROVED FOR IMPLEMENTATION