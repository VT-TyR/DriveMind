import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('google_access_token')?.value;
    const refreshToken = cookieStore.get('google_refresh_token')?.value;
    
    if (!accessToken && !refreshToken) {
      return NextResponse.json({ connected: false });
    }
    
    // Test the connection by making a simple API call
    try {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        return NextResponse.json({ connected: false, error: 'OAuth not configured' });
      }
      
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      
      // Test with a simple call to list files (limit 1 to minimize impact)
      await drive.files.list({ pageSize: 1 });
      
      return NextResponse.json({ connected: true });
    } catch (error) {
      // Connection failed, clear cookies
      (await cookies()).delete('google_access_token');
      (await cookies()).delete('google_refresh_token');
      
      return NextResponse.json({ connected: false, error: 'Token invalid' });
    }
  } catch (error) {
    console.error('Drive status check error:', error);
    return NextResponse.json({ connected: false, error: 'Status check failed' });
  }
}