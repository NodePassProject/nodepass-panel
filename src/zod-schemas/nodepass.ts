
import { z } from 'zod';

export const createInstanceSchema = z.object({
  url: z.string().min(1, "URL is required.").url("无效的 URL 格式。例如: scheme://host:port/host:port"),
  // Example: server://0.0.0.0:8080/example.com:80?tls=0
  // A more specific regex could be used if the format is very strict.
  // For now, z.url() provides basic URL validation.
});

export const modifyInstanceConfigSchema = z.object({
  url: z.string().min(1, "URL 是必需的。").url("无效的 URL 格式。例如: scheme://host:port/host:port"),
});

export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

export const optimizeInstanceSchema = z.object({
  instanceType: z.enum(["client", "server"], { required_error: "Instance type is required." }),
  performanceCharacteristics: z.string().min(3, "Performance characteristics are required."),
});

export const batchCreateInstancesSchema = z.object({
  urls: z.string().min(1, "至少需要一个 URL。"),
});

