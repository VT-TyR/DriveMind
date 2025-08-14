import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { OperatingModeProvider } from '@/contexts/operating-mode-context';
import { AuthProvider } from '@/contexts/auth-context';
import { FileOperationsProvider } from '@/contexts/file-operations-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { setupGlobalErrorHandling } from '@/lib/error-handler';

export const metadata: Metadata = {
  title: 'DriveMind',
  description: 'Intelligent Google Drive Management',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(${setupGlobalErrorHandling.toString()})()`
          }}
        />
        <ErrorBoundary>
          <AuthProvider>
            <FileOperationsProvider>
              <OperatingModeProvider>
                {children}
                <Toaster />
              </OperatingModeProvider>
            </FileOperationsProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

    