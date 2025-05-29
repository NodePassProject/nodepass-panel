
"use client";

import type { NextPage } from 'next';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Info, ServerIcon, SmartphoneIcon, NetworkIcon, Route, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  position: { x: number; y: number }; // For draggable position
}

interface ConnectionLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'intra-api' | 'inter-api'; // To differentiate line colors
}

interface DraggingNodeInfo {
  id: string; // Server ID being dragged
  initialMouseX: number;
  initialMouseY: number;
  initialNodeX: number;
  initialNodeY: number;
}

// Helper function to parse the tunnel_addr from a NodePass URL
function parseTunnelAddr(urlString: string): string | null {
  try {
    // Try parsing as a full URL first (handles client://hostname:port/target scenarios)
    const url = new URL(urlString);
    return url.host; // host includes hostname and port
  } catch (e) {
    // Fallback for server URLs like server://ip:port/target
    const schemeSeparator = "://";
    const schemeIndex = urlString.indexOf(schemeSeparator);
    if (schemeIndex === -1) return null;

    const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
    
    // Find the end of the tunnel_addr part
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

// Helper function to parse the target_addr from a NodePass URL
function parseTargetAddr(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null; // No scheme found

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null; // No path separator after tunnel_addr

  // Target address is between the first '/' and the '?'
  const targetAndQuery = restOfString.substring(pathSeparatorIndex + 1);
  const querySeparatorIndex = targetAndQuery.indexOf('?');
  
  return querySeparatorIndex !== -1 ? targetAndQuery.substring(0, querySeparatorIndex) : targetAndQuery;
}

// Helper function to split host and port, handling IPv6 addresses
function splitHostPort(address: string | null): { host: string | null; port: string | null } {
  if (!address) return { host: null, port: null };

  // Regex for IPv6 with port: [IPv6]:port
  const ipv6WithPortMatch = address.match(/^\[(.+)\]:(\d+)$/);
  if (ipv6WithPortMatch) {
    return { host: ipv6WithPortMatch[1], port: ipv6WithPortMatch[2] };
  }

  // For IPv4 or hostname with port
  const lastColonIndex = address.lastIndexOf(':');
  // If no colon, or if it's an IPv6 address without brackets (less common for host:port)
  if (lastColonIndex === -1 || address.substring(0, lastColonIndex).includes(':')) {
    return { host: address, port: null }; // Assume it's just a host or malformed
  }
  
  const potentialHost = address.substring(0, lastColonIndex);
  const potentialPort = address.substring(lastColonIndex + 1);

  // Check if potentialPort is a valid port number
  if (potentialPort && !isNaN(parseInt(potentialPort, 10)) && parseInt(potentialPort, 10).toString() === potentialPort) {
    return { host: potentialHost, port: potentialPort };
  }
  
  return { host: address, port: null }; // Fallback if port parsing fails
}


const TopologyPage: NextPage = () => {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();

  const [processedServers, setProcessedServers] = useState<ProcessedServerInstance[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [lines, setLines] = useState<ConnectionLine[]>([]);
  
  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null); // Ref for the canvas/drawing area

  const [draggingNodeInfo, setDraggingNodeInfo] = useState<DraggingNodeInfo | null>(null);


  const processAllInstanceData = useCallback((allInstances: InstanceWithApiDetails[]) => {
    const serverInstancesRaw = allInstances.filter(inst => inst.type === 'server');
    const clientInstancesRaw = allInstances.filter(inst => inst.type === 'client');
    let yOffset = 20; // Initial Y offset for server nodes
    const xOffset = 50; // Initial X offset for server nodes
    const serverNodeBaseHeight = 100; // Approximate height of server info box
    const clientNodeHeight = 80; // Approximate height of a client box
    const verticalSpacing = 40; // spacing between server blocks


    const sNodes: ProcessedServerInstance[] = serverInstancesRaw.map((serverInst, index) => {
      const serverOwnTunnelAddr = parseTunnelAddr(serverInst.url); // Server listens on this
      const { host: serverHostToMatch, port: serverPortToMatch } = splitHostPort(serverOwnTunnelAddr);

      const connectedC: ProcessedClientInstance[] = clientInstancesRaw
        .map(clientInst => {
          const clientConnectsToServerAddrFull = parseTunnelAddr(clientInst.url); // Client connects to this
          if (!clientConnectsToServerAddrFull) return null;

          const { host: clientHostConnectsTo, port: clientPortConnectsTo } = splitHostPort(clientConnectsToServerAddrFull);
          
          // Match ports first
          if (serverPortToMatch && clientPortConnectsTo && serverPortToMatch === clientPortConnectsTo) {
            // Handle server wildcard IPs
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
      
      const currentServerPosition = { x: xOffset, y: yOffset };
      // Calculate server block height based on number of clients
      const serverBlockHeight = serverNodeBaseHeight + (connectedC.length * clientNodeHeight) + (connectedC.length > 0 ? 20 : 0);
      yOffset += serverBlockHeight + verticalSpacing; 

      return {
        ...serverInst,
        serverListeningAddress: serverOwnTunnelAddr,
        serverForwardsToAddress: parseTargetAddr(serverInst.url),
        connectedClients: connectedC,
        position: currentServerPosition 
      };
    });
    setProcessedServers(sNodes);
    setLastRefreshed(new Date());
  }, []);

  const fetchDataAndProcess = useCallback(async () => {
    if (isLoadingApiConfig) {
      setIsLoadingData(false);
      setProcessedServers([]);
      setLines([]);
      return;
    }
    if (apiConfigsList.length === 0) {
      setIsLoadingData(false);
      setFetchErrors(new Map().set("global", "无API连接，请先添加。"));
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
        currentErrors.set(config.id, `API配置 "${config.name}" 无效或不完整。`);
        continue;
      }
      try {
        const data = await nodePassApi.getInstances(apiRoot, token);
        combinedInstances.push(...data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name })));
      } catch (err: any) {
        currentErrors.set(config.id, `加载 "${config.name}" 实例失败: ${err.message || '未知错误'}`);
      }
    }
    setFetchErrors(currentErrors);
    processAllInstanceData(combinedInstances);
    setIsLoadingData(false);
  }, [apiConfigsList, isLoadingApiConfig, getApiRootUrl, getToken, processAllInstanceData]);

  useEffect(() => {
    fetchDataAndProcess();
  }, [fetchDataAndProcess]);

  const calculateLines = useCallback(() => {
    if (!svgRef.current || !canvasRef.current || processedServers.length === 0) {
      setLines([]);
      return;
    }
    const newLines: ConnectionLine[] = [];

    processedServers.forEach(server => {
      const serverNodeEl = nodeRefs.current.get(`server-${server.id}`);
      if (!serverNodeEl) return;

      const serverInfoBox = serverNodeEl.querySelector<HTMLDivElement>('[data-role="server-info-box"]');
      const serverInfoBoxHeight = serverInfoBox ? serverInfoBox.offsetHeight : 50; 

      const serverAttachX = server.position.x + serverNodeEl.offsetWidth / 2;
      const serverAttachY = server.position.y + serverInfoBoxHeight;


      server.connectedClients.forEach(client => {
        const clientNodeEl = nodeRefs.current.get(`client-${client.id}`);
        if (!clientNodeEl) return;
        
        const clientAbsoluteX = server.position.x + clientNodeEl.offsetLeft + clientNodeEl.offsetWidth / 2;
        const clientAbsoluteY = server.position.y + clientNodeEl.offsetTop;

        newLines.push({
          id: `line-${server.id}-${client.id}`,
          x1: serverAttachX,
          y1: serverAttachY,
          x2: clientAbsoluteX,
          y2: clientAbsoluteY,
          type: server.apiId === client.apiId ? 'intra-api' : 'inter-api',
        });
      });
    });
    setLines(newLines);
  }, [processedServers, nodeRefs]);

  useEffect(() => {
    if (!isLoadingData && processedServers.length > 0) {
      const timer = setTimeout(calculateLines, 250); 
      window.addEventListener('resize', calculateLines);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', calculateLines);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingData, processedServers, calculateLines, draggingNodeInfo]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, serverId: string) => {
    e.preventDefault();
    const serverNodeEl = nodeRefs.current.get(`server-${serverId}`);
    const server = processedServers.find(s => s.id === serverId);

    if (!server || !serverNodeEl || !canvasRef.current) return;
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseXInCanvas = e.clientX - canvasRect.left;
    const mouseYInCanvas = e.clientY - canvasRect.top;
    
    setDraggingNodeInfo({
      id: serverId,
      initialMouseX: mouseXInCanvas,
      initialMouseY: mouseYInCanvas,
      initialNodeX: server.position.x,
      initialNodeY: server.position.y,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingNodeInfo || !canvasRef.current) return;
    e.preventDefault();
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseXInCanvas = e.clientX - canvasRect.left;
    const mouseYInCanvas = e.clientY - canvasRect.top;

    const dx = mouseXInCanvas - draggingNodeInfo.initialMouseX;
    const dy = mouseYInCanvas - draggingNodeInfo.initialMouseY;

    let newX = draggingNodeInfo.initialNodeX + dx;
    let newY = draggingNodeInfo.initialNodeY + dy;
    
    const serverNodeEl = nodeRefs.current.get(`server-${draggingNodeInfo.id}`);
    const nodeWidth = serverNodeEl?.offsetWidth || 256;
    const nodeHeight = serverNodeEl?.offsetHeight || 100;

    newX = Math.max(0, Math.min(newX, canvasRef.current.scrollWidth - nodeWidth));
    newY = Math.max(0, Math.min(newY, canvasRef.current.scrollHeight - nodeHeight));


    setProcessedServers(prevServers =>
      prevServers.map(s =>
        s.id === draggingNodeInfo.id ? { ...s, position: { x: newX, y: newY } } : s
      )
    );
  }, [draggingNodeInfo, nodeRefs]);

  const handleMouseUp = useCallback(() => {
    setDraggingNodeInfo(null);
  }, []);

  useEffect(() => {
    if (draggingNodeInfo) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNodeInfo, handleMouseMove, handleMouseUp]);


  if (isLoadingApiConfig) {
    return <AppLayout><div className="text-center py-10"><Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" /><p>加载API配置...</p></div></AppLayout>;
  }

  const globalError = fetchErrors.get("global");
  if (globalError && !isLoadingData) {
    return (
      <AppLayout>
        <Card className="max-w-md mx-auto mt-10 shadow-lg">
          <CardHeader><CardTitle className="text-destructive flex items-center justify-center"><AlertTriangle className="h-6 w-6 mr-2" />错误</CardTitle></CardHeader>
          <CardContent><p>{globalError}</p><Button onClick={() => router.push('/connections')} className="mt-6">管理 API 连接</Button></CardContent>
        </Card>
      </AppLayout>
    );
  }
  
  const serversWithClients = processedServers.filter(s => s.connectedClients.length > 0);

  return (
    <AppLayout>
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">实例连接拓扑 (服务器为中心)</h1>
            <div className="flex items-center gap-2">
              {lastRefreshed && <span className="text-xs text-muted-foreground">刷新于: {lastRefreshed.toLocaleTimeString()}</span>}
              <Button variant="outline" onClick={fetchDataAndProcess} disabled={isLoadingData} size="sm">
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                {isLoadingData ? '刷新中...' : '刷新'}
              </Button>
               <Button variant="outline" onClick={calculateLines} disabled={isLoadingData} size="sm" title="重新计算连线">
                <NetworkIcon className="mr-2 h-4 w-4" />
                布局
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

          {!isLoadingData && serversWithClients.length === 0 && (
             <Card className="text-center py-10 shadow-lg flex-grow flex flex-col justify-center items-center bg-card">
              <CardHeader><CardTitle>无连接数据显示</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">{apiConfigsList.length > 0 ? "当前所有服务器实例均无连接的客户端。" : "请先配置API连接。"}</p></CardContent>
            </Card>
          )}
          
          <div 
            ref={canvasRef}
            id="topology-canvas"
            className="relative flex-grow border rounded-lg p-4 bg-muted/10 overflow-auto min-h-[600px] w-full" 
          >
            <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <defs>
                <marker id="arrowhead-intra" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
                  <polygon points="0 0, 10 3.5, 0 7" className="fill-primary" />
                </marker>
                <marker id="arrowhead-inter" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
                  <polygon points="0 0, 10 3.5, 0 7" className="fill-accent" />
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
            
            {serversWithClients.map((server) => (
              <div
                key={server.id}
                ref={el => nodeRefs.current.set(`server-${server.id}`, el)}
                className="absolute bg-card border p-3 rounded-lg shadow-md hover:shadow-lg transition-shadow w-64 cursor-grab"
                style={{
                  left: `${server.position.x}px`,
                  top: `${server.position.y}px`,
                  zIndex: draggingNodeInfo?.id === server.id ? 10 : 1,
                  userSelect: 'none', // Prevent text selection during drag
                }}
                onMouseDown={(e) => handleMouseDown(e, server.id)}
              >
                <div data-role="server-info-box">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 mb-2">
                          <Move className="h-4 w-4 text-muted-foreground hover:text-primary flex-shrink-0" />
                          <ServerIcon className="h-5 w-5 text-primary flex-shrink-0" />
                          <h3 className="font-semibold text-sm truncate" title={`API: ${server.apiName} | 服务器 ID: ${server.id}`}>
                            {server.apiName}
                          </h3>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs break-all text-xs">
                        <p>来源 API: {server.apiName} (ID: {server.apiId})</p>
                        <p>服务器实例 ID: {server.id}</p>
                        <p>URL: {server.url}</p>
                      </TooltipContent>
                    </Tooltip>
                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center">
                        <InstanceStatusBadge status={server.status} />
                         <span className="text-muted-foreground ml-2 text-xs">(ID: {server.id.substring(0,8)}...)</span>
                      </div>
                       <p className="text-muted-foreground truncate">
                        <span className="font-semibold">监听:</span> <span className="font-mono">{server.serverListeningAddress || 'N/A'}</span>
                      </p>
                       <p className="text-muted-foreground truncate">
                        <span className="font-semibold">转发至:</span> <span className="font-mono">{server.serverForwardsToAddress || 'N/A'}</span>
                      </p>
                    </div>
                </div>

                {server.connectedClients.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-dashed space-y-2">
                    {server.connectedClients.map(client => (
                      <div 
                        key={client.id} 
                        ref={el => nodeRefs.current.set(`client-${client.id}`, el)}
                        className="ml-1 p-1.5 rounded-md bg-muted/50 border border-transparent hover:border-primary/30"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5">
                              <SmartphoneIcon className="h-4 w-4 text-accent shrink-0" />
                              <div className="text-xs flex-grow truncate">
                                <span className="font-semibold">{client.apiName}</span>
                                <span className="text-muted-foreground text-xs"> (ID: {client.id.substring(0,8)}...)</span>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs break-all text-xs">
                            <p>来源 API: {client.apiName} (ID: {client.apiId})</p>
                            <p>客户端实例 ID: {client.id}</p>
                            <p>URL: {client.url}</p>
                          </TooltipContent>
                        </Tooltip>
                        <div className="text-xs space-y-0.5 mt-0.5 pl-1">
                           <div className="flex items-center"><InstanceStatusBadge status={client.status} /></div>
                           <p className="text-muted-foreground truncate" title={client.clientConnectsToServerAddress || 'N/A'}><span className="font-mono text-xs">{client.clientConnectsToServerAddress || 'N/A'}</span></p>
                           <p className="text-muted-foreground flex items-center text-xs">
                              <Route className="h-3 w-3 mr-1 text-green-600 dark:text-green-400 shrink-0"/>
                              <span className="font-semibold font-mono text-green-600 dark:text-green-400 truncate" title={client.localTargetAddress || 'N/A'}>{client.localTargetAddress || 'N/A'}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground shadow-sm">
            <div className="flex items-center font-semibold mb-2"><Info className="h-4 w-4 mr-2 text-primary shrink-0" />拓扑说明</div>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>此视图聚合所有API源的服务器实例及其连接的客户端。仅显示有客户端连接的服务器。</li>
              <li>您可以拖动服务器节点（包含其客户端）来调整布局。点击“布局”按钮可刷新连线。</li>
              <li>连接基于客户端 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> 与服务器 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> 匹配 (端口及主机/通配符)。</li>
              <li>客户端“落地Node”由其 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code> 解析。</li>
              <li><span className="inline-flex items-center mr-1.5 align-middle"><svg width="12" height="12" viewBox="0 0 12 12"><line x1="0" y1="6" x2="12" y2="6" stroke="hsl(var(--primary))" strokeWidth="2"/></svg></span><strong className="text-primary">主色连线</strong>: 服务器和客户端属于同一API配置。</li>
              <li><span className="inline-flex items-center mr-1.5 align-middle"><svg width="12" height="12" viewBox="0 0 12 12"><line x1="0" y1="6" x2="12" y2="6" stroke="hsl(var(--accent))" strokeWidth="2"/></svg></span><strong className="text-accent">强调色连线</strong>: 服务器和客户端属于不同API配置。</li>
            </ul>
          </div>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
};

export default TopologyPage;

    