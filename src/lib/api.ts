
import type { Instance, CreateInstanceRequest, UpdateInstanceRequest } from '@/types/nodepass';

const API_BASE_URL = '/api/v1'; // Default, can be made configurable

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  apiKey: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.append('Content-Type', 'application/json');
  if (apiKey) {
    headers.append('X-API-Key', apiKey);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
    const error = new Error(`API Error: ${response.status} ${errorBody?.message || response.statusText}`);
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
  getInstances: (apiKey: string) => request<Instance[]>('/instances', {}, apiKey),
  createInstance: (data: CreateInstanceRequest, apiKey: string) =>
    request<Instance>('/instances', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  getInstance: (id: string, apiKey: string) => request<Instance>(`/instances/${id}`, {}, apiKey),
  updateInstance: (id: string, data: UpdateInstanceRequest, apiKey: string) =>
    request<Instance>(`/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, apiKey),
  deleteInstance: (id: string, apiKey: string) =>
    request<void>(`/instances/${id}`, { method: 'DELETE' }, apiKey),
};

// Note: SSE /events endpoint requires special handling for authentication if X-API-Key header is strictly required.
// Standard EventSource does not support custom headers. A workaround (e.g., API key via query param) would be needed.
// For now, SSE functionality will be simulated or handled with this limitation in mind.

export const getApiBaseUrl = () => API_BASE_URL;
