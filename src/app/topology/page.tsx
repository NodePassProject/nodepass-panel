
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Info, ServerIcon, SmartphoneIcon, Network, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

interface ConnectedClient extends InstanceWithApiDetails {
  localTargetAddress: string | null; // "落地node"
}

interface ServerGroup {
  serverInstance: InstanceWithApiDetails;
  connectedClients: ConnectedClient[];
}

// Parses scheme://<tunnel_addr>/...
// For client: server it connects to. For server: address it listens on.
function parseTunnelAddr(urlString: string): string | null {
  try {
    const url = new URL(urlString); // Basic validation and hostname/port extraction
    // The tunnel_addr is essentially the host and port from the URL's main part.
    // If specific parsing beyond host:port is needed, this needs adjustment.
    // Example: client://server.example.com:10101/... -> server.example.com:10101
    // Example: server://0.0.0.0:10101/... -> 0.0.0.0:10101
    return url.host; // This extracts 'hostname:port' or 'hostname' if port is default for scheme
  } catch (e) {
    // Fallback for non-standard URLs or if URL() constructor fails.
    const schemeSeparator = "://";
    const schemeIndex = urlString.indexOf(schemeSeparator);
    if (schemeIndex === -1) return null;

    const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
    
    const pathSeparatorIndex = restOfString.indexOf('/');
    const querySeparatorIndex = restOfString.indexOf('?');

    let endOfTunnelAddr = -1;

    if (pathSeparatorIndex !== -1 && querySeparatorIndex !== -1) {
      endOfTunnelAddr = Math.min(pathSeparatorIndex, querySeparatorIndex);
    } else if (pathSeparatorIndex !== -1) {
      endOfTunnelAddr = pathSeparatorIndex;
    } else if (querySeparatorIndex !== -1) {
      endOfTunnelAddr = querySeparatorIndex;
    } else {
      // No / or ? after tunnel_addr
      return restOfString; // Assumes the whole part is tunnel_addr
    }
    
    return restOfString.substring(0, endOfTunnelAddr);
  }
}

// Parses .../<target_addr>?...
// For client: local forwarding address ("落地node")
function parseLocalTargetAddrForClient(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1 || !urlString.startsWith("client://")) return null;

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null; // target_addr requires a /

  const targetAndQuery = restOfString.substring(pathSeparatorIndex + 1);
  const querySeparatorIndex = targetAndQuery.indexOf('?');

  if (querySeparatorIndex !== -1) {
    return targetAndQuery.substring(0, querySeparatorIndex);
  }
  return targetAndQuery; // The rest is target_addr if no query params
}


export default function TopologyPage() {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  
  const [serverGroups, setServerGroups] = useState<ServerGroup[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const processInstanceData = useCallback((allInstances: InstanceWithApiDetails[]) => {
    const serverInstances = allInstances.filter(inst => inst.type === 'server');
    const clientInstances = allInstances.filter(inst => inst.type === 'client');
    
    const newServerGroups: ServerGroup[] = serverInstances.map(server => {
      const serverTunnelAddr = parseTunnelAddr(server.url);
      const clientsForThisServer: ConnectedClient[] = [];

      if (serverTunnelAddr) {
        clientInstances.forEach(client => {
          const clientTunnelAddr = parseTunnelAddr(client.url);
          if (clientTunnelAddr && clientTunnelAddr === serverTunnelAddr) {
            clientsForThisServer.push({
              ...client,
              localTargetAddress: parseLocalTargetAddrForClient(client.url),
            });
          }
        });
      }
      
      return {
        serverInstance: server,
        connectedClients: clientsForThisServer,
      };
    });

    setServerGroups(newServerGroups);
    setLastRefreshed(new Date());
  }, []);

  const fetchDataAndProcess = useCallback(async () => {
    if (isLoadingApiConfig) return; 
    
    setIsLoadingData(true);
    setFetchErrors(new Map()); 
    
    if (apiConfigsList.length === 0) {
      setFetchErrors(prev => new Map(prev).set("global", "没有配置任何 API 连接。请先添加一个。"));
      setServerGroups([]);
      setIsLoadingData(false);
      return;
    }

    let combinedInstances: InstanceWithApiDetails[] = [];
    let currentErrors = new Map<string, string>();

    for (const config of apiConfigsList) {
      const apiRoot = getApiRootUrl(config.id); 
      const token = getToken(config.id);

      if (!apiRoot) { // Token might be optional for some public APIs, but generally needed
        currentErrors.set(config.id, `API 配置 "${config.name}" (ID: ${config.id}) 的 URL 无效。`);
        continue;
      }
       if (!token) {
        currentErrors.set(config.id, `API 配置 "${config.name}" (ID: ${config.id}) 的 Token 缺失。`);
        continue;
      }


      try {
        const data = await nodePassApi.getInstances(apiRoot, token);
        combinedInstances.push(...data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name })));
      } catch (err: any) {
        console.error(`Topology: Error loading instances from API "${config.name}" (ID: ${config.id}):`, err);
        currentErrors.set(config.id, `从 "${config.name}" 加载实例失败: ${err.message || '未知错误'}`);
      }
    }
    
    setFetchErrors(currentErrors);
    processInstanceData(combinedInstances);
    setIsLoadingData(false); 
  }, [apiConfigsList, isLoadingApiConfig, getApiRootUrl, getToken, processInstanceData]);

  useEffect(() => {
    fetchDataAndProcess();
  }, [fetchDataAndProcess]);


  if (isLoadingApiConfig) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">加载 API 配置中...</p>
      </div>
    );
  }

  const globalError = fetchErrors.get("global");
  if (globalError) {
     return (
      <div className="container mx-auto px-4 py-8 text-center">
        <Card className="max-w-md mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 mr-2" />
              错误
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{globalError}</p>
            <Button onClick={() => router.push('/connections')} className="mt-6">
              前往连接管理
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-center sm:text-left">实例连接拓扑 (服务中心视图)</h1>
        <div className="flex items-center gap-2">
            {lastRefreshed && (
                <span className="text-xs text-muted-foreground">
                    上次刷新: {lastRefreshed.toLocaleTimeString()}
                </span>
            )}
            <Button variant="outline" onClick={fetchDataAndProcess} disabled={isLoadingData}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
            {isLoadingData ? '刷新中...' : '刷新数据'}
            </Button>
        </div>
      </div>
      
      {fetchErrors.size > 0 && !globalError && (
        <div className="mb-4 space-y-2">
          {Array.from(fetchErrors.entries()).map(([apiId, errorMsg]) => (
            apiId !== "global" && (
              <div key={apiId} className="text-destructive-foreground bg-destructive p-3 rounded-md text-sm flex items-center shadow">
                <AlertTriangle className="h-5 w-5 mr-2 shrink-0" />
                {errorMsg}
              </div>
            )
          ))}
        </div>
      )}

      {isLoadingData && !isLoadingApiConfig && (
         <div className="flex justify-center items-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg">加载拓扑数据中...</p>
        </div>
      )}

      {!isLoadingData && serverGroups.length === 0 && (
        <Card className="text-center py-10 shadow-lg">
          <CardHeader>
            <CardTitle>无服务实例</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {apiConfigsList.length > 0 ? "未找到服务类型的实例，或所有API均无服务实例。" : "请先配置API连接。"}
            </p>
            {fetchErrors.size > 0 && <p className="text-muted-foreground mt-2">部分API配置加载失败，可能影响结果。</p>}
          </CardContent>
        </Card>
      )}

      {!isLoadingData && serverGroups.length > 0 && (
        <Accordion type="multiple" className="w-full space-y-4">
          {serverGroups.map(({ serverInstance, connectedClients }) => (
            <AccordionItem key={serverInstance.id} value={serverInstance.id} className="border bg-card shadow-md rounded-lg hover:shadow-lg transition-shadow">
              <AccordionTrigger className="p-4 hover:no-underline">
                <div className="flex items-center gap-3 w-full">
                  <ServerIcon className="h-6 w-6 text-primary shrink-0" />
                  <div className="flex-grow text-left">
                    <div className="font-semibold text-base flex items-center">
                      服务实例: <span className="ml-1 font-mono text-primary-foreground bg-primary/80 px-1.5 py-0.5 rounded text-xs">{serverInstance.id.substring(0,8)}...</span>
                      <Badge variant="outline" className="ml-2 text-xs">{serverInstance.apiName}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground break-all font-mono mt-1" title={serverInstance.url}>
                      URL: {serverInstance.url.length > 70 ? serverInstance.url.substring(0, 67) + "..." : serverInstance.url}
                    </p>
                     <p className="text-xs text-muted-foreground mt-1">
                      监听地址 (Tunnel Addr): <span className="font-mono">{parseTunnelAddr(serverInstance.url) || "N/A"}</span>
                    </p>
                  </div>
                  <Badge variant={connectedClients.length > 0 ? "default" : "secondary"} className="shrink-0">
                    {connectedClients.length} 客户端连接
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4 border-t">
                {connectedClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">此服务实例当前没有连接的客户端。</p>
                ) : (
                  <ScrollArea className="max-h-96">
                  <div className="space-y-3 pr-2">
                    {connectedClients.map(client => (
                      <Card key={client.id} className="p-3 bg-background shadow-inner">
                        <div className="flex items-start gap-3">
                           <SmartphoneIcon className="h-5 w-5 text-accent mt-0.5 shrink-0"/>
                           <div className="flex-grow">
                                <div className="font-medium text-sm flex items-center">
                                  客户端: <span className="ml-1 font-mono text-accent-foreground bg-accent/80 px-1.5 py-0.5 rounded text-xs">{client.id.substring(0,8)}...</span>
                                  <Badge variant="outline" className="ml-2 text-xs scale-90">{client.apiName}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground break-all font-mono mt-0.5" title={client.url}>
                                  URL: {client.url.length > 60 ? client.url.substring(0, 57) + "..." : client.url}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  连接到服务器: <span className="font-mono">{parseTunnelAddr(client.url) || "N/A"}</span>
                                </p>
                                <p className="text-xs text-foreground font-semibold mt-1">
                                  本地转发 ("落地Node"): <span className="font-mono text-green-600 dark:text-green-400">{client.localTargetAddress || "N/A"}</span>
                                </p>
                           </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                  </ScrollArea>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      
      <div className="mt-8 p-4 bg-muted/50 rounded-lg text-xs text-muted-foreground shadow">
        <div className="flex items-center font-semibold mb-2">
            <Info className="h-4 w-4 mr-2 text-primary shrink-0" />
            拓扑说明
        </div>
        <ul className="list-disc list-inside space-y-1">
            <li>此视图显示所有已配置API源中的 **服务 (Server)** 类型实例。</li>
            <li>展开每个服务实例，可以查看连接到该服务的 **客户端 (Client)** 实例。</li>
            <li>客户端的“本地转发 (落地Node)”地址是从其URL的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code> 部分解析的。</li>
            <li>客户端通过其URL中的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (连接目标) 与服务器的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (监听地址) 匹配来建立连接。</li>
        </ul>
      </div>
    </div>
  );
}

