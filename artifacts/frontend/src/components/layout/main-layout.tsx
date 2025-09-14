'use client';

/**
 * Main application layout with responsive sidebar navigation
 * Implements ALPHA-CODENAME v1.4 accessibility and UX standards
 */

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/auth-provider';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { useMobile } from '@/hooks/use-mobile';
import { 
  Menu,
  Home,
  Files,
  Copy,
  Sparkles,
  FolderTree,
  Settings,
  User,
  LogOut,
  Shield,
  Activity,
  HelpCircle,
  ChevronRight,
  Zap,
  ZapOff
} from 'lucide-react';

interface NavigationItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  requiresAuth?: boolean;
  requiresDriveAuth?: boolean;
  adminOnly?: boolean;
  aiOnly?: boolean;
}

const navigationItems: NavigationItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: Home,
    requiresAuth: true,
  },
  {
    href: '/inventory',
    label: 'File Inventory',
    icon: Files,
    requiresAuth: true,
    requiresDriveAuth: true,
  },
  {
    href: '/duplicates',
    label: 'Duplicates',
    icon: Copy,
    requiresAuth: true,
    requiresDriveAuth: true,
  },
  {
    href: '/organize',
    label: 'Organize',
    icon: FolderTree,
    requiresAuth: true,
    requiresDriveAuth: true,
  },
  {
    href: '/ai',
    label: 'AI Analysis',
    icon: Sparkles,
    requiresAuth: true,
    requiresDriveAuth: true,
    aiOnly: true,
  },
  {
    href: '/rules',
    label: 'Rules',
    icon: Settings,
    requiresAuth: true,
    requiresDriveAuth: true,
  },
];

const systemItems: NavigationItem[] = [
  {
    href: '/health',
    label: 'System Health',
    icon: Activity,
  },
  {
    href: '/about',
    label: 'About',
    icon: HelpCircle,
  },
];

const adminItems: NavigationItem[] = [
  {
    href: '/admin/drive-tokens',
    label: 'Drive Tokens',
    icon: Shield,
    adminOnly: true,
    requiresAuth: true,
  },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const isMobile = useMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, authenticated, hasValidDriveToken, signOut } = useAuth();
  const { isAiEnabled, toggleAiMode } = useOperatingMode();

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  // Filter navigation items based on auth state and permissions
  const getVisibleItems = (items: NavigationItem[]) => {
    return items.filter(item => {
      if (item.requiresAuth && !authenticated) return false;
      if (item.requiresDriveAuth && !hasValidDriveToken) return false;
      if (item.adminOnly && !user?.email?.endsWith('@drivemind.ai')) return false;
      if (item.aiOnly && !isAiEnabled) return false;
      return true;
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="p-4">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">DriveMind</span>
        </Link>
        
        {/* Operating Mode Toggle */}
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className={cn(
                "p-1 rounded",
                isAiEnabled ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
              )}>
                {isAiEnabled ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
              </div>
              <span className="text-sm font-medium">
                {isAiEnabled ? 'AI Mode' : 'Basic Mode'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAiMode}
              className="h-8 w-8 p-0"
              aria-label={`Switch to ${isAiEnabled ? 'basic' : 'AI'} mode`}
            >
              <ChevronRight className={cn(
                "h-4 w-4 transition-transform",
                isAiEnabled && "rotate-180"
              )} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isAiEnabled 
              ? 'AI-powered insights and automation' 
              : 'Manual file operations only'
            }
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1" role="navigation" aria-label="Main navigation">
        {/* Main Items */}
        <div className="space-y-1">
          {getVisibleItems(navigationItems).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-ring",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>

        <Separator className="my-4" />

        {/* System Items */}
        <div className="space-y-1">
          <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            System
          </h4>
          {getVisibleItems(systemItems).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-ring",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Admin Items */}
        {getVisibleItems(adminItems).length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="space-y-1">
              <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Admin
              </h4>
              {getVisibleItems(adminItems).map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-ring",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* User Section */}
      {user && (
        <div className="p-4 border-t">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user.displayName || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="h-8 w-8 p-0"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Drive Connection Status */}
          <div className="mt-2 p-2 bg-muted rounded text-xs">
            <div className="flex items-center justify-between">
              <span>Google Drive</span>
              <Badge 
                variant={hasValidDriveToken ? "default" : "destructive"}
                className="text-xs"
              >
                {hasValidDriveToken ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Navigation */}
      {isMobile && (
        <div className="sticky top-0 z-50 bg-background border-b p-4 md:hidden">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <div className="h-6 w-6 bg-primary rounded flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold">DriveMind</span>
            </Link>
            
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      )}

      <div className="flex h-screen overflow-hidden">
        {/* Desktop Sidebar */}
        {!isMobile && (
          <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-card border-r">
            <SidebarContent />
          </div>
        )}

        {/* Main Content */}
        <main 
          className={cn(
            "flex-1 overflow-auto",
            !isMobile && "md:ml-64"
          )}
          role="main"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
