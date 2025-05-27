
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

// This function provides the URL for the event stream.
// It's up to the consumer (e.g., EventSource) to handle connection and authentication.
// Standard EventSource cannot send custom headers like X-API-Key.
export const getEventsUrl = (apiRootUrl: string): string => {
  if (!apiRootUrl) throw new Error("apiRootUrl is required to get events URL");
  return `${apiRootUrl}/v1/events`; // Includes /v1 for the events endpoint
};
