/**
 * Export file inventory for the authenticated user (CSV/JSON).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/admin';
import { VaultExportService, type ExportFormat, type FileExportData } from '@/lib/export-service';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();
    if (!auth || !db) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json().catch(() => ({}));
    const format: ExportFormat = (body?.format || 'csv') as ExportFormat;
    const limit = Math.min(Math.max(parseInt(body?.limit ?? '1000', 10) || 1000, 1), 5000);

    // Fetch file index entries
    const snapshot = await db
      .collection('fileIndex')
      .where('uid', '==', uid)
      .where('isDeleted', '!=', true)
      .limit(limit)
      .get();

    const files: FileExportData[] = snapshot.docs.map((d) => {
      const f = d.data() as any;
      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType || 'unknown',
        size: typeof f.size === 'number' ? f.size : parseInt(f.size || '0'),
        modifiedTime: f.modifiedTime,
        // path not tracked in index; omitted
      };
    });

    const exporter = new VaultExportService(uid);
    const { filename, data, mimeType } = await exporter.exportFileInventory(files, {
      format,
      includeMetadata: true,
      includePaths: false,
      includeAnalysis: false,
    });

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
    return NextResponse.json({ error: 'Failed to export inventory', details: msg }, { status: 500 });
  }
}

