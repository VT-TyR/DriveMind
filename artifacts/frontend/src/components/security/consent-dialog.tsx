/**
 * GDPR Consent Management Dialog
 * 
 * Comprehensive consent management interface with granular controls
 * for PII processing by AI services. WCAG AA compliant.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield,
  Eye,
  Brain,
  Database,
  Clock,
  Download,
  AlertTriangle,
  CheckCircle,
  Info,
  Settings
} from 'lucide-react';
import {
  CONSENT_PURPOSES,
  PII_DATA_TYPES,
  ConsentRecord,
  ConsentStatus,
  grantConsent,
  revokeConsent,
  checkConsentStatus,
  getConsentSummary,
  exportConsentData
} from '@/lib/security/consent-manager';

interface ConsentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onConsentChanged: (hasConsent: boolean) => void;
  purpose?: string;
  required?: boolean;
}

export default function ConsentDialog({
  isOpen,
  onClose,
  userId,
  onConsentChanged,
  purpose,
  required = false
}: ConsentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(null);
  const [selectedPurposes, setSelectedPurposes] = useState<Record<string, boolean>>({});
  const [selectedDataTypes, setSelectedDataTypes] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('purposes');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expirationMonths, setExpirationMonths] = useState(12);

  // Load current consent status
  useEffect(() => {
    if (isOpen && userId) {
      loadConsentStatus();
    }
  }, [isOpen, userId]);

  // Pre-select required purpose if specified
  useEffect(() => {
    if (purpose && CONSENT_PURPOSES[purpose]) {
      setSelectedPurposes(prev => ({ ...prev, [purpose]: true }));
      
      // Auto-select required data types for this purpose
      const purposeDataTypes = CONSENT_PURPOSES[purpose].dataTypes;
      const dataTypeSelections: Record<string, boolean> = {};
      purposeDataTypes.forEach(dataType => {
        dataTypeSelections[dataType] = true;
      });
      setSelectedDataTypes(prev => ({ ...prev, ...dataTypeSelections }));
    }
  }, [purpose]);

  const loadConsentStatus = async () => {
    setLoading(true);
    try {
      const status = await checkConsentStatus(userId);
      setConsentStatus(status);
      
      // Pre-populate selections based on current consent
      if (status.hasConsent) {
        const purposeMap: Record<string, boolean> = {};
        status.purposes.forEach(p => {
          purposeMap[p] = true;
        });
        setSelectedPurposes(purposeMap);
        
        const dataTypeMap: Record<string, boolean> = {};
        status.dataTypes.forEach(dt => {
          dataTypeMap[dt] = true;
        });
        setSelectedDataTypes(dataTypeMap);
      }
    } catch (error) {
      console.error('Failed to load consent status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurposeToggle = (purposeId: string, checked: boolean) => {
    const purpose = CONSENT_PURPOSES[purposeId];
    if (!purpose) return;

    setSelectedPurposes(prev => ({ ...prev, [purposeId]: checked }));

    // Auto-toggle related data types
    if (checked) {
      const dataTypeUpdates: Record<string, boolean> = {};
      purpose.dataTypes.forEach(dataType => {
        dataTypeUpdates[dataType] = true;
      });
      setSelectedDataTypes(prev => ({ ...prev, ...dataTypeUpdates }));
    } else {
      // Don't auto-remove data types as they might be used by other purposes
      // Let user manage data types manually in advanced tab
    }
  };

  const handleDataTypeToggle = (dataType: string, checked: boolean) => {
    setSelectedDataTypes(prev => ({ ...prev, [dataType]: checked }));
  };

  const handleGrantConsent = async () => {
    setLoading(true);
    try {
      const purposes = Object.keys(selectedPurposes).filter(p => selectedPurposes[p]);
      const dataTypes = Object.keys(selectedDataTypes).filter(dt => selectedDataTypes[dt]);
      
      if (purposes.length === 0) {
        throw new Error('Please select at least one purpose for consent');
      }

      await grantConsent(userId, purposes, dataTypes, expirationMonths);
      onConsentChanged(true);
      onClose();
    } catch (error) {
      console.error('Failed to grant consent:', error);
      // Show error to user
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeConsent = async () => {
    setLoading(true);
    try {
      await revokeConsent(userId);
      setSelectedPurposes({});
      setSelectedDataTypes({});
      onConsentChanged(false);
      onClose();
    } catch (error) {
      console.error('Failed to revoke consent:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      const exportData = await exportConsentData(userId);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drivemind-consent-data-${userId}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export consent data:', error);
    }
  };

  const getConsentProgress = () => {
    const totalPurposes = Object.keys(CONSENT_PURPOSES).length;
    const selectedCount = Object.values(selectedPurposes).filter(Boolean).length;
    return Math.round((selectedCount / totalPurposes) * 100);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'essential':
        return <Shield className="h-4 w-4" />;
      case 'ai-processing':
        return <Brain className="h-4 w-4" />;
      case 'analytics':
        return <Eye className="h-4 w-4" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'essential':
        return 'destructive';
      case 'ai-processing':
        return 'default';
      case 'analytics':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (loading && !consentStatus) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-sm text-muted-foreground">Loading consent status...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="consent-dialog-title"
        aria-describedby="consent-dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="consent-dialog-title" className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy & Consent Management
          </DialogTitle>
          <DialogDescription id="consent-dialog-description">
            Manage your consent preferences for AI processing of your data. You can change these settings at any time.
          </DialogDescription>
        </DialogHeader>

        {consentStatus?.needsRenewal && (
          <Alert className="mb-4">
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Your consent will expire soon. Please review and renew your preferences.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Consent Status Overview */}
          {consentStatus && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  Current Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Consent Progress</span>
                  <span className="text-sm text-muted-foreground">{getConsentProgress()}%</span>
                </div>
                <Progress value={getConsentProgress()} className="mb-4" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Active Purposes:</span>
                    <span className="ml-2">{consentStatus.purposes.length}</span>
                  </div>
                  <div>
                    <span className="font-medium">Data Types:</span>
                    <span className="ml-2">{consentStatus.dataTypes.length}</span>
                  </div>
                  {consentStatus.grantedAt && (
                    <div className="col-span-2">
                      <span className="font-medium">Granted:</span>
                      <span className="ml-2">{consentStatus.grantedAt.toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="purposes">Processing Purposes</TabsTrigger>
              <TabsTrigger value="data">Data Types</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* Processing Purposes Tab */}
            <TabsContent value="purposes" className="space-y-4">
              <div className="grid gap-4">
                {Object.values(CONSENT_PURPOSES).map((purpose) => (
                  <Card 
                    key={purpose.id}
                    className={`transition-colors ${
                      selectedPurposes[purpose.id] ? 'border-primary' : ''
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(purpose.category)}
                          <CardTitle className="text-base">{purpose.name}</CardTitle>
                          <Badge variant={getCategoryColor(purpose.category)} className="text-xs">
                            {purpose.category}
                          </Badge>
                          {purpose.required && (
                            <Badge variant="destructive" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                        <Switch
                          checked={selectedPurposes[purpose.id] || false}
                          onCheckedChange={(checked) => handlePurposeToggle(purpose.id, checked)}
                          disabled={purpose.required}
                          aria-label={`Toggle consent for ${purpose.name}`}
                        />
                      </div>
                      <CardDescription>{purpose.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Data types used:</span>
                        {purpose.dataTypes.map((dataType, index) => (
                          <span key={dataType}>
                            {index > 0 && ', '}
                            {dataType.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Data Types Tab */}
            <TabsContent value="data" className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Data types are automatically selected based on your chosen purposes. 
                  You can fine-tune these settings here.
                </AlertDescription>
              </Alert>
              
              <div className="grid gap-3">
                {Object.entries(PII_DATA_TYPES).map(([dataType, description]) => (
                  <Card key={dataType}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm capitalize">
                            {dataType.replace('_', ' ')}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {description}
                          </div>
                        </div>
                        <Switch
                          checked={selectedDataTypes[dataType] || false}
                          onCheckedChange={(checked) => handleDataTypeToggle(dataType, checked)}
                          aria-label={`Toggle consent for ${dataType.replace('_', ' ')}`}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Settings className="h-4 w-4" />
                    Consent Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Consent Duration (months)
                    </label>
                    <select 
                      value={expirationMonths}
                      onChange={(e) => setExpirationMonths(Number(e.target.value))}
                      className="w-full p-2 border rounded text-sm"
                      aria-label="Select consent duration"
                    >
                      <option value={3}>3 months</option>
                      <option value={6}>6 months</option>
                      <option value={12}>12 months (recommended)</option>
                      <option value={24}>24 months</option>
                    </select>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Data Rights (GDPR)</h4>
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportData}
                        className="justify-start"
                        aria-label="Export your consent data"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export My Data
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {consentStatus?.hasConsent && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Revoking consent will disable AI features but won't affect your stored files.
                    You can grant consent again at any time.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {required ? 'Later' : 'Cancel'}
          </Button>
          
          {consentStatus?.hasConsent && (
            <Button
              variant="destructive"
              onClick={handleRevokeConsent}
              disabled={loading}
              aria-label="Revoke all consent"
            >
              Revoke Consent
            </Button>
          )}
          
          <Button
            onClick={handleGrantConsent}
            disabled={loading || Object.values(selectedPurposes).every(v => !v)}
            aria-label="Grant consent for selected purposes"
          >
            {loading ? 'Processing...' : 'Grant Consent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}