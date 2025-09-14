/**
 * Security Notification Component
 * 
 * Displays security-related notifications and alerts with appropriate
 * urgency levels and action buttons. WCAG AA compliant.
 */

'use client';

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Info,
  Clock,
  X,
  ExternalLink,
  Refresh
} from 'lucide-react';

export interface SecurityNotification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  category: 'authentication' | 'authorization' | 'data-protection' | 'privacy' | 'system';
  timestamp: Date;
  actions?: SecurityAction[];
  autoHide?: boolean;
  persistent?: boolean;
  details?: string;
  learnMoreUrl?: string;
}

export interface SecurityAction {
  id: string;
  label: string;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

interface SecurityNotificationProps {
  notification: SecurityNotification;
  onDismiss?: (id: string) => void;
  onAction?: (notificationId: string, actionId: string) => void;
  compact?: boolean;
  showTimestamp?: boolean;
}

export default function SecurityNotificationComponent({
  notification,
  onDismiss,
  onAction,
  compact = false,
  showTimestamp = true
}: SecurityNotificationProps) {
  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'error':
        return <ShieldAlert className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getCategoryIcon = () => {
    switch (notification.category) {
      case 'authentication':
        return <Lock className="h-3 w-3" />;
      case 'authorization':
        return <Shield className="h-3 w-3" />;
      case 'data-protection':
        return <ShieldCheck className="h-3 w-3" />;
      case 'privacy':
        return <Eye className="h-3 w-3" />;
      default:
        return <Info className="h-3 w-3" />;
    }
  };

  const getSeverityColor = () => {
    switch (notification.severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getAlertVariant = () => {
    switch (notification.type) {
      case 'error':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const handleActionClick = (actionId: string) => {
    if (onAction) {
      onAction(notification.id, actionId);
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss(notification.id);
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg border bg-card text-card-foreground shadow-sm"
        role="alert"
        aria-live={notification.severity === 'critical' ? 'assertive' : 'polite'}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getIcon()}
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant={getSeverityColor()} className="text-xs px-1.5 py-0.5">
              <span className="flex items-center gap-1">
                {getCategoryIcon()}
                {notification.category}
              </span>
            </Badge>
            <span className="text-sm font-medium truncate">{notification.title}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {showTimestamp && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {formatTimestamp(notification.timestamp)}
            </span>
          )}
          
          {notification.actions?.slice(0, 1).map((action) => (
            <Button
              key={action.id}
              variant={action.variant}
              size="sm"
              onClick={() => handleActionClick(action.id)}
              disabled={action.disabled || action.loading}
              className="h-7 px-2 text-xs"
            >
              {action.loading ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b border-current" />
              ) : (
                action.icon
              )}
              <span className="hidden sm:inline ml-1">{action.label}</span>
            </Button>
          ))}
          
          {onDismiss && !notification.persistent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-7 w-7 p-0"
              aria-label="Dismiss notification"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Alert
      variant={getAlertVariant()}
      className="relative"
      role="alert"
      aria-live={notification.severity === 'critical' ? 'assertive' : 'polite'}
    >
      {/* Dismiss Button */}
      {onDismiss && !notification.persistent && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="absolute top-2 right-2 h-6 w-6 p-0"
          aria-label="Dismiss notification"
        >
          <X className="h-3 w-3" />
        </Button>
      )}

      <div className="flex gap-3">
        {getIcon()}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTitle className="flex items-center gap-2">
                {notification.title}
              </AlertTitle>
              <div className="flex items-center gap-1">
                <Badge variant={getSeverityColor()} className="text-xs">
                  <span className="flex items-center gap-1">
                    {getCategoryIcon()}
                    {notification.severity}
                  </span>
                </Badge>
                {showTimestamp && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatTimestamp(notification.timestamp)}
                  </Badge>
                )}
              </div>
            </div>
            
            <AlertDescription className="text-sm">
              {notification.message}
            </AlertDescription>
          </div>

          {/* Details */}
          {notification.details && (
            <Card className="bg-muted/50">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">{notification.details}</p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {(notification.actions?.length || notification.learnMoreUrl) && (
            <div className="flex items-center gap-2 flex-wrap">
              {notification.actions?.map((action) => (
                <Button
                  key={action.id}
                  variant={action.variant}
                  size="sm"
                  onClick={() => handleActionClick(action.id)}
                  disabled={action.disabled || action.loading}
                  className="h-8"
                >
                  {action.loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b border-current mr-2" />
                  ) : (
                    action.icon && <span className="mr-2">{action.icon}</span>
                  )}
                  {action.label}
                </Button>
              ))}
              
              {notification.learnMoreUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-8"
                >
                  <a 
                    href={notification.learnMoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Learn more about this security issue (opens in new window)"
                  >
                    <ExternalLink className="h-3 w-3 mr-2" />
                    Learn More
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Alert>
  );
}

/**
 * Security Notification List Component
 */
interface SecurityNotificationListProps {
  notifications: SecurityNotification[];
  onDismiss?: (id: string) => void;
  onAction?: (notificationId: string, actionId: string) => void;
  maxVisible?: number;
  compact?: boolean;
  groupByCategory?: boolean;
}

export function SecurityNotificationList({
  notifications,
  onDismiss,
  onAction,
  maxVisible = 5,
  compact = false,
  groupByCategory = false
}: SecurityNotificationListProps) {
  // Sort notifications by severity and timestamp
  const sortedNotifications = [...notifications].sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  const visibleNotifications = sortedNotifications.slice(0, maxVisible);
  const hiddenCount = Math.max(0, notifications.length - maxVisible);

  if (groupByCategory) {
    const grouped = visibleNotifications.reduce((acc, notification) => {
      if (!acc[notification.category]) {
        acc[notification.category] = [];
      }
      acc[notification.category].push(notification);
      return acc;
    }, {} as Record<string, SecurityNotification[]>);

    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([category, categoryNotifications]) => (
          <div key={category} className="space-y-2">
            <h3 className="text-sm font-medium capitalize flex items-center gap-2">
              {category === 'authentication' && <Lock className="h-4 w-4" />}
              {category === 'authorization' && <Shield className="h-4 w-4" />}
              {category === 'data-protection' && <ShieldCheck className="h-4 w-4" />}
              {category === 'privacy' && <Eye className="h-4 w-4" />}
              {category === 'system' && <Info className="h-4 w-4" />}
              {category.replace('-', ' ')} ({categoryNotifications.length})
            </h3>
            <div className="space-y-2 pl-6">
              {categoryNotifications.map((notification) => (
                <SecurityNotificationComponent
                  key={notification.id}
                  notification={notification}
                  onDismiss={onDismiss}
                  onAction={onAction}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        ))}
        
        {hiddenCount > 0 && (
          <div className="text-center">
            <Badge variant="outline" className="text-xs">
              +{hiddenCount} more notifications
            </Badge>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleNotifications.map((notification) => (
        <SecurityNotificationComponent
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
          onAction={onAction}
          compact={compact}
        />
      ))}
      
      {hiddenCount > 0 && (
        <div className="text-center">
          <Badge variant="outline" className="text-xs">
            +{hiddenCount} more notifications
          </Badge>
        </div>
      )}
    </div>
  );
}