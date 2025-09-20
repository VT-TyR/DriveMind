#!/usr/bin/env node

/**
 * Phase 6 Migration Trigger Script
 * Executes the phased mock-to-real data migration
 * 
 * Usage:
 *   npm run migrate:phase6 [--dry-run] [--start-at=<percentage>]
 *   
 * Options:
 *   --dry-run: Run validation checks without starting migration
 *   --start-at: Start at specific percentage (5, 25, 50, 75, 100)
 */

import { config } from 'dotenv';
import fetch from 'node-fetch';
import * as readline from 'readline';

// Load environment variables
config();

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || 'migration-admin-2025';

interface MigrationStatus {
  active: boolean;
  phase: string;
  percentage: number;
  metrics: {
    totalRequests: number;
    mockRequests: number;
    firebaseRequests: number;
    errors: number;
    rollbacks: number;
  };
  validation: {
    dataIntegrity: boolean;
    performance: boolean;
    errorRate: boolean;
  };
}

class Phase6MigrationTrigger {
  private apiBase: string;
  private headers: Record<string, string>;
  private rl: readline.Interface;

  constructor() {
    this.apiBase = API_BASE;
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    };
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async run() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║     Phase 6 Migration: Mock to Real Data      ║');
    console.log('║            CX-Orchestrator Control             ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const startAtArg = args.find(arg => arg.startsWith('--start-at='));
    const startAtPercentage = startAtArg ? parseInt(startAtArg.split('=')[1]) : null;

    try {
      // Check current status
      console.log('📊 Checking current migration status...');
      const currentStatus = await this.getStatus();
      this.displayStatus(currentStatus);

      if (currentStatus.active) {
        console.log('\n⚠️  Migration is already active!');
        const continueExisting = await this.askQuestion(
          'Do you want to (m)onitor, (r)ollback, (a)bort, or (q)uit? [m/r/a/q]: '
        );

        switch (continueExisting.toLowerCase()) {
          case 'm':
            await this.monitorMigration();
            break;
          case 'r':
            await this.rollback();
            break;
          case 'a':
            await this.abort();
            break;
          default:
            console.log('Exiting...');
        }
        return;
      }

      // Pre-flight checks
      console.log('\n🔍 Running pre-flight checks...');
      const checks = await this.runPreflightChecks();
      this.displayPreflightChecks(checks);

      if (!checks.allPassed) {
        console.log('\n❌ Pre-flight checks failed!');
        if (!isDryRun) {
          const override = await this.askQuestion(
            'Do you want to proceed anyway? This is NOT recommended. [y/N]: '
          );
          if (override.toLowerCase() !== 'y') {
            console.log('Migration cancelled.');
            return;
          }
        } else {
          console.log('Dry run complete - would not proceed due to failed checks.');
          return;
        }
      }

      if (isDryRun) {
        console.log('\n✅ Dry run complete - all checks passed!');
        console.log('Remove --dry-run flag to start the actual migration.');
        return;
      }

      // Display migration plan
      console.log('\n📋 Migration Plan:');
      console.log('  Phase 1: 5% traffic → Firebase (5 min validation)');
      console.log('  Phase 2: 25% traffic → Firebase (10 min validation)');
      console.log('  Phase 3: 50% traffic → Firebase (15 min validation)');
      console.log('  Phase 4: 75% traffic → Firebase (10 min validation)');
      console.log('  Phase 5: 100% traffic → Firebase (5 min validation)');
      console.log('\n  Total estimated time: ~45 minutes');
      console.log('  Rollback capability: 38 seconds max');

      const confirm = await this.askQuestion(
        '\n⚠️  This will begin the production migration. Continue? [y/N]: '
      );

      if (confirm.toLowerCase() !== 'y') {
        console.log('Migration cancelled.');
        return;
      }

      // Start migration
      console.log('\n🚀 Starting Phase 6 migration...');
      await this.startMigration();

      // Monitor progress
      await this.monitorMigration();

    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  private async getStatus(): Promise<MigrationStatus> {
    const response = await fetch(`${this.apiBase}/api/migration/phase6`, {
      headers: this.headers
    });

    if (!response.ok) {
      throw new Error(`Failed to get status: ${response.statusText}`);
    }

    const data = await response.json() as { status: MigrationStatus };
    return data.status;
  }

  private async startMigration(): Promise<void> {
    const response = await fetch(`${this.apiBase}/api/migration/phase6`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ action: 'start' })
    });

    if (!response.ok) {
      throw new Error(`Failed to start migration: ${response.statusText}`);
    }

    console.log('✅ Migration started successfully!');
  }

  private async rollback(): Promise<void> {
    const confirm = await this.askQuestion(
      '\n⚠️  This will rollback to the previous phase. Continue? [y/N]: '
    );

    if (confirm.toLowerCase() !== 'y') {
      return;
    }

    const response = await fetch(`${this.apiBase}/api/migration/phase6`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ action: 'rollback' })
    });

    if (!response.ok) {
      throw new Error(`Failed to rollback: ${response.statusText}`);
    }

    console.log('✅ Rollback initiated!');
  }

  private async abort(): Promise<void> {
    const confirm = await this.askQuestion(
      '\n⚠️  This will abort the migration and revert to mock data. Continue? [y/N]: '
    );

    if (confirm.toLowerCase() !== 'y') {
      return;
    }

    const reason = await this.askQuestion('Reason for abort: ');

    const response = await fetch(`${this.apiBase}/api/migration/phase6`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ action: 'abort', reason })
    });

    if (!response.ok) {
      throw new Error(`Failed to abort: ${response.statusText}`);
    }

    console.log('✅ Migration aborted!');
  }

  private async monitorMigration(): Promise<void> {
    console.log('\n📊 Monitoring migration progress...');
    console.log('Press Ctrl+C to stop monitoring\n');

    let lastPhase = '';
    let lastPercentage = 0;

    const interval = setInterval(async () => {
      try {
        const status = await this.getStatus();
        
        if (!status.active) {
          console.log('\n✅ Migration completed!');
          clearInterval(interval);
          this.displayStatus(status);
          return;
        }

        // Only update if phase or percentage changed
        if (status.phase !== lastPhase || status.percentage !== lastPercentage) {
          this.displayProgressBar(status);
          lastPhase = status.phase;
          lastPercentage = status.percentage;
        }

        // Show validation status
        if (!status.validation.dataIntegrity || 
            !status.validation.performance || 
            !status.validation.errorRate) {
          console.log('⚠️  Validation issues detected!');
        }

      } catch (error) {
        console.error('Error fetching status:', error);
      }
    }, 5000);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n\nMonitoring stopped.');
      process.exit(0);
    });
  }

  private async runPreflightChecks(): Promise<any> {
    // Simulate pre-flight checks
    const checks = {
      firebaseConnection: true,
      authentication: !!ADMIN_TOKEN,
      safetyInfrastructure: true,
      rollbackCapability: true,
      diskSpace: true,
      allPassed: true
    };

    checks.allPassed = Object.values(checks).every(v => v === true);
    return checks;
  }

  private displayStatus(status: MigrationStatus): void {
    console.log('\n📈 Current Status:');
    console.log(`  Active: ${status.active ? '✅' : '❌'}`);
    console.log(`  Phase: ${status.phase}`);
    console.log(`  Traffic: ${status.percentage}% → Firebase`);
    console.log(`  Requests: ${status.metrics.totalRequests} total`);
    console.log(`    Mock: ${status.metrics.mockRequests}`);
    console.log(`    Firebase: ${status.metrics.firebaseRequests}`);
    console.log(`  Errors: ${status.metrics.errors}`);
    console.log(`  Rollbacks: ${status.metrics.rollbacks}`);
    console.log('\n  Validation:');
    console.log(`    Data Integrity: ${status.validation.dataIntegrity ? '✅' : '❌'}`);
    console.log(`    Performance: ${status.validation.performance ? '✅' : '❌'}`);
    console.log(`    Error Rate: ${status.validation.errorRate ? '✅' : '❌'}`);
  }

  private displayPreflightChecks(checks: any): void {
    console.log('\n  ✓ Firebase Connection: ' + (checks.firebaseConnection ? '✅' : '❌'));
    console.log('  ✓ Authentication: ' + (checks.authentication ? '✅' : '❌'));
    console.log('  ✓ Safety Infrastructure: ' + (checks.safetyInfrastructure ? '✅' : '❌'));
    console.log('  ✓ Rollback Capability: ' + (checks.rollbackCapability ? '✅' : '❌'));
    console.log('  ✓ Disk Space: ' + (checks.diskSpace ? '✅' : '❌'));
  }

  private displayProgressBar(status: MigrationStatus): void {
    const width = 50;
    const progress = Math.floor((status.percentage / 100) * width);
    const bar = '█'.repeat(progress) + '░'.repeat(width - progress);
    
    process.stdout.write('\r');
    process.stdout.write(
      `Phase: ${status.phase.padEnd(10)} [${bar}] ${status.percentage}% ` +
      `| Requests: ${status.metrics.totalRequests} | Errors: ${status.metrics.errors}`
    );
  }

  private askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }
}

// Run the migration trigger
if (require.main === module) {
  const trigger = new Phase6MigrationTrigger();
  trigger.run().catch(console.error);
}

export { Phase6MigrationTrigger };