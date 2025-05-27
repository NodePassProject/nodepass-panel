
import type { Instance, CreateInstanceRequest, UpdateInstanceRequest } from '@/types/nodepass';

async function request<T>(
  fullRequestUrl: string,
  options: RequestInit = {},
  token: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.append('Content-Type', 'application/json');
  if (token) {
    headers.append('X-API-Key', token);
  }

  const response = await fetch(fullRequestUrl, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch (e) {
      errorBody = { message: response.statusText };
    }
    const error = new Error(`API 错误: ${response.status} ${errorBody?.message || response.statusText}`);
    (error as any).status = response.status;
    (error as any).body = errorBody;
    throw error;
  }

  if (response.status === 204) { // No Content
    return null as T;
  }

  return response.json();
}

export const nodePassApi = {
  getInstances: (apiRootUrl: string, token: string) =>
    request<Instance[]>(`${apiRootUrl}/v1/instances`, {}, token),
  
  createInstance: (data: CreateInstanceRequest, apiRootUrl: string, token: string) =>
    request<Instance>(`${apiRootUrl}/v1/instances`, { method: 'POST', body: JSON.stringify(data) }, token),
  
  getInstance: (id: string, apiRootUrl: string, token: string) =>
    request<Instance>(`${apiRootUrl}/v1/instances/${id}`, {}, token),
  
  updateInstance: (id: string, data: UpdateInstanceRequest, apiRootUrl: string, token: string) =>
    request<Instance>(`${apiRootUrl}/v1/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  
  deleteInstance: (id: string, apiRootUrl: string, token: string) =>
    request<void>(`${apiRootUrl}/v1/instances/${id}`, { method: 'DELETE' }, token),
};

// For EventSource, authentication using custom headers like X-API-Key is not possible.
// The OpenAPI spec indicates /events uses X-API-Key.
// This function provides the base URL for events.
// If the server has an alternative auth method for EventSource (e.g. cookies, or a non-standard query param),
// that would need to be handled by the server.
export const getEventsUrl = (apiRootUrl: string): string => {
  // The token is NOT appended as a query parameter here because:
  // 1. The OpenAPI spec for /events indicates ApiKeyAuth (X-API-Key header).
  // 2. EventSource cannot send custom headers.
  // If the server supports token-based auth via query for /events, it's a non-standard extension.
  return `${apiRootUrl}/events`;
};
