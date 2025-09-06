
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, Files, ListChecks, ShieldAlert, GitMerge, FolderSync, Copy, Activity, TestTube2, Archive, Info } from 'lucide-react';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/shared/logo';
import OperatingModeSwitch from './operating-mode-switch';
import { AuthSection } from './auth-section';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-1">
            <Logo />
            <span className="text-lg font-semibold text-foreground font-headline">
              DriveMind
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/dashboard' || pathname === '/'}
                tooltip={{ children: 'Dashboard' }}
              >
                <Link href="/dashboard">
                  <BarChart2 />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/inventory')}
                tooltip={{ children: 'Inventory' }}
              >
                <Link href="/inventory">
                  <Files />
                  <span>Inventory</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/organize')}
                tooltip={{ children: 'Organize' }}
              >
                <Link href="/organize">
                  <FolderSync />
                  <span>Organize</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/duplicates')}
                tooltip={{ children: 'Duplicates' }}
              >
                <Link href="/duplicates">
                  <Copy />
                  <span>Duplicates</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/rules')}
                tooltip={{ children: 'Rules' }}
              >
                <Link href="/rules">
                  <ListChecks />
                  <span>Rules</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/graph')}
                tooltip={{ children: 'Graph' }}
              >
                <Link href="/graph">
                  <GitMerge />
                  <span>Graph</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/risk')}
                tooltip={{ children: 'Risk' }}
              >
                <Link href="/risk">
                  <ShieldAlert />
                  <span>Risk</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/health')}
                tooltip={{ children: 'Health' }}
              >
                <Link href="/health">
                  <Activity />
                  <span>Health</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/vault')}
                tooltip={{ children: 'Data Vault' }}
              >
                <Link href="/vault">
                  <Archive />
                  <span>Vault</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/about')}
                tooltip={{ children: 'About DriveMind' }}
              >
                <Link href="/about">
                  <Info />
                  <span>About</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/ai')}
                tooltip={{ children: 'AI/Dev' }}
              >
                <Link href="/ai">
                  <TestTube2 />
                  <span>AI/Dev</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <AuthSection />
          <OperatingModeSwitch />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
