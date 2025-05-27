
// src/app/api/events-proxy/route.ts
import { type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetUrl = searchParams.get('targetUrl');
  const token = searchParams.get('token');

  if (!targetUrl) {
    return new Response('Missing targetUrl query parameter', { status: 400 });
  }
  if (!token) {
    return new Response('Missing token query parameter', { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'X-API-Key': token,
        'Accept': 'text/event-stream',
      },
      // Important: AbortSignal can be used to propagate client disconnects
      // signal: request.signal, // This might require more advanced handling for streaming
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error from target event stream: ${response.status} ${errorText}`);
      return new Response(errorText || `Error fetching event stream: ${response.status}`, { status: response.status });
    }

    // Ensure the response body is a ReadableStream
    if (!response.body) {
      return new Response('ReadableStream not available from target', { status: 500 });
    }
    
    // Create a new ReadableStream to pipe the data through
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        function push() {
          reader.read().then(({ done, value }) => {
            if (done) {
              console.log('Proxy: Target stream closed');
              controller.close();
              return;
            }
            const chunk = decoder.decode(value, { stream: true });
            // console.log('Proxy: received chunk from target:', chunk);
            controller.enqueue(new TextEncoder().encode(chunk));
            push();
          }).catch(error => {
            console.error('Proxy: Error reading from target stream:', error);
            controller.error(error);
          });
        }
        push();
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in event proxy:', error);
    return new Response('Error in event proxy.', { status: 500 });
  }
}
