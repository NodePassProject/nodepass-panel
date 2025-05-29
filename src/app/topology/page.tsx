
"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Info, ServerIcon, SmartphoneIcon, NetworkIcon, Link2, ZapOff, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AppLayout } from '@/components/layout/AppLayout';
import { InstanceStatusBadge } from '@/components/nodepass/InstanceStatusBadge';
import { Badge } from '@/components/ui/badge';

interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

interface ProcessedClientInstance extends InstanceWithApiDetails {
  clientConnectsToServerAddress: string | null; // Parsed tunnel_addr of the client (points to server)
  localTargetAddress: string | null;          // Parsed target_addr of the client ("落地node")
}

interface ProcessedServerInstance extends InstanceWithApiDetails {
  serverListeningAddress: string | null; // Parsed tunnel_addr of the server (listens for clients)
  serverForwardsToAddress: string | null; // Parsed target_addr of the server (forwards to this)
  connectedClients: ProcessedClientInstance[];
}

interface ConnectionLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'intra-api' | 'inter-api';
}

function parseTunnelAddr(urlString: string): string | null {
  try {
    const url = new URL(urlString); // Handles client://hostname:port/target
    return url.host;
  } catch (e) {
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
    }
    return endOfTunnelAddr !== -1 ? restOfString.substring(0, endOfTunnelAddr) : restOfString;
  }
}

function parseTargetAddr(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null;

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null;

  const targetAndQuery = restOfString.substring(pathSeparatorIndex + 1);
  const querySeparatorIndex = targetAndQuery.indexOf('?');
  return querySeparatorIndex !== -1 ? targetAndQuery.substring(0, querySeparatorIndex) : targetAndQuery;
}

function splitHostPort(address: string | null): { host: string | null; port: string | null } {
  if (!address) return { host: null, port: null };
  const ipv6WithPortMatch = address.match(/^\[(.+)\]:(\d+)$/);
  if (ipv6WithPortMatch) return { host: ipv6WithPortMatch[1], port: ipv6WithPortMatch[2] };

  const lastColonIndex = address.lastIndexOf(':');
  if (lastColonIndex === -1 || address.substring(0, lastColonIndex).includes(':')) {
    return { host: address, port: null };
  }
  const potentialHost = address.substring(0, lastColonIndex);
  const potentialPort = address.substring(lastColonIndex + 1);
  if (potentialPort && !isNaN(parseInt(potentialPort, 10)) && parseInt(potentialPort, 10).toString() === potentialPort) {
    return { host: potentialHost, port: potentialPort };
  }
  return { host: address, port: null };
}

export default function TopologyPage() {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();

  const [processedServers, setProcessedServers] = useState<ProcessedServerInstance[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [lines, setLines] = useState<ConnectionLine[]>([]);
  
  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);

  const processAllInstanceData = useCallback((allInstances: InstanceWithApiDetails[]) => {
    const serverInstancesRaw = allInstances.filter(inst => inst.type === 'server');
    const clientInstancesRaw = allInstances.filter(inst => inst.type === 'client');

    const sNodes: ProcessedServerInstance[] = serverInstancesRaw.map(serverInst => {
      const serverOwnTunnelAddr = parseTunnelAddr(serverInst.url);
      const { host: serverHostToMatch, port: serverPortToMatch } = splitHostPort(serverOwnTunnelAddr);

      const connectedC: ProcessedClientInstance[] = clientInstancesRaw
        .map(clientInst => {
          const clientConnectsToServerAddrFull = parseTunnelAddr(clientInst.url);
          if (!clientConnectsToServerAddrFull) return null;
          const { host: clientHostConnectsTo, port: clientPortConnectsTo } = splitHostPort(clientConnectsToServerAddrFull);

          if (serverPortToMatch && clientPortConnectsTo && serverPortToMatch === clientPortConnectsTo) {
            const isServerHostWildcard = serverHostToMatch === '0.0.0.0' || serverHostToMatch === '::' || serverHostToMatch === '' || serverHostToMatch === null;
            if (isServerHostWildcard || clientHostConnectsTo === serverHostToMatch) {
              return {
                ...clientInst,
                clientConnectsToServerAddress: clientConnectsToServerAddrFull,
                localTargetAddress: parseTargetAddr(clientInst.url),
              };
            }
          }
          return null;
        })
        .filter((client): client is ProcessedClientInstance => client !== null);

      return {
        ...serverInst,
        serverListeningAddress: serverOwnTunnelAddr,
        serverForwardsToAddress: parseTargetAddr(serverInst.url),
        connectedClients: connectedC,
      };
    });
    setProcessedServers(sNodes); // Display all servers, including those with no clients
    setLastRefreshed(new Date());
  }, []);

  const fetchDataAndProcess = useCallback(async () => {
    if (isLoadingApiConfig || apiConfigsList.length === 0) {
      setIsLoadingData(false);
      if (apiConfigsList.length === 0) {
        setFetchErrors(prev => new Map(prev).set("global", "无API连接，请先添加。"));
      }
      setProcessedServers([]);
      setLines([]);
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
        currentErrors.set(config.id, `API配置 “${config.name}” 无效或不完整。`);
        continue;
      }
      try {
        const data = await nodePassApi.getInstances(apiRoot, token);
        combinedInstances.push(...data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name })));
      } catch (err: any) {
        currentErrors.set(config.id, `加载 “${config.name}” 实例失败: ${err.message || '未知错误'}`);
      }
    }
    setFetchErrors(currentErrors);
    processAllInstanceData(combinedInstances);
    setIsLoadingData(false);
  }, [apiConfigsList, isLoadingApiConfig, getApiConfigById, processAllInstanceData, getApiRootUrl, getToken]);

  useEffect(() => {
    fetchDataAndProcess();
  }, [fetchDataAndProcess]);

  const calculateLines = useCallback(() => {
    if (!svgRef.current || processedServers.length === 0) {
      setLines([]);
      return;
    }
    const newLines: ConnectionLine[] = [];
    const svgRect = svgRef.current.getBoundingClientRect();

    processedServers.forEach(server => {
      const serverNode = nodeRefs.current.get(`server-${server.id}`);
      if (!serverNode) return;
      const serverRect = serverNode.getBoundingClientRect();
      const serverCenterX = serverRect.left + serverRect.width / 2 - svgRect.left;
      const serverBottomY = serverRect.bottom - svgRect.top;

      server.connectedClients.forEach(client => {
        const clientNode = nodeRefs.current.get(`client-${client.id}`);
        if (!clientNode) return;
        const clientRect = clientNode.getBoundingClientRect();
        const clientCenterX = clientRect.left + clientRect.width / 2 - svgRect.left;
        const clientTopY = clientRect.top - svgRect.top;
        
        newLines.push({
          id: `line-${server.id}-${client.id}`,
          x1: serverCenterX,
          y1: serverBottomY,
          x2: clientCenterX,
          y2: clientTopY,
          type: server.apiId === client.apiId ? 'intra-api' : 'inter-api',
        });
      });
    });
    setLines(newLines);
  }, [processedServers]);

  useEffect(() => {
    if (!isLoadingData && processedServers.length > 0) {
      // Delay slightly to ensure DOM elements are fully rendered and measurable
      const timer = setTimeout(calculateLines, 100);
      window.addEventListener('resize', calculateLines);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', calculateLines);
      };
    }
  }, [isLoadingData, processedServers, calculateLines]);

  const globalError = fetchErrors.get("global");

  const renderNode = (instance: InstanceWithApiDetails, type: 'server' | 'client') => {
    const isServer = type === 'server';
    const specificDetails = isServer 
        ? `监听: ${(instance as ProcessedServerInstance).serverListeningAddress || 'N/A'} | 转发至: ${(instance as ProcessedServerInstance).serverForwardsToAddress || 'N/A'}`
        : `连接至: ${(instance as ProcessedClientInstance).clientConnectsToServerAddress || 'N/A'}`;

    return (
      <div
        ref={el => nodeRefs.current.set(`${type}-${instance.id}`, el)}
        className="border p-3 rounded-lg shadow-md bg-card hover:shadow-lg transition-shadow w-full max-w-xs my-2"
        key={instance.id}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 mb-1">
              {isServer ? <ServerIcon className="h-5 w-5 text-primary" /> : <SmartphoneIcon className="h-5 w-5 text-accent" />}
              <h3 className="font-semibold text-sm truncate" title={`API: ${instance.apiName} | ID: ${instance.id}`}>
                {instance.apiName} <span className="text-xs text-muted-foreground">({instance.id.substring(0, 8)}...)</span>
              </h3>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs break-all">
            <p>API: {instance.apiName} (ID: {instance.apiId})</p>
            <p>实例ID: {instance.id}</p>
            <p>URL: {instance.url}</p>
          </TooltipContent>
        </Tooltip>
        <div className="text-xs space-y-0.5">
          <div className="flex items-center">
            <InstanceStatusBadge status={instance.status} />
          </div>
          <p className="text-muted-foreground truncate"><span className="font-mono">{specificDetails}</span></p>
          {!isServer && (
            <p className="text-muted-foreground flex items-center">
                <Route className="h-3.5 w-3.5 mr-1.5 text-green-600 dark:text-green-400 shrink-0"/>
                本地目标: <span className="font-semibold font-mono text-green-600 dark:text-green-400 ml-1">{(instance as ProcessedClientInstance).localTargetAddress || 'N/A'}</span>
            </p>
          )}
        </div>
      </div>
    );
  };


  if (isLoadingApiConfig) {
    return <AppLayout><div className="text-center py-10"><Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" /><p>加载API配置...</p></div></AppLayout>;
  }
  if (globalError && !isLoadingData) {
    return <AppLayout><Card className="max-w-md mx-auto mt-10 shadow-lg"><CardHeader><CardTitle className="text-destructive flex items-center justify-center"><AlertTriangle className="h-6 w-6 mr-2" />错误</CardTitle></CardHeader><CardContent><p>{globalError}</p><Button onClick={() => router.push('/connections')} className="mt-6">前往连接管理</Button></CardContent></Card></AppLayout>;
  }

  return (
    <AppLayout>
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">连接拓扑 (服务器为中心)</h1>
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
                      <div><p className="font-semibold">加载错误 (API: {apiConfigsList.find(c => c.id === apiId)?.name || apiId})</p><p>{errorMsg}</p></div>
                    </CardContent>
                  </Card>
                )
              ))}
            </div>
          )}

          {isLoadingData && !isLoadingApiConfig && (
            <div className="flex-grow flex justify-center items-center py-10">
              <Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-4 text-lg">加载拓扑数据...</p>
            </div>
          )}

          {!isLoadingData && processedServers.length === 0 && (
            <Card className="text-center py-10 shadow-lg flex-grow flex flex-col justify-center items-center bg-card">
              <CardHeader><CardTitle>无数据显示</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">{apiConfigsList.length > 0 ? "当前无服务器实例。" : "请先配置API连接。"}</p></CardContent>
            </Card>
          )}
          
          {!isLoadingData && processedServers.length > 0 && (
            <div className="relative flex-grow border rounded-lg p-4 bg-muted/10 overflow-auto">
              <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
                <defs>
                  <marker id="arrowhead-intra" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
                  </marker>
                  <marker id="arrowhead-inter" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--accent))" />
                  </marker>
                </defs>
                {lines.map(line => (
                  <line
                    key={line.id}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke={line.type === 'intra-api' ? 'hsl(var(--primary))' : 'hsl(var(--accent))'}
                    strokeWidth="1.5"
                    markerEnd={line.type === 'intra-api' ? "url(#arrowhead-intra)" : "url(#arrowhead-inter)"}
                  />
                ))}
              </svg>
              
              <div className="relative z-10 space-y-8">
                {processedServers.map(server => (
                  <div key={server.id} className="flex flex-col items-center">
                    {renderNode(server, 'server')}
                    {server.connectedClients.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-4 mt-2 pl-8 border-l-2 border-dashed border-muted-foreground/30 ml-0"> {/* Fishbone style arm */}
                        {server.connectedClients.map(client => renderNode(client, 'client'))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground shadow-sm">
            <div className="flex items-center font-semibold mb-2"><Info className="h-4 w-4 mr-2 text-primary shrink-0" />拓扑说明</div>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>此视图聚合所有API源的服务器实例及其连接的客户端。</li>
              <li>连接基于客户端 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> 与服务器 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> 匹配 (端口及主机/通配符)。</li>
              <li>客户端“本地目标”由其 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code> 解析。</li>
              <li><span className="inline-block w-3 h-3 rounded-full mr-1.5" style={{ backgroundColor: 'hsl(var(--primary))' }}></span><strong className="text-primary">主色连线</strong>: 服务器和客户端属于同一API配置。</li>
              <li><span className="inline-block w-3 h-3 rounded-full mr-1.5" style={{ backgroundColor: 'hsl(var(--accent))' }}></span><strong className="text-accent">强调色连线</strong>: 服务器和客户端属于不同API配置。</li>
            </ul>
          </div>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
}
