
"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Info, ServerIcon, SmartphoneIcon, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { InstanceStatusBadge } from '@/components/nodepass/InstanceStatusBadge';

interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

interface ClientInstanceDetails extends InstanceWithApiDetails {
  clientConnectsToServerAddress: string | null; 
  localTargetAddress: string | null;  
}

interface ServerInstanceDetails extends InstanceWithApiDetails {
  serverListeningAddress: string | null; 
  serverForwardsToAddress: string | null;
  connectedClients: ClientInstanceDetails[];
}

function parseTunnelAddr(urlString: string): string | null {
  try {
    // Try parsing as a full URL first (e.g., scheme://host:port/...)
    const url = new URL(urlString); 
    return url.host; // This gives 'host:port' or just 'host' if no port
  } catch (e) {
    // If not a full URL, try to parse as scheme://addr/...
    const schemeSeparator = "://";
    const schemeIndex = urlString.indexOf(schemeSeparator);
    if (schemeIndex === -1) return null; // No scheme found

    // Get the part after '://'
    const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
    
    // Find the end of the tunnel_addr (before '/' or '?')
    const pathSeparatorIndex = restOfString.indexOf('/');
    const querySeparatorIndex = restOfString.indexOf('?');
    let endOfTunnelAddr = -1;

    if (pathSeparatorIndex !== -1 && querySeparatorIndex !== -1) {
      endOfTunnelAddr = Math.min(pathSeparatorIndex, querySeparatorIndex);
    } else if (pathSeparatorIndex !== -1) {
      endOfTunnelAddr = pathSeparatorIndex;
    } else if (querySeparatorIndex !== -1) {
      endOfTunnelAddr = querySeparatorIndex;
    }
    
    return endOfTunnelAddr !== -1 ? restOfString.substring(0, endOfTunnelAddr) : restOfString;
  }
}

function parseTargetAddr(urlString: string): string | null {
  // scheme://tunnel_addr/target_addr?params
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null;

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null; // No path separator after tunnel_addr

  // target_addr is between the first '/' and the '?'
  const targetAndQuery = restOfString.substring(pathSeparatorIndex + 1);
  const querySeparatorIndex = targetAndQuery.indexOf('?');

  return querySeparatorIndex !== -1 ? targetAndQuery.substring(0, querySeparatorIndex) : targetAndQuery;
}

// Helper function to split host and port, supports IPv6
function splitHostPort(address: string | null): [string | null, string | null] {
  if (!address) return [null, null];
  
  // Check for IPv6 with port: [ipv6_address]:port
  const ipv6WithPortMatch = address.match(/^\[(.+)\]:(\d+)$/);
  if (ipv6WithPortMatch) {
    return [ipv6WithPortMatch[1], ipv6WithPortMatch[2]]; // [host, port]
  }

  // For IPv4 or hostname with port: host:port
  // Find the last colon, which should separate host from port
  const lastColonIndex = address.lastIndexOf(':');
  // If no colon, or if there's a colon but it's part of an IPv6 address without brackets (less common case but good to handle)
  if (lastColonIndex === -1 || address.substring(0, lastColonIndex).includes(':')) { 
    return [address, null]; // Assume it's just a host without a port
  }

  const potentialHost = address.substring(0, lastColonIndex);
  const potentialPort = address.substring(lastColonIndex + 1);

  // Validate if potentialPort is actually a number
  if (potentialPort && !isNaN(parseInt(potentialPort, 10)) && parseInt(potentialPort, 10).toString() === potentialPort) {
     return [potentialHost, potentialPort];
  }
  
  // If not a valid port, assume the whole string is the host
  return [address, null];
}


export default function TopologyPage() {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  
  const [processedServers, setProcessedServers] = useState<ServerInstanceDetails[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const processInstanceData = useCallback((allApiInstances: InstanceWithApiDetails[]) => {
    const serverInstancesRaw = allApiInstances.filter(inst => inst.type === 'server');
    const clientInstancesRaw = allApiInstances.filter(inst => inst.type === 'client');

    const S_Nodes: ServerInstanceDetails[] = serverInstancesRaw.map(serverInst => {
      const serverTunnelAddrFull = parseTunnelAddr(serverInst.url); 
      const [serverHostToMatch, serverPortToMatch] = splitHostPort(serverTunnelAddrFull);
      
      const connectedC: ClientInstanceDetails[] = [];
      clientInstancesRaw.forEach(clientInst => {
        const clientConnectsToServerAddrFull = parseTunnelAddr(clientInst.url); 
        if (!clientConnectsToServerAddrFull) return;

        const [clientHost, clientPort] = splitHostPort(clientConnectsToServerAddrFull);

        // Rule: Client's tunnel_addr connects to Server's tunnel_addr
        if (serverPortToMatch && clientPort && serverPortToMatch === clientPort) {
          const isServerHostWildcard = serverHostToMatch === '0.0.0.0' || serverHostToMatch === '::' || serverHostToMatch === '' || serverHostToMatch === null;
          
          if (isServerHostWildcard || clientHost === serverHostToMatch) {
            connectedC.push({
              ...clientInst,
              clientConnectsToServerAddress: clientConnectsToServerAddrFull,
              localTargetAddress: parseTargetAddr(clientInst.url), 
            });
          }
        }
      });

      return {
        ...serverInst,
        serverListeningAddress: serverTunnelAddrFull, // This is server's own <tunnel_addr>
        serverForwardsToAddress: parseTargetAddr(serverInst.url), // This is server's own <target_addr>
        connectedClients: connectedC,
      };
    });
    
    setProcessedServers(S_Nodes);
    setLastRefreshed(new Date());
  }, []); 


  const fetchDataAndProcess = useCallback(async () => {
    if (isLoadingApiConfig) {
      setIsLoadingData(false); // Ensure loading state is cleared if API config is still loading
      return;
    }
    if (apiConfigsList.length === 0) {
        setIsLoadingData(false);
        setFetchErrors(prev => new Map(prev).set("global", "无 API 连接，请先添加。"));
        setProcessedServers([]);
        return;
    }
    
    setIsLoadingData(true);
    setFetchErrors(new Map()); // Clear previous errors
    
    let combinedInstances: InstanceWithApiDetails[] = [];
    let currentErrors = new Map<string, string>();

    for (const config of apiConfigsList) {
      const apiRoot = getApiRootUrl(config.id); 
      const token = getToken(config.id);

      if (!apiRoot || !token) {
        console.warn(`Topology: API config "${config.name}" (ID: ${config.id}) is invalid or incomplete. Skipping.`);
        currentErrors.set(config.id, `API 配置 “${config.name}” 无效。`);
        continue;
      }

      try {
        console.log(`Topology: Fetching instances from API "${config.name}" (ID: ${config.id}, URL: ${apiRoot})`);
        const data = await nodePassApi.getInstances(apiRoot, token);
        combinedInstances.push(...data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name })));
      } catch (err: any) {
        console.error(`Topology: Error loading instances from API "${config.name}" (ID: ${config.id}):`, err);
        currentErrors.set(config.id, `加载 “${config.name}” 实例失败: ${err.message || '未知错误'}`);
      }
    }
    
    setFetchErrors(currentErrors);
    processInstanceData(combinedInstances);
    setIsLoadingData(false); // Data processing finished
  }, [apiConfigsList, isLoadingApiConfig, getApiRootUrl, getToken, processInstanceData]);

  useEffect(() => {
    fetchDataAndProcess();
  }, [fetchDataAndProcess]);


  if (isLoadingApiConfig) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center h-[calc(100vh-10rem-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">加载 API 配置中...</p>
        </div>
      </AppLayout>
    );
  }
  
  const globalError = fetchErrors.get("global");
  if (globalError && !isLoadingData) { // Only show global error if not loading
     return (
      <AppLayout>
        <div className="text-center">
          <Card className="max-w-md mx-auto shadow-lg">
            <CardHeader><CardTitle className="text-destructive flex items-center justify-center"><AlertTriangle className="h-6 w-6 mr-2" />错误</CardTitle></CardHeader>
            <CardContent><p>{globalError}</p><Button onClick={() => router.push('/connections')} className="mt-6">前往连接管理</Button></CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <TooltipProvider delayDuration={300}>
        <>
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-center sm:text-left">连接拓扑 (服务器为中心)</h1>
            <div className="flex items-center gap-2">
              {lastRefreshed && <span className="text-xs text-muted-foreground">刷新于: {lastRefreshed.toLocaleTimeString()}</span>}
              <Button variant="outline" onClick={fetchDataAndProcess} disabled={isLoadingData} size="sm">
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                {isLoadingData ? '刷新中...' : '刷新'}
              </Button>
            </div>
          </div>
          
          {fetchErrors.size > 0 && !globalError && (
            <div className="mb-4 space-y-2">
              {Array.from(fetchErrors.entries()).map(([apiId, errorMsg]) => (
                apiId !== "global" && (
                  <Card key={apiId} className="bg-destructive/10 border-destructive/30 shadow-md">
                    <CardContent className="p-3 text-sm text-destructive flex items-start">
                      <AlertTriangle className="h-5 w-5 mr-2.5 shrink-0 mt-0.5" /> 
                      <div>
                        <p className="font-semibold">加载错误 (API: {apiConfigsList.find(c=>c.id===apiId)?.name || apiId})</p>
                        <p>{errorMsg}</p>
                      </div>
                    </CardContent>
                  </Card>
                )
              ))}
            </div>
          )}

          {isLoadingData && !isLoadingApiConfig && ( // Show loading spinner if data is being fetched
            <div className="flex justify-center items-center flex-grow py-10">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg">加载拓扑数据中...</p>
            </div>
          )}

          {!isLoadingData && processedServers.length === 0 && ( // Show no data message if not loading and no servers
            <Card className="text-center py-10 shadow-lg flex-grow flex flex-col justify-center items-center bg-card">
              <CardHeader><CardTitle>无服务器实例数据</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {apiConfigsList.length > 0 ? "无服务器实例或无客户端连接。" : "请先配置 API 连接。"}
                </p>
                {fetchErrors.size > 0 && <p className="text-muted-foreground mt-2">部分 API 加载失败可能影响结果。</p>}
              </CardContent>
            </Card>
          )}
          
          {!isLoadingData && processedServers.length > 0 && (
            <Accordion type="multiple" className="w-full space-y-4">
              {processedServers.map((server) => (
                <AccordionItem key={server.id} value={server.id} className="bg-card border border-border rounded-lg shadow-md hover:shadow-lg transition-shadow">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline group">
                    <div className="flex items-center gap-3 w-full">
                      <ServerIcon className="h-6 w-6 text-primary shrink-0" />
                      <div className="flex-grow text-left">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <h3 className="font-semibold text-lg truncate group-hover:underline" title={`来源 API: ${server.apiName}\n服务器实例 ID: ${server.id}\nURL: ${server.url}`}>
                              {server.apiName} 
                            </h3>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-md break-all">
                            <p>来源 API: {server.apiName}</p>
                            <p>服务器实例 ID: {server.id}</p>
                            <p>URL: {server.url}</p>
                          </TooltipContent>
                        </Tooltip>
                        <div className="text-xs text-muted-foreground"> {/* Changed P to DIV here */}
                          ID: {server.id.substring(0,12)}... | 监听: <span className="font-mono">{server.serverListeningAddress || 'N/A'}</span> | 状态: <InstanceStatusBadge status={server.status} />
                        </div>
                         <p className="text-xs text-muted-foreground">
                           转发至: <span className="font-mono">{server.serverForwardsToAddress || 'N/A'}</span>
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 pt-2 border-t border-border/50">
                    {server.connectedClients.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-2">此服务器实例当前没有连接的客户端。</p>
                    ) : (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-1">已连接客户端 ({server.connectedClients.length}):</h4>
                        {server.connectedClients.map((client) => (
                          <Card key={client.id} className="bg-background/50 p-3 shadow-sm border">
                            <div className="flex items-start gap-2">
                              <SmartphoneIcon className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                              <div className="flex-grow">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div 
                                      className="font-medium text-sm truncate" 
                                      title={`来源 API: ${client.apiName}\n客户端 ID: ${client.id}\nURL: ${client.url}`}
                                    >
                                      客户端: {client.apiName} <span className="text-muted-foreground text-xs">(ID: {client.id.substring(0,8)}...)</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-md break-all">
                                    <p>来源 API: {client.apiName}</p>
                                    <p>客户端 ID: {client.id}</p>
                                    <p>URL: {client.url}</p>
                                  </TooltipContent>
                                </Tooltip>
                                <p className="text-xs text-muted-foreground">
                                  连接至: <span className="font-mono">{client.clientConnectsToServerAddress || 'N/A'}</span> (<InstanceStatusBadge status={client.status} />)
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 pl-6 border-l-2 border-dashed border-muted-foreground/30 ml-[7px]">
                              <p className="text-xs text-foreground flex items-center">
                                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5 text-green-600 dark:text-green-400 shrink-0"/>
                                  本地目标: <span className="font-semibold font-mono text-green-600 dark:text-green-400 ml-1">{client.localTargetAddress || 'N/A'}</span>
                              </p>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
          
          <div className="mt-8 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground shadow-sm">
            <div className="flex items-center font-semibold mb-2"><Info className="h-4 w-4 mr-2 text-primary shrink-0" />拓扑说明</div>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>此视图聚合所有 API 源的服务器实例。</li>
              <li>展开服务器可查看其连接的客户端。</li>
              <li>连接匹配: 客户端 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> 与服务器 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (端口匹配; 主机匹配或服务器通配符)。</li>
              <li>客户端“本地目标”由其 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code> 解析。</li>
            </ul>
          </div>
        </>
      </TooltipProvider>
    </AppLayout>
  );
}
    
