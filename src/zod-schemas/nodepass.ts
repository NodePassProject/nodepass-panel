
import { z } from 'zod';

export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["server", "client"], {
    required_error: "实例类型是必需的。",
  }),
  tunnelAddress: z.string().min(1, "隧道地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "隧道地址格式无效 (例如: host:port 或 [ipv6]:port)"),
  targetAddress: z.string().min(1, "目标地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "目标地址格式无效 (例如: host:port 或 [ipv6]:port)"),
  logLevel: z.enum(["debug", "info", "warn", "error", "fatal"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.optional(z.enum(["0", "1", "2"])),
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
}).refine(data => {
  if (data.instanceType === "server" && !data.tlsMode) {
    return false;
  }
  return true;
}, {
  message: "服务器实例必须选择 TLS 模式。",
  path: ["tlsMode"],
}).refine(data => {
  if (data.instanceType === "server" && data.tlsMode === "2" && (!data.certPath || data.certPath.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "选择 TLS 模式 '2' 时，证书路径是必需的。",
  path: ["certPath"],
}).refine(data => {
  if (data.instanceType === "server" && data.tlsMode === "2" && (!data.keyPath || data.keyPath.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "选择 TLS 模式 '2' 时，密钥路径是必需的。",
  path: ["keyPath"],
});

// This schema is for the API request, which still expects a single URL
export const createInstanceApiSchema = z.object({
  url: z.string().min(1, "URL is required.").url("无效的 URL 格式。例如: scheme://host:port/host:port"),
});


export const modifyInstanceConfigSchema = z.object({
  url: z.string().min(1, "URL 是必需的。").url("无效的 URL 格式。例如: scheme://host:port/host:port"),
});

export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

// optimizeInstanceSchema is removed as the feature is deleted.
// export const optimizeInstanceSchema = z.object({
//   instanceType: z.enum(["client", "server"], { required_error: "Instance type is required." }),
//   performanceCharacteristics: z.string().min(3, "Performance characteristics are required."),
// });

