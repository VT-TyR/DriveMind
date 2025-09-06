'use client';

import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  HardDrive,
  Search,
  Copy,
  FolderOpen,
  Shield,
  Zap,
  Brain,
  FileText,
  BarChart3,
  Settings,
  Github,
  Mail,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { useOperatingMode } from '@/contexts/operating-mode-context';

export default function AboutPage() {
  const { isAiEnabled } = useOperatingMode();

  const features = [
    {
      icon: HardDrive,
      title: "Drive Scanning",
      description: "Comprehensive analysis of your Google Drive with detailed file inventory and metadata extraction."
    },
    {
      icon: Copy,
      title: "Duplicate Detection", 
      description: "Smart algorithms identify duplicates using content hashing, fuzzy matching, and version detection."
    },
    {
      icon: FolderOpen,
      title: "File Organization",
      description: "AI-powered suggestions for folder structure optimization and automated file organization rules."
    },
    {
      icon: Search,
      title: "Smart Search",
      description: "Advanced search capabilities with content analysis and intelligent file categorization."
    },
    {
      icon: BarChart3,
      title: "Analytics & Insights",
      description: "Detailed reports on storage usage, file patterns, and optimization opportunities."
    },
    {
      icon: Shield,
      title: "Privacy & Security",
      description: "Your data stays secure with OAuth authentication and encrypted communications."
    }
  ];

  const specs = [
    { label: "Max Scan Depth", value: "20 levels" },
    { label: "File Types", value: "All formats" },
    { label: "Duplicate Detection", value: "Content + fuzzy matching" },
    { label: "Batch Operations", value: "Up to 1000 files" },
    { label: "Analytics Retention", value: "Unlimited" },
    { label: "API Rate Limits", value: "Google Drive compliant" }
  ];

  return (
    <MainLayout>
      <div className="flex-1 space-y-8 p-4 pt-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-3xl font-bold tracking-tight font-headline">About DriveMind</h1>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
        </div>

        {/* Hero Section */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-none">
          <CardContent className="p-8">
            <div className="max-w-3xl">
              <h2 className="text-4xl font-bold mb-4">Intelligent Google Drive Management</h2>
              <p className="text-xl text-muted-foreground mb-6">
                DriveMind is an advanced file management platform that helps you analyze, organize, and optimize your Google Drive storage with AI-powered insights and automation.
              </p>
              <div className="flex gap-4">
                <Link href="/dashboard">
                  <Button size="lg" className="gap-2">
                    <HardDrive className="h-4 w-4" />
                    Get Started
                  </Button>
                </Link>
                <Link href="/health">
                  <Button size="lg" variant="outline" className="gap-2">
                    <Settings className="h-4 w-4" />
                    System Health
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div>
          <h3 className="text-2xl font-bold mb-6">Core Features</h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <feature.icon className="h-5 w-5 text-primary" />
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Technical Specifications */}
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Technical Specifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {specs.map((spec, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-muted-foreground">{spec.label}</span>
                    <Badge variant="secondary">{spec.value}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Zap className="h-4 w-4 text-yellow-500 mt-1 flex-shrink-0" />
                  <div>
                    <div className="font-medium">Smart Organization</div>
                    <div className="text-sm text-muted-foreground">AI analyzes file content and suggests optimal folder structures</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="h-4 w-4 text-yellow-500 mt-1 flex-shrink-0" />
                  <div>
                    <div className="font-medium">Duplicate Intelligence</div>
                    <div className="text-sm text-muted-foreground">Advanced algorithms detect similar files beyond simple name matching</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="h-4 w-4 text-yellow-500 mt-1 flex-shrink-0" />
                  <div>
                    <div className="font-medium">Usage Insights</div>
                    <div className="text-sm text-muted-foreground">Machine learning identifies patterns and optimization opportunities</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">1. Secure Connection</h4>
                <p className="text-sm text-muted-foreground">Connect your Google Drive using OAuth 2.0 authentication</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">2. Deep Analysis</h4>
                <p className="text-sm text-muted-foreground">Scan and analyze your files with comprehensive metadata extraction</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">3. AI Processing</h4>
                <p className="text-sm text-muted-foreground">Generate intelligent insights and optimization recommendations</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">4. Take Action</h4>
                <p className="text-sm text-muted-foreground">Implement suggestions or use automated tools to optimize your Drive</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Privacy & Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy & Security
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="font-semibold mb-2">Data Protection</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• OAuth 2.0 secure authentication</li>
                  <li>• No storage of your file contents</li>
                  <li>• Encrypted data transmission</li>
                  <li>• Metadata analysis only</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Your Control</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Revoke access anytime</li>
                  <li>• Choose what to analyze</li>
                  <li>• Transparent operations</li>
                  <li>• No third-party sharing</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Technology Stack</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frontend</span>
                  <span>Next.js 15 + React</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Backend</span>
                  <span>Firebase + Node.js</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI/ML</span>
                  <span>Google Gemini</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Database</span>
                  <span>Cloud Firestore</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hosting</span>
                  <span>Firebase App Hosting</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Version Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <Badge>v1.0.0</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Release</span>
                  <span>December 2024</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary">Beta</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updates</span>
                  <span>Continuous</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Get Involved</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
                <a href="https://github.com/VT-TyR/DriveMind" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" />
                  View on GitHub
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </a>
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
                <a href="mailto:feedback@drivemind.ai">
                  <Mail className="h-4 w-4" />
                  Send Feedback
                </a>
              </Button>
              <Link href="/health">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <Settings className="h-4 w-4" />
                  System Status
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}