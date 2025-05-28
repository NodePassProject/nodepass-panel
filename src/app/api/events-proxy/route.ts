
import { type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetUrl = searchParams.get('targetUrl');
  const token = searchParams.get('token');

  if (!targetUrl) {
    console.error('Proxy: Missing targetUrl query parameter');
    return new Response('代理错误: 缺少 targetUrl 查询参数', { 
      status: 400, 
      headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
    });
  }
  
  if (!token) {
     console.error('Proxy: API token (X-API-Key) is missing in the request to the proxy. Cannot authenticate to upstream.');
     return new Response('代理错误: API 令牌丢失，无法向上游服务器认证。', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
     });
  }

  try {
    console.log(`代理: 尝试连接目标事件流。URL: ${targetUrl}, Token: Present (masked)`);

    const headers: HeadersInit = {
      'Accept': 'text/event-stream',
      'Connection': 'keep-alive', 
      'X-API-Key': token,
    };

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: headers,
      // Disable caching for event streams
      cache: 'no-store',
    });

    if (!response.ok) {
      let errorResponseMessage = `上游目标错误: ${response.status} ${response.statusText}`;
      try {
        const bodyText = await response.text();
        // Only use bodyText if it's not overly long or binary-looking, to avoid polluting logs.
        if (bodyText && bodyText.trim().length > 0 && bodyText.length < 512 && !bodyText.includes('\uFFFD')) {
            errorResponseMessage = bodyText; 
        }
      } catch (e) {
        // Non-critical error, upstream status text is primary.
        console.warn(`代理: 尝试读取目标错误响应体失败 (状态: ${response.status}). 上游状态: ${response.statusText}. 读取错误: ${e instanceof Error ? e.message : String(e)}`);
      }
      console.error(`代理: 目标事件流错误。状态: ${response.status}, URL: ${targetUrl}, 响应消息: "${errorResponseMessage}"`);
      return new Response(`代理错误: 目标服务器响应 ${response.status}。消息: ${errorResponseMessage}`, { 
        status: response.status, // Propagate upstream status if appropriate, or use a generic 502/503
        headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
      });
    }

    if (!response.body) {
      console.error(`代理: 目标服务器未返回可读流。URL: ${targetUrl}`);
      return new Response('代理错误: 目标服务器未返回可读流。', { 
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
      });
    }
    
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder(); // Default UTF-8 is fine

        function push() {
          reader.read().then(({ done, value }) => {
            if (done) {
              console.log('代理: 上游目标流已关闭。URL:', targetUrl);
              controller.close();
              return;
            }
            const chunk = decoder.decode(value, { stream: true });
            // console.log('Proxy: Received chunk:', chunk); // For debugging SSE data
            controller.enqueue(new TextEncoder().encode(chunk));
            push();
          }).catch(error => {
            console.error('代理: 从目标流读取错误。URL:', targetUrl, '错误:', error);
            controller.error(error);
          });
        }
        push();

        // Handle client disconnect if possible (Next.js specific context might be needed)
        // For now, upstream closing the connection or errors will terminate the stream.
      },
      cancel(reason) {
        console.log('代理: 客户端取消了流读取。URL:', targetUrl, '原因:', reason);
        // If fetch supports AbortController, you could abort the fetch here.
        // For now, the reader will eventually notice the client disconnected.
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // Optional: X-Accel-Buffering: no (for Nginx environments)
      },
    });

  } catch (error) {
    console.error('代理: 事件代理处理器发生意外错误。目标 URL:', targetUrl, '错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知服务器错误';
    return new Response(`代理错误: ${errorMessage}`, { 
      status: 500, // Internal Server Error for unexpected issues
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }  
    });
  }
}
