
// This proxy route is no longer used as per user request to connect directly to SSE.
// Keeping the file commented out in case it's needed again in the future.
/*
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
  // Token is crucial for the actual API, let's be stricter here.
  // If the proxy is called without a token, it can't authenticate to the upstream.
  if (!token) {
     console.error('Proxy: API token (X-API-Key) is missing in the request to the proxy. Cannot authenticate to upstream.');
     return new Response('API token is missing in proxy request. Cannot authenticate to upstream.', {
        status: 400,
        headers: { 'Content-Type': 'text/plain'}
     });
  }

  try {
    console.log(`Proxy: Attempting to connect to target event stream. URL: ${targetUrl}, Token: Present (masked)`);

    const headers: HeadersInit = {
      'Accept': 'text/event-stream',
      'Connection': 'keep-alive', 
      'X-API-Key': token, // Add the token here
    };

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: headers,
      // Server-to-server requests don't have the same CORS restrictions as browsers.
      // `keepalive` is more for navigator.sendBeacon contexts, not strictly necessary here but 'Connection: keep-alive' header is common.
    });

    if (!response.ok) {
      let errorResponseMessage = `Upstream target error: ${response.status} ${response.statusText}`;
      try {
        const bodyText = await response.text();
        if (bodyText && bodyText.trim().length > 0) {
            errorResponseMessage = bodyText; 
        }
      } catch (e) {
        console.warn(`Proxy: Could not read error body as text when target responded with ${response.status}. Upstream status: ${response.statusText}. Error reading body: ${e instanceof Error ? e.message : String(e)}`);
      }
      console.error(`Proxy: Error from target event stream. Status: ${response.status}, URL: ${targetUrl}, Response Body/Message: "${errorResponseMessage}"`);
      return new Response(errorResponseMessage, { 
        status: response.status, 
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
            // console.log('Proxy: Received chunk:', chunk); // For debugging SSE data
            controller.enqueue(new TextEncoder().encode(chunk));
            push();
          }).catch(error => {
            console.error('Proxy: Error reading from target stream during push(). URL:', targetUrl, 'Error:', error);
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
    console.error('Proxy: Unexpected error in event proxy handler. URL (target):', targetUrl, 'Error:', error);
    return new Response(`Error in event proxy: ${error instanceof Error ? error.message : 'Unknown server error'}`, { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }  
    });
  }
}
*/
export {}; // Add an empty export to make it a module if all content is commented out
