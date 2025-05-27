
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
    // Allow connections without a token for flexibility, but log it.
    // The target server will ultimately decide if this is permissible.
    console.warn('Proxy: API token is missing in the request to the proxy. Proceeding without X-API-Key.');
  }

  try {
    // Log the attempt, masking the token for security if it exists
    console.log(`Proxy: Attempting to connect to target event stream. URL: ${targetUrl}, Token: ${token ? 'Present (masked)' : 'Not Present'}`);

    const headers: HeadersInit = {
      'Accept': 'text/event-stream',
      'Connection': 'keep-alive', // Explicitly set keep-alive
    };
    if (token) {
      headers['X-API-Key'] = token;
    }

    const response = await fetch(targetUrl, {
      method: 'GET', // Explicitly GET, though it's default for fetch
      headers: headers,
      // signal: request.signal, // Consider if client disconnect propagation is needed and how to handle it robustly
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Proxy: Error from target event stream. Status: ${response.status}, URL: ${targetUrl}, Body: ${errorText}`);
      return new Response(errorText || `Error fetching event stream: ${response.status}`, { status: response.status });
    }

    if (!response.body) {
      console.error(`Proxy: ReadableStream not available from target. URL: ${targetUrl}`);
      return new Response('ReadableStream not available from target', { status: 500 });
    }
    
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        function push() {
          reader.read().then(({ done, value }) => {
            if (done) {
              console.log('Proxy: Target stream closed. URL:', targetUrl);
              controller.close();
              return;
            }
            const chunk = decoder.decode(value, { stream: true });
            // console.log('Proxy: received chunk from target:', chunk); // Potentially very verbose
            controller.enqueue(new TextEncoder().encode(chunk));
            push();
          }).catch(error => {
            console.error('Proxy: Error reading from target stream. URL:', targetUrl, 'Error:', error);
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
    console.error('Proxy: Unexpected error in event proxy. URL:', targetUrl, 'Error:', error);
    return new Response(`Error in event proxy: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
  }
}
