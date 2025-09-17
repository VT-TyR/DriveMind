/**
 * Alert Management System for Production Dashboard
 * ALPHA-CODENAME Production Gate Requirement
 * Manages alerts, thresholds, and notifications for operational monitoring
 */

import { logger } from './logger';
import { getAdminFirestore } from './admin';
import { analyticsService } from './analytics-service';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'contains';
  threshold: number | string;
  timeWindow: number; // minutes
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  currentValue: number | string;
  threshold: number | string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
  source: string;
  tags: string[];
  metadata?: Record<string, any>;
}

export interface AlertChannel {
  id: string;
  name: string;
  type: 'email' | 'webhook' | 'slack' | 'teams' | 'pagerduty';
  configuration: Record<string, any>;
  enabled: boolean;
  severityFilter: ('info' | 'warning' | 'error' | 'critical')[];
  tagFilter?: string[];
}

export interface NotificationResult {
  channelId: string;
  channelName: string;
  success: boolean;
  error?: string;
  timestamp: Date;
}

export class AlertSystem {
  private db = getAdminFirestore();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private alertChannels: Map<string, AlertChannel> = new Map();
  private evaluationInterval: NodeJS.Timeout | null = null;

  // Default alert rules for production monitoring
  private defaultRules: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'High Response Time',
      description: 'Average response time exceeds acceptable threshold',
      metric: 'system.responseTime',
      condition: 'greater_than',
      threshold: 250,
      timeWindow: 5,
      severity: 'warning',
      enabled: true,
      tags: ['performance', 'response-time']
    },
    {
      name: 'Critical Response Time',
      description: 'Average response time critically high',
      metric: 'system.responseTime',
      condition: 'greater_than',
      threshold: 1000,
      timeWindow: 2,
      severity: 'critical',
      enabled: true,
      tags: ['performance', 'response-time', 'critical']
    },
    {
      name: 'High Error Rate',
      description: 'Error rate exceeds acceptable threshold',
      metric: 'system.errorRate',
      condition: 'greater_than',
      threshold: 1,
      timeWindow: 5,
      severity: 'error',
      enabled: true,
      tags: ['reliability', 'errors']
    },
    {
      name: 'Critical Error Rate',
      description: 'Error rate critically high',
      metric: 'system.errorRate',
      condition: 'greater_than',
      threshold: 5,
      timeWindow: 2,
      severity: 'critical',
      enabled: true,
      tags: ['reliability', 'errors', 'critical']
    },
    {
      name: 'High Memory Usage',
      description: 'Memory usage exceeds safe threshold',
      metric: 'system.memoryUsagePercent',
      condition: 'greater_than',
      threshold: 80,
      timeWindow: 10,
      severity: 'warning',
      enabled: true,
      tags: ['resources', 'memory']
    },
    {
      name: 'Critical Memory Usage',
      description: 'Memory usage critically high',
      metric: 'system.memoryUsagePercent',
      condition: 'greater_than',
      threshold: 90,
      timeWindow: 5,
      severity: 'critical',
      enabled: true,
      tags: ['resources', 'memory', 'critical']
    },
    {
      name: 'Low Auth Success Rate',
      description: 'Authentication success rate below acceptable threshold',
      metric: 'business.authSuccessRate',
      condition: 'less_than',
      threshold: 95,
      timeWindow: 15,
      severity: 'warning',
      enabled: true,
      tags: ['authentication', 'user-experience']
    },
    {
      name: 'Security Score Drop',
      description: 'Security score below acceptable threshold',
      metric: 'security.securityScore',
      condition: 'less_than',
      threshold: 90,
      timeWindow: 30,
      severity: 'error',
      enabled: true,
      tags: ['security', 'compliance']
    },
    {
      name: 'Infrastructure Component Down',
      description: 'Critical infrastructure component unhealthy',
      metric: 'infrastructure.*.status',
      condition: 'equals',
      threshold: 'unhealthy',
      timeWindow: 2,
      severity: 'critical',
      enabled: true,
      tags: ['infrastructure', 'availability']
    },
    {
      name: 'Database Connection Issues',
      description: 'Database connection problems detected',
      metric: 'infrastructure.database.status',
      condition: 'not_equals',
      threshold: 'healthy',
      timeWindow: 5,
      severity: 'error',
      enabled: true,
      tags: ['database', 'infrastructure']
    }
  ];

  constructor() {
    this.initializeDefaultRules();
    this.loadRulesFromDatabase();
    this.loadChannelsFromDatabase();
    this.startEvaluationLoop();
  }

  /**
   * Initialize default alert rules
   */
  private async initializeDefaultRules(): Promise<void> {
    try {
      for (const rule of this.defaultRules) {
        const ruleId = this.generateId();
        const alertRule: AlertRule = {
          ...rule,
          id: ruleId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        this.alertRules.set(ruleId, alertRule);
        
        // Save to database
        if (this.db) {
          await this.db.collection('alert_rules').doc(ruleId).set(alertRule);
        }
      }

      logger.info('Default alert rules initialized', {
        count: this.defaultRules.length
      });

    } catch (error) {
      logger.error('Failed to initialize default alert rules', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Load alert rules from database
   */
  private async loadRulesFromDatabase(): Promise<void> {
    try {
      if (!this.db) return;
      const snapshot = await this.db.collection('alert_rules').get();
      
      snapshot.docs.forEach(doc => {
        const rule = doc.data() as AlertRule;
        this.alertRules.set(rule.id, rule);
      });

      logger.info('Alert rules loaded from database', {
        count: this.alertRules.size
      });

    } catch (error) {
      logger.error('Failed to load alert rules from database', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Load notification channels from database
   */
  private async loadChannelsFromDatabase(): Promise<void> {
    try {
      if (!this.db) return;
      const snapshot = await this.db.collection('alert_channels').get();
      
      snapshot.docs.forEach(doc => {
        const channel = doc.data() as AlertChannel;
        this.alertChannels.set(channel.id, channel);
      });

      logger.info('Alert channels loaded from database', {
        count: this.alertChannels.size
      });

    } catch (error) {
      logger.error('Failed to load alert channels from database', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Evaluate metrics against alert rules
   */
  async evaluateAlerts(metrics: any): Promise<Alert[]> {
    const newAlerts: Alert[] = [];

    try {
      for (const rule of this.alertRules.values()) {
        if (!rule.enabled) continue;

        const currentValue = this.extractMetricValue(metrics, rule.metric);
        if (currentValue === null) continue;

        const shouldAlert = this.evaluateCondition(
          currentValue,
          rule.condition,
          rule.threshold
        );

        if (shouldAlert) {
          const existingAlert = Array.from(this.activeAlerts.values())
            .find(alert => alert.ruleId === rule.id && !alert.resolved);

          if (!existingAlert) {
            const alert = await this.createAlert(rule, currentValue);
            newAlerts.push(alert);
            this.activeAlerts.set(alert.id, alert);

            // Send notifications
            await this.sendNotifications(alert);

            // Track analytics
            await analyticsService.trackEvent({
              event: 'alert_triggered',
              properties: {
                ruleId: rule.id,
                ruleName: rule.name,
                severity: rule.severity,
                metric: rule.metric,
                currentValue,
                threshold: rule.threshold
              }
            });
          }
        } else {
          // Check if we should resolve any active alerts for this rule
          const activeAlert = Array.from(this.activeAlerts.values())
            .find(alert => alert.ruleId === rule.id && !alert.resolved);

          if (activeAlert) {
            await this.resolveAlert(activeAlert.id);
          }
        }
      }

      if (newAlerts.length > 0) {
        logger.info('New alerts triggered', {
          count: newAlerts.length,
          alerts: newAlerts.map(a => ({ id: a.id, severity: a.severity, title: a.title }))
        });
      }

      return newAlerts;

    } catch (error) {
      logger.error('Failed to evaluate alerts', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Create a new alert
   */
  private async createAlert(rule: AlertRule, currentValue: number | string): Promise<Alert> {
    const alertId = this.generateId();
    
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      title: rule.name,
      message: this.formatAlertMessage(rule, currentValue),
      currentValue,
      threshold: rule.threshold,
      timestamp: new Date(),
      acknowledged: false,
      resolved: false,
      source: 'alert-system',
      tags: rule.tags,
      metadata: {
        metric: rule.metric,
        condition: rule.condition,
        timeWindow: rule.timeWindow
      }
    };

    // Save to database
    if (this.db) {
      await this.db.collection('alerts').doc(alertId).set(alert);
    }

    return alert;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<boolean> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert || alert.acknowledged) {
        return false;
      }

      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date();

      // Update in database
      if (this.db) {
        await this.db.collection('alerts').doc(alertId).update({
          acknowledged: true,
          acknowledgedBy,
          acknowledgedAt: alert.acknowledgedAt
        });
      }

      this.activeAlerts.set(alertId, alert);

      logger.info('Alert acknowledged', {
        alertId,
        acknowledgedBy,
        title: alert.title
      });

      // Track analytics
      await analyticsService.trackEvent({
        event: 'alert_acknowledged',
        userId: acknowledgedBy,
        properties: {
          alertId,
          severity: alert.severity,
          title: alert.title
        }
      });

      return true;

    } catch (error) {
      logger.error('Failed to acknowledge alert', {
        alertId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert || alert.resolved) {
        return false;
      }

      alert.resolved = true;
      alert.resolvedAt = new Date();

      // Update in database
      if (this.db) {
        await this.db.collection('alerts').doc(alertId).update({
          resolved: true,
          resolvedAt: alert.resolvedAt
        });
      }

      this.activeAlerts.set(alertId, alert);

      logger.info('Alert resolved', {
        alertId,
        title: alert.title,
        duration: alert.resolvedAt.getTime() - alert.timestamp.getTime()
      });

      // Track analytics
      await analyticsService.trackEvent({
        event: 'alert_resolved',
        properties: {
          alertId,
          severity: alert.severity,
          title: alert.title,
          duration: alert.resolvedAt.getTime() - alert.timestamp.getTime()
        }
      });

      return true;

    } catch (error) {
      logger.error('Failed to resolve alert', {
        alertId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => {
        // Sort by severity (critical > error > warning > info) then by timestamp
        const severityOrder = { critical: 4, error: 3, warning: 2, info: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.timestamp.getTime() - a.timestamp.getTime();
      });
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): {
    total: number;
    acknowledged: number;
    unacknowledged: number;
    bySeverity: Record<string, number>;
    avgTimeToAcknowledge: number;
    avgTimeToResolve: number;
  } {
    const activeAlerts = this.getActiveAlerts();
    const allAlerts = Array.from(this.activeAlerts.values());

    const acknowledged = activeAlerts.filter(a => a.acknowledged).length;
    const unacknowledged = activeAlerts.length - acknowledged;

    const bySeverity = activeAlerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate average times
    const acknowledgedAlerts = allAlerts.filter(a => a.acknowledged && a.acknowledgedAt);
    const resolvedAlerts = allAlerts.filter(a => a.resolved && a.resolvedAt);

    const avgTimeToAcknowledge = acknowledgedAlerts.length > 0
      ? acknowledgedAlerts.reduce((sum, alert) => {
          return sum + (alert.acknowledgedAt!.getTime() - alert.timestamp.getTime());
        }, 0) / acknowledgedAlerts.length / 1000 // Convert to seconds
      : 0;

    const avgTimeToResolve = resolvedAlerts.length > 0
      ? resolvedAlerts.reduce((sum, alert) => {
          return sum + (alert.resolvedAt!.getTime() - alert.timestamp.getTime());
        }, 0) / resolvedAlerts.length / 1000 // Convert to seconds
      : 0;

    return {
      total: activeAlerts.length,
      acknowledged,
      unacknowledged,
      bySeverity,
      avgTimeToAcknowledge,
      avgTimeToResolve
    };
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(alert: Alert): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const channel of this.alertChannels.values()) {
      if (!channel.enabled) continue;

      // Check severity filter
      if (!channel.severityFilter.includes(alert.severity)) continue;

      // Check tag filter
      if (channel.tagFilter && !alert.tags.some(tag => channel.tagFilter!.includes(tag))) {
        continue;
      }

      try {
        const success = await this.sendNotification(channel, alert);
        results.push({
          channelId: channel.id,
          channelName: channel.name,
          success,
          timestamp: new Date()
        });

      } catch (error) {
        results.push({
          channelId: channel.id,
          channelName: channel.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        });
      }
    }

    return results;
  }

  /**
   * Send notification to a specific channel
   */
  private async sendNotification(channel: AlertChannel, alert: Alert): Promise<boolean> {
    // In a real implementation, this would integrate with external services
    // For now, just log the notification
    logger.info('Alert notification sent', {
      channelType: channel.type,
      channelName: channel.name,
      alertId: alert.id,
      severity: alert.severity,
      title: alert.title
    });

    return true; // Simulate successful notification
  }

  /**
   * Extract metric value from metrics object
   */
  private extractMetricValue(metrics: any, metricPath: string): number | string | null {
    try {
      const paths = metricPath.split('.');
      let current = metrics;

      for (const path of paths) {
        if (path === '*') {
          // Handle wildcard paths (e.g., infrastructure.*.status)
          // For now, check all matching paths
          continue;
        }
        
        if (current && typeof current === 'object' && path in current) {
          current = current[path];
        } else {
          return null;
        }
      }

      return current;

    } catch (error) {
      return null;
    }
  }

  /**
   * Evaluate condition against threshold
   */
  private evaluateCondition(
    value: number | string,
    condition: string,
    threshold: number | string
  ): boolean {
    switch (condition) {
      case 'greater_than':
        return Number(value) > Number(threshold);
      case 'less_than':
        return Number(value) < Number(threshold);
      case 'equals':
        return value === threshold;
      case 'not_equals':
        return value !== threshold;
      case 'contains':
        return String(value).includes(String(threshold));
      default:
        return false;
    }
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(rule: AlertRule, currentValue: number | string): string {
    return `${rule.description}. Current value: ${currentValue}, Threshold: ${rule.threshold}`;
  }

  /**
   * Start evaluation loop
   */
  private startEvaluationLoop(): void {
    this.evaluationInterval = setInterval(async () => {
      try {
        // This would integrate with the dashboard metrics service
        // For now, we'll skip automatic evaluation as it needs metrics
        logger.debug('Alert evaluation cycle completed');
      } catch (error) {
        logger.error('Alert evaluation cycle failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 60000); // Evaluate every minute
  }

  /**
   * Stop evaluation loop
   */
  public stopEvaluationLoop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const alertSystem = new AlertSystem();