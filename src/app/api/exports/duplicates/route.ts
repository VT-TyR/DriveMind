/**
 * Export duplicates report
 * - Auth required (Firebase ID token)
 * - Body (JSON): { format: 'json'|'csv'|'pdf', options?, detection? }
 *   - If detection is omitted, use sensible defaults to run duplicate detection first.
 *   - Otherwise, pass { groups: [...]} to export directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/admin';
import { VaultExportService, type ExportFormat, type FileExportData } from '@/lib/export-service';
import { detectSmartDuplicates } from '@/ai/flows/duplicates-detect-smart';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json().catch(() => ({}));
    const format: ExportFormat = (body?.format || 'json') as ExportFormat;

    // If client provided groups, use them. Otherwise, run detection with defaults or provided overrides.
    let groups: Array<{ id: string; files: FileExportData[]; similarity: number; type: string }>; 
    if (Array.isArray(body?.groups)) {
      groups = body.groups as any;
    } else {
      const detectionCfg = body?.detection || {};
      const result = await detectSmartDuplicates({
        auth: { uid, email: decoded.email },
        algorithm: detectionCfg.algorithm || 'thorough',
        includeContentHashing: detectionCfg.includeContentHashing ?? true,
        includeFuzzyMatching: detectionCfg.includeFuzzyMatching ?? true,
        minFileSize: detectionCfg.minFileSize ?? 1024,
        maxFiles: detectionCfg.maxFiles ?? 2000,
      });
      // Normalize to export shape
      groups = (result.duplicateGroups || []).map((g: any, i: number) => ({
        id: g.id || `group_${i}`,
        files: (g.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType || 'unknown',
          size: typeof f.size === 'number' ? f.size : parseInt(f.size || '0'),
          modifiedTime: f.modifiedTime,
          path: f.path,
        })),
        similarity: g.similarity ?? 100,
        type: g.type || 'exact',
      }));
    }

    const exporter = new VaultExportService(uid);
    const { filename, data, mimeType } = await exporter.exportDuplicateReport(groups, { format });

    const buf = Buffer.from(await data.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to export duplicates', details: msg }, { status: 500 });
  }
}

