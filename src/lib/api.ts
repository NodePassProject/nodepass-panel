
import type { Instance, CreateInstanceRequest, UpdateInstanceRequest, ModifyInstanceConfigRequest } from '@/types/nodepass';

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
      // If response is not JSON, use statusText
      errorBody = { message: response.statusText };
    }
    const error = new Error(`API 错误: ${response.status} ${errorBody?.message || response.statusText}`);
    (error as any).status = response.status; // Attach status for further handling if needed
    (error as any).body = errorBody; // Attach body for further handling
    throw error;
  }

  if (response.status === 204) { // No Content
    return null as T; // Or handle as appropriate for void responses
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
  
  // Updated to use PATCH as per documentation
  updateInstance: (id: string, data: UpdateInstanceRequest, apiRootUrl: string, token: string) =>
    request<Instance>(`${apiRootUrl}/v1/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),

  modifyInstanceConfig: (id: string, data: ModifyInstanceConfigRequest, apiRootUrl: string, token: string) =>
    request<Instance>(`${apiRootUrl}/v1/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  
  deleteInstance: (id: string, apiRootUrl: string, token: string) =>
    request<void>(`${apiRootUrl}/v1/instances/${id}`, { method: 'DELETE' }, token),
};

// This function provides the URL for the event stream.
// For direct EventSource connection, it returns the raw API endpoint.
// For proxy connection, the proxy itself will use this to know where to connect.
export const getEventsUrl = (apiRootUrl: string): string => {
  if (!apiRootUrl) throw new Error("apiRootUrl is required to get events URL");
  // Ensure it uses /v1/events as per documentation
  return `${apiRootUrl}/v1/events`; 
};
