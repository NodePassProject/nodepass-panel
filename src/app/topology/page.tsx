
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Info, ServerIcon, SmartphoneIcon, NetworkIcon, ArrowRightLeft, ChevronDownSquare, ChevronRightSquare, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';

interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

interface ClientInstanceDetails extends InstanceWithApiDetails {
  clientTunnelAddress: string | null; // What server the client connects to
  localTargetAddress: string | null;  // "落地node"
}

interface ServerInstanceDetails extends InstanceWithApiDetails {
  listeningTunnelAddress: string | null; // Address server listens on for control channel
  connectedClients: ClientInstanceDetails[];
}

// Parses scheme://<tunnel_addr>/...
// For client: server it connects to. For server: address it listens on for control.
function parseTunnelAddr(urlString: string): string | null {
  try {
    const url = new URL(urlString); // Handles full URLs if valid
    return url.host; // Extracts 'hostname:port' or 'hostname'
  } catch (e) {
    // Fallback for scheme-only strings like "server://0.0.0.0:1234" or "client://host:port/..."
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
      return restOfString; // No / or ?, the rest is the tunnel_addr
    }
    
    return restOfString.substring(0, endOfTunnelAddr);
  }
}

// Parses .../<target_addr>?...
// For client: local forwarding address ("落地node")
// For server: target address for traffic forwarding (not used for client connection logic)
function parseTargetAddr(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null;

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null; 

  const targetAndQuery = restOfString.substring(pathSeparatorIndex + 1);
  const querySeparatorIndex = targetAndQuery.indexOf('?');

  if (querySeparatorIndex !== -1) {
    return targetAndQuery.substring(0, querySeparatorIndex);
  }
  return targetAndQuery; // If no query string, the whole part is the target_addr
}

function splitHostPort(address: string | null): [string | null, string | null] {
  if (!address) return [null, null];
  
  const ipv6WithPortMatch = address.match(/^\[(.+)\]:(\d+)$/); // Matches [IPv6]:port
  if (ipv6WithPortMatch && ipv6WithPortMatch[1] && ipv6WithPortMatch[2]) {
    return [ipv6WithPortMatch[1], ipv6WithPortMatch[2]];
  }

  const parts = address.split(':');
  if (parts.length > 1) {
    const port = parts.pop();
    const host = parts.join(':');
    // Check if port is a valid number. If host was an IPv6 without brackets, it might be split incorrectly.
    // This simple split is fine for IPv4:port and hostname:port.
    if (port && !isNaN(parseInt(port, 10))) {
       return [host, port];
    }
  }
  return [address, null]; // No port found or invalid format for simple split
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
      const serverListeningTunnelAddress = parseTunnelAddr(serverInst.url);
      const [serverHost, serverPort] = splitHostPort(serverListeningTunnelAddress);
      
      const connectedC: ClientInstanceDetails[] = [];
      clientInstancesRaw.forEach(clientInst => {
        const clientConnectsToTunnelAddress = parseTunnelAddr(clientInst.url);
        if (!clientConnectsToTunnelAddress) return;

        const [clientTargetHost, clientTargetPort] = splitHostPort(clientConnectsToTunnelAddress);

        if (clientTargetPort === serverPort) { // Ports must match
          const isServerHostWildcard = serverHost === '0.0.0.0' || serverHost === '::' || serverHost === '';
          if (isServerHostWildcard || clientTargetHost === serverHost) {
            connectedC.push({
              ...clientInst,
              clientTunnelAddress: clientConnectsToTunnelAddress,
              localTargetAddress: parseTargetAddr(clientInst.url),
            });
          }
        }
      });

      return {
        ...serverInst,
        listeningTunnelAddress: serverListeningTunnelAddress,
        connectedClients: connectedC,
      };
    });
    
    setProcessedServers(S_Nodes);
    setLastRefreshed(new Date());
  }, []);

  const fetchDataAndProcess = useCallback(async () => {
    if (isLoadingApiConfig) {
      setIsLoadingData(false);
      return;
    }
    if (apiConfigsList.length === 0) {
        setIsLoadingData(false);
        setFetchErrors(prev => new Map(prev).set("global", "没有配置任何 API 连接。请先添加一个。"));
        setProcessedServers([]);
        return;
    }
    
    setIsLoadingData(true);
    setFetchErrors(new Map()); 
    
    let combinedInstances: InstanceWithApiDetails[] = [];
    let currentErrors = new Map<string, string>();

    for (const config of apiConfigsList) {
      const apiRoot = getApiRootUrl(config.id); 
      const token = getToken(config.id);

      if (!apiRoot || !token) {
        console.warn(`Topology: API config "${config.name}" (ID: ${config.id}) is invalid or incomplete. Skipping.`);
        currentErrors.set(config.id, `API 配置 "${config.name}" 无效或不完整。`);
        continue;
      }

      try {
        console.log(`Topology: Fetching instances from API "${config.name}" (ID: ${config.id}, URL: ${apiRoot})`);
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
  if (globalError && !isLoadingData) {
     return (
      <div className="container mx-auto px-4 py-8 text-center">
        <Card className="max-w-md mx-auto shadow-lg">
          <CardHeader><CardTitle className="text-destructive flex items-center justify-center"><AlertTriangle className="h-6 w-6 mr-2" />错误</CardTitle></CardHeader>
          <CardContent><p>{globalError}</p><Button onClick={() => router.push('/connections')} className="mt-6">前往连接管理</Button></CardContent>
        </Card>
      </div>
    );
  }

  const renderInstanceStatus = (status: Instance['status']) => {
    let color = 'text-gray-500';
    if (status === 'running') color = 'text-green-500';
    else if (status === 'error') color = 'text-red-500';
    return <span className={`font-semibold ${color} capitalize`}>{status}</span>;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-center sm:text-left">实例连接拓扑 (服务器中心)</h1>
          <div className="flex items-center gap-2">
            {lastRefreshed && <span className="text-xs text-muted-foreground">上次刷新: {lastRefreshed.toLocaleTimeString()}</span>}
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

        {isLoadingData && !isLoadingApiConfig && (
           <div className="flex justify-center items-center flex-grow py-10">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-4 text-lg">加载拓扑数据中...</p>
          </div>
        )}

        {!isLoadingData && processedServers.length === 0 && (
          <Card className="text-center py-10 shadow-lg flex-grow flex flex-col justify-center items-center bg-card">
            <CardHeader><CardTitle>无服务器实例数据</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {apiConfigsList.length > 0 ? "未找到任何服务器实例。" : "请先配置API连接。"}
              </p>
              {fetchErrors.size > 0 && <p className="text-muted-foreground mt-2">部分API配置加载失败，可能影响结果。</p>}
            </CardContent>
          </Card>
        )}
        
        {!isLoadingData && processedServers.length > 0 && (
          <Accordion type="multiple" className="w-full space-y-4">
            {processedServers.map((server) => (
              <AccordionItem key={server.id} value={server.id} className="bg-card border border-border rounded-lg shadow-md hover:shadow-lg transition-shadow">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 w-full">
                    <ServerIcon className="h-6 w-6 text-primary shrink-0" />
                    <div className="flex-grow text-left">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="font-semibold text-md truncate" title={server.id}>
                            服务器: {server.id.substring(0,12)}...
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md break-all"><p>ID: {server.id}</p><p>URL: {server.url}</p></TooltipContent>
                      </Tooltip>
                       <p className="text-xs text-muted-foreground">
                         监听: <span className="font-mono">{server.listeningTunnelAddress || 'N/A'}</span> ({renderInstanceStatus(server.status)})
                       </p>
                    </div>
                    <Badge variant="outline" className="text-xs ml-auto mr-2 shrink-0 py-1">API: {server.apiName}</Badge>
                    <ChevronDownSquare className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:hidden" />
                    <ChevronRightSquare className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=closed]:hidden" />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 pt-2 border-t border-border/50">
                  {server.connectedClients.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-2">此服务器实例当前没有连接的客户端。</p>
                  ) : (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">连接的客户端 ({server.connectedClients.length}):</h4>
                      {server.connectedClients.map((client) => (
                        <Card key={client.id} className="bg-background/50 p-3 shadow-sm border">
                          <div className="flex items-start gap-2">
                            <SmartphoneIcon className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                            <div className="flex-grow">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="font-medium text-sm truncate" title={client.id}>
                                    客户端: {client.id.substring(0,12)}...
                                    <Badge variant="secondary" className="text-xs ml-2 py-0.5 px-1.5 scale-90 origin-left">API: {client.apiName}</Badge>
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-md break-all"><p>ID: {client.id}</p><p>URL: {client.url}</p></TooltipContent>
                              </Tooltip>
                              <p className="text-xs text-muted-foreground">
                                连接到: <span className="font-mono">{client.clientTunnelAddress || 'N/A'}</span> ({renderInstanceStatus(client.status)})
                              </p>
                            </div>
                          </div>
                           <div className="mt-2 pl-6 border-l-2 border-dashed border-muted-foreground/30 ml-[7px]">
                             <p className="text-xs text-foreground flex items-center">
                                <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5 text-green-600 dark:text-green-400 shrink-0"/>
                                落地Node: <span className="font-semibold font-mono text-green-600 dark:text-green-400 ml-1">{client.localTargetAddress || 'N/A'}</span>
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
            <li>此视图显示从所有已配置的API源聚合的服务器实例。</li>
            <li>展开服务器实例可查看连接到该服务器的客户端实例。</li>
            <li>连接关系基于客户端URL中的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (客户端连接的目标地址) 与服务器URL中的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (服务器监听的地址) 的匹配。</li>
            <li>客户端的 "落地Node" 是从其URL的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code> 解析的。</li>
            <li>通配符监听地址 (如 <code className="bg-muted px-1 py-0.5 rounded text-foreground">0.0.0.0</code> 或 <code className="bg-muted px-1 py-0.5 rounded text-foreground">[::]</code>) 在服务器上会被正确匹配。</li>
          </ul>
        </div>
      </div>
    </TooltipProvider>
  );
}

    