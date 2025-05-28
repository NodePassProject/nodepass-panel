
export interface Instance {
  id: string;
  type: "client" | "server";
  status: "running" | "stopped" | "error";
  url: string;
  tcprx: number;
  tcptx: number;
  udprx: number;
  udptx: number;
}

export interface CreateInstanceRequest {
  url: string;
}

export interface UpdateInstanceRequest {
  action: "start" | "stop" | "restart";
}

export interface ModifyInstanceConfigRequest {
  url: string;
}

// Add instanceDetails to InstanceEvent for structured data
export interface InstanceEvent {
  type: 'instance_created' | 'instance_updated' | 'instance_deleted' | 'log';
  data: any; // Could be more specific based on event type, e.g. string for logs, Partial<Instance> for others
  instanceDetails?: Instance; // Store the full instance object for created/updated/deleted events
  timestamp: string;
}

    