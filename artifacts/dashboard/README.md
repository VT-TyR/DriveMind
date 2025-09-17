# DriveMind Production Dashboard

## Overview

The DriveMind Production Dashboard is a comprehensive real-time monitoring solution designed for operational teams to monitor the health, performance, and security of the production deployment at `https://studio--drivemind-q69b7.us-central1.hosted.app`.

## Features

### 🔄 Real-Time Monitoring
- Auto-refreshing dashboard every 30 seconds
- Live telemetry from production systems
- WebSocket fallback for instant updates
- Offline detection and graceful degradation

### 📊 Executive Summary
- **System Uptime**: Target 99.9% SLA compliance
- **Response Time**: P95 monitoring with <250ms target
- **Active Users**: Real-time user count and engagement
- **Error Rate**: Target <1% with trend analysis
- **Files Processed**: Business metric tracking
- **Security Score**: Compliance and vulnerability monitoring

### 🏗️ Infrastructure Status
- **Firebase App Hosting**: Health and latency monitoring
- **Google Cloud Functions**: Invocation rates and error tracking
- **Firestore Database**: Read/write operations monitoring
- **OAuth Authentication**: Success rates and token health

### 📈 Performance Monitoring
- Response time trends with P50, P95, P99 percentiles
- Request volume and error rate correlation
- Memory usage and CPU monitoring
- Real-time charts and visualizations

### 🔒 Security & Compliance
- Real-time security event monitoring
- AEI21 compliance status tracking
- Threat detection and risk assessment
- Security scan results and vulnerability tracking

### 👤 User Experience Metrics
- Authentication journey completion rates
- File operation success rates
- Background scan monitoring
- User satisfaction and retention metrics

### 🚨 Alert System
- Configurable alert rules and thresholds
- Multi-channel notifications (email, Slack, webhooks)
- Alert acknowledgment and resolution tracking
- Severity-based escalation

## Files Structure

```
artifacts/dashboard/
├── production-live.html          # Main production dashboard
├── live.html                     # Original debug dashboard
└── README.md                     # This documentation

src/lib/
├── dashboard-metrics.ts          # Metrics collection service
├── analytics-service.ts          # User analytics and events
└── alert-system.ts              # Alert management system

src/app/api/
├── dashboard/live/route.ts       # Dashboard API endpoint
├── health/route.ts               # Health check endpoint
└── metrics/route.ts              # Prometheus metrics endpoint
```

## API Endpoints

### GET `/api/dashboard/live`
Provides comprehensive real-time metrics for the dashboard.

**Query Parameters:**
- `section`: Filter data (`all`, `system`, `business`, `security`, `ux`, `infrastructure`, `alerts`)
- `refresh`: Force cache refresh (`true`, `false`)
- `format`: Response format (`json`, `prometheus`)

**Response Example:**
```json
{
  "requestId": "uuid",
  "timestamp": "2025-01-16T10:30:00Z",
  "system": {
    "uptime": 86400,
    "responseTime": 180,
    "errorRate": 0.12,
    "memoryUsage": { "heapUsed": 64, "heapTotal": 128, "external": 12 }
  },
  "business": {
    "activeUsers": 247,
    "filesProcessed": 12400,
    "authSuccessRate": 98.7
  },
  "security": {
    "securityScore": 96,
    "complianceStatus": "compliant",
    "threatLevel": "low"
  },
  "alerts": [...]
}
```

### GET `/api/health`
Standard health check endpoint following ALPHA-CODENAME requirements.

### GET `/api/metrics`
Prometheus-compatible metrics endpoint for external monitoring systems.

## Configuration

### Environment Variables
```bash
# Production deployment URL
NEXT_PUBLIC_PRODUCTION_URL=https://studio--drivemind-q69b7.us-central1.hosted.app

# Firebase configuration
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret

# Alert system (optional)
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
ALERT_EMAIL_FROM=alerts@yourdomain.com
```

### Dashboard Customization
The dashboard can be customized by modifying `production-live.html`:

1. **Refresh Interval**: Change `refreshInterval` in `DASHBOARD_CONFIG`
2. **Metrics Display**: Modify metric cards and their thresholds
3. **Alert Thresholds**: Configure in `alert-system.ts`
4. **Visual Theme**: Update CSS custom properties in `:root`

## Mobile Responsiveness

The dashboard is fully responsive and optimized for mobile monitoring:

- **Breakpoints**: 768px, 1024px, 1440px
- **Touch-Friendly**: Large touch targets and swipe gestures
- **Adaptive Layout**: Stacked cards on mobile, grid on desktop
- **Performance**: Optimized for cellular connections

## Security & Privacy

### ALPHA-CODENAME Compliance
- ✅ Immutable audit logs
- ✅ Privacy-first data handling
- ✅ AEI21 governance compliance
- ✅ Secure token management
- ✅ RBAC enforcement

### Data Protection
- User IDs are hashed using SHA-256
- IP addresses are anonymized
- No PII stored in metrics
- Secure HTTPS-only communication
- Rate limiting on all endpoints

## Deployment

### Prerequisites
1. Firebase App Hosting deployment
2. Firestore database configured
3. OAuth credentials set up
4. Environment variables configured

### Installation Steps

1. **Deploy Dashboard Files**
   ```bash
   # Copy dashboard to public directory
   cp artifacts/dashboard/production-live.html public/dashboard.html
   ```

2. **Update API Routes**
   ```bash
   # Ensure all dashboard API routes are deployed
   npm run build
   npx firebase deploy --only hosting
   ```

3. **Configure Monitoring**
   ```javascript
   // Initialize metrics collection
   import { dashboardMetricsService } from '@/lib/dashboard-metrics';
   import { alertSystem } from '@/lib/alert-system';
   
   // Start collecting metrics
   await dashboardMetricsService.collectMetrics();
   ```

4. **Set Up Alerts**
   ```bash
   # Configure alert channels in Firestore
   # Default rules are automatically created
   ```

### Access Dashboard
- **Production URL**: `https://studio--drivemind-q69b7.us-central1.hosted.app/dashboard.html`
- **Local Development**: `http://localhost:3000/dashboard.html`

## Monitoring Integration

### Prometheus Integration
The dashboard provides Prometheus-compatible metrics:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'drivemind-dashboard'
    static_configs:
      - targets: ['studio--drivemind-q69b7.us-central1.hosted.app']
    metrics_path: '/api/dashboard/live'
    params:
      format: ['prometheus']
    scrape_interval: 30s
```

### Grafana Dashboard
Import the provided Grafana dashboard configuration:

```json
{
  "dashboard": {
    "title": "DriveMind Production Monitoring",
    "panels": [
      {
        "title": "Response Time",
        "targets": [{"expr": "drivemind_response_time_ms"}]
      }
    ]
  }
}
```

### Alert Manager
Configure AlertManager for external notifications:

```yaml
# alertmanager.yml
route:
  group_by: ['alertname']
  receiver: 'drivemind-alerts'

receivers:
  - name: 'drivemind-alerts'
    webhook_configs:
      - url: 'https://studio--drivemind-q69b7.us-central1.hosted.app/api/alerts/webhook'
```

## Troubleshooting

### Common Issues

1. **Dashboard Not Loading**
   - Check network connectivity
   - Verify production URL is accessible
   - Check browser console for errors

2. **Metrics Not Updating**
   - Verify API endpoints are responding
   - Check Firebase authentication
   - Review server logs for errors

3. **Alerts Not Working**
   - Verify alert rules are enabled
   - Check notification channels configuration
   - Review alert system logs

4. **Performance Issues**
   - Increase refresh interval
   - Enable browser caching
   - Check server resources

### Debug Information

Enable debug logging:
```javascript
// In browser console
localStorage.setItem('debug', 'dashboard:*');
```

Check API health:
```bash
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/health
```

## Performance Optimization

### Client-Side
- Efficient DOM updates to prevent memory leaks
- Progressive loading of chart data
- Service worker for offline functionality
- Image optimization and lazy loading

### Server-Side
- Redis caching for metrics (recommended for production)
- Database query optimization
- Connection pooling
- Rate limiting and throttling

### Network
- CDN for static assets
- Gzip compression
- HTTP/2 support
- DNS prefetching

## Compliance & Auditing

### Audit Trail
All dashboard activities are logged:
- User access and interactions
- Alert acknowledgments and resolutions
- Configuration changes
- System events and errors

### Compliance Reports
Generate compliance reports:
```bash
# Export audit trail
curl "https://studio--drivemind-q69b7.us-central1.hosted.app/api/audit/export" \
  -H "Authorization: Bearer $TOKEN"
```

### Data Retention
- Metrics: 90 days
- Alerts: 1 year
- Audit logs: 7 years (compliance requirement)
- User analytics: 30 days

## Support & Maintenance

### Regular Tasks
- [ ] Weekly security scan review
- [ ] Monthly performance optimization
- [ ] Quarterly alert rule review
- [ ] Annual compliance audit

### Contact Information
- **Operations Team**: ops@yourdomain.com
- **Security Team**: security@yourdomain.com
- **Development Team**: dev@yourdomain.com

### Documentation Updates
This documentation is automatically updated with each deployment. For manual updates:

1. Edit this README.md file
2. Commit changes to version control
3. Deploy with the application

---

**Last Updated**: 2025-01-16
**Version**: 1.3.0
**Compliance**: ALPHA-CODENAME v1.8, AEI21 Compliant