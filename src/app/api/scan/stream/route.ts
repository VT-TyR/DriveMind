/**
 * @fileoverview Server-Sent Events endpoint for real-time scan progress
 * Streams live updates from Firestore to connected clients
 */

import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/admin';
import { logger } from '@/lib/logger';

// SSE headers for streaming response
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no', // Disable Nginx buffering
};

interface ScanProgressEvent {
  type: 'progress' | 'status' | 'complete' | 'error' | 'heartbeat';
  jobId: string;
  data: {
    status?: string;
    progress?: {
      current: number;
      total: number;
      percentage: number;
      currentStep: string;
      bytesProcessed?: number;
      filesProcessed?: number;
      estimatedTimeRemaining?: number;
    };
    results?: any;
    error?: string;
    timestamp: number;
  };
}

/**
 * Formats SSE message
 */
function formatSSE(event: ScanProgressEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${Date.now()}\n\n`;
}

/**
 * Sends heartbeat to keep connection alive
 */
function sendHeartbeat(): string {
  return formatSSE({
    type: 'heartbeat',
    jobId: 'system',
    data: {
      timestamp: Date.now(),
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return new Response('Unauthorized', { status: 401 });
    }

    const auth = getAdminAuth();
    if (!auth) {
      return new Response('Service unavailable', { status: 503 });
    }

    let uid: string;
    try {
      const decodedToken = await auth.verifyIdToken(token);
      uid = decodedToken.uid;
    } catch (error) {
      logger.error('SSE auth failed', { error });
      return new Response('Invalid token', { status: 401 });
    }

    // Get job ID from query params
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return new Response('Missing jobId parameter', { status: 400 });
    }

    const db = getAdminFirestore();
    if (!db) {
      return new Response('Service unavailable', { status: 503 });
    }
    
    // Verify job belongs to user
    const jobDoc = await db.collection('scanJobs').doc(jobId).get();
    if (!jobDoc.exists || jobDoc.data()?.uid !== uid) {
      return new Response('Job not found', { status: 404 });
    }

    logger.info('SSE stream started', { uid, jobId });

    // Create readable stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let unsubscribe: (() => void) | null = null;
        let heartbeatInterval: NodeJS.Timeout | null = null;

        try {
          // Send initial connection event
          controller.enqueue(
            encoder.encode(
              formatSSE({
                type: 'status',
                jobId,
                data: {
                  status: 'connected',
                  timestamp: Date.now(),
                },
              })
            )
          );

          // Set up Firestore listener for real-time updates
          unsubscribe = db!
            .collection('scanJobs')
            .doc(jobId)
            .onSnapshot(
              (snapshot) => {
                if (!snapshot.exists) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE({
                        type: 'error',
                        jobId,
                        data: {
                          error: 'Job deleted',
                          timestamp: Date.now(),
                        },
                      })
                    )
                  );
                  controller.close();
                  return;
                }

                const data = snapshot.data();
                if (!data) return;

                // Send progress update
                if (data.progress) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE({
                        type: 'progress',
                        jobId,
                        data: {
                          status: data.status,
                          progress: data.progress,
                          timestamp: Date.now(),
                        },
                      })
                    )
                  );
                }

                // Send completion event
                if (data.status === 'completed') {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE({
                        type: 'complete',
                        jobId,
                        data: {
                          status: 'completed',
                          results: data.results,
                          timestamp: Date.now(),
                        },
                      })
                    )
                  );
                  
                  // Close stream after completion
                  setTimeout(() => {
                    controller.close();
                  }, 1000);
                }

                // Send error event
                if (data.status === 'failed') {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE({
                        type: 'error',
                        jobId,
                        data: {
                          status: 'failed',
                          error: data.error || 'Scan failed',
                          timestamp: Date.now(),
                        },
                      })
                    )
                  );
                  
                  // Close stream after error
                  setTimeout(() => {
                    controller.close();
                  }, 1000);
                }

                // Handle chained jobs
                if (data.status === 'chained' && data.chainedToJobId) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE({
                        type: 'status',
                        jobId,
                        data: {
                          status: 'chained',
                          timestamp: Date.now(),
                        },
                      })
                    )
                  );
                  
                  // Switch to monitoring chained job
                  if (unsubscribe) {
                    unsubscribe();
                  }
                  
                  // Start listening to chained job
                  unsubscribe = db!
                    .collection('scanJobs')
                    .doc(data.chainedToJobId)
                    .onSnapshot((chainedSnapshot) => {
                      // Handle chained job updates (recursive)
                      if (!chainedSnapshot.exists) return;
                      
                      const chainedData = chainedSnapshot.data();
                      if (!chainedData) return;
                      
                      controller.enqueue(
                        encoder.encode(
                          formatSSE({
                            type: 'progress',
                            jobId: data.chainedToJobId,
                            data: {
                              status: chainedData.status,
                              progress: chainedData.progress,
                              timestamp: Date.now(),
                            },
                          })
                        )
                      );
                    });
                }
              },
              (error) => {
                logger.error('Firestore listener error', { jobId, error });
                controller.enqueue(
                  encoder.encode(
                    formatSSE({
                      type: 'error',
                      jobId,
                      data: {
                        error: 'Stream error',
                        timestamp: Date.now(),
                      },
                    })
                  )
                );
                controller.close();
              }
            );

          // Set up heartbeat to keep connection alive
          heartbeatInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(sendHeartbeat()));
            } catch (error) {
              // Client disconnected
              if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
              }
            }
          }, 30000); // Every 30 seconds

          // Handle client disconnect
          request.signal.addEventListener('abort', () => {
            logger.info('SSE client disconnected', { uid, jobId });
            if (unsubscribe) {
              unsubscribe();
            }
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
            }
            controller.close();
          });

        } catch (error) {
          logger.error('SSE stream error', { uid, jobId, error });
          controller.enqueue(
            encoder.encode(
              formatSSE({
                type: 'error',
                jobId,
                data: {
                  error: 'Internal server error',
                  timestamp: Date.now(),
                },
              })
            )
          );
          
          if (unsubscribe) {
            unsubscribe();
          }
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: SSE_HEADERS,
    });

  } catch (error) {
    logger.error('SSE endpoint error', { error });
    return new Response('Internal server error', { status: 500 });
  }
}