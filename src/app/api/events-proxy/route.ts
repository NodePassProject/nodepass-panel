
// src/app/api/events-proxy/route.ts
import { type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetUrl = searchParams.get('targetUrl');
  const token = searchParams.get('token');

  if (!targetUrl) {
    return new Response('Missing targetUrl query parameter', { 
      status: 400, 
      headers: { 'Content-Type': 'text/plain' } 
    });
  }
  if (!token) {
    // Allow connections without a token for flexibility, but log it.
    // The target server will ultimately decide if this is permissible.
    console.warn('Proxy: API token is missing in the request to the proxy. Proceeding without X-API-Key.');
  }

  try {
    console.log(`Proxy: Attempting to connect to target event stream. URL: ${targetUrl}, Token: ${token ? 'Present (masked)' : 'Not Present'}`);

    const headers: HeadersInit = {
      'Accept': 'text/event-stream',
      'Connection': 'keep-alive', 
    };
    if (token) {
      headers['X-API-Key'] = token;
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: headers,
      // Consider if client disconnect propagation is needed.
      // If using Next.js edge runtime, request.signal might not be directly usable
      // or behave as expected without specific patterns.
      // signal: request.signal 
    });

    if (!response.ok) {
      let errorResponseMessage = `Upstream target error: ${response.status} ${response.statusText}`;
      try {
        const bodyText = await response.text();
        if (bodyText && bodyText.trim().length > 0) {
            errorResponseMessage = bodyText; // Prefer detailed error from upstream if available
        }
      } catch (e) {
        console.warn(`Proxy: Could not read error body as text when target responded with ${response.status}. Upstream status: ${response.statusText}. Error reading body: ${e instanceof Error ? e.message : String(e)}`);
      }
      console.error(`Proxy: Error from target event stream. Status: ${response.status}, URL: ${targetUrl}, Response Body/Message: "${errorResponseMessage}"`);
      return new Response(errorResponseMessage, { 
        status: response.status, // Propagate upstream status
        headers: { 'Content-Type': 'text/plain' } 
      });
    }

    if (!response.body) {
      console.error(`Proxy: ReadableStream not available from target. URL: ${targetUrl}`);
      return new Response('ReadableStream not available from target', { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' } 
      });
    }
    
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        function push() {
          reader.read().then(({ done, value }) => {
            if (done) {
              console.log('Proxy: Target stream closed by upstream. URL:', targetUrl);
              controller.close();
              return;
            }
            const chunk = decoder.decode(value, { stream: true });
            // console.log('Proxy: received chunk from target:', chunk); // Uncomment for verbose chunk logging
            controller.enqueue(new TextEncoder().encode(chunk));
            push();
          }).catch(error => {
            console.error('Proxy: Error reading from target stream during push(). URL:', targetUrl, 'Error:', error);
            controller.error(error); // Signal error to the client EventSource
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
    // This catches errors from the fetch call itself (e.g., network, DNS) or any other unexpected error.
    console.error('Proxy: Unexpected error in event proxy handler. URL (target):', targetUrl, 'Error:', error);
    return new Response(`Error in event proxy: ${error instanceof Error ? error.message : 'Unknown server error'}`, { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }  
    });
  }
}
