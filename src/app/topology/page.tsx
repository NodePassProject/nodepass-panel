
"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Info, ServerIcon, SmartphoneIcon, LinkIcon, Waypoints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

interface ClientInstanceNode extends InstanceWithApiDetails {
  localTargetAddress: string | null; // "落地node"
  connectedToServerId: string | null; // ID of the server it's connected to
}

interface ServerInstanceNode extends InstanceWithApiDetails {
  listeningTunnelAddress: string | null;
}

interface ConnectionLine {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isInterApi: boolean;
}

// Parses scheme://<tunnel_addr>/...
// For client: server it connects to. For server: address it listens on.
function parseTunnelAddr(urlString: string): string | null {
  try {
    // Handle full URLs first
    const url = new URL(urlString);
    return url.host; // Extracts 'hostname:port' or 'hostname'
  } catch (e) {
    // Fallback for scheme-only strings like "server://0.0.0.0:1234" or "client://host:port"
    const schemeSeparator = "://";
    const schemeIndex = urlString.indexOf(schemeSeparator);
    if (schemeIndex === -1) return null;

    const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
    
    // Find the end of the tunnel_addr part (before / or ?)
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
      // If no / or ?, the rest of the string is the tunnel_addr
      return restOfString;
    }
    
    return restOfString.substring(0, endOfTunnelAddr);
  }
}

// Parses .../<target_addr>?...
// For client: local forwarding address ("落地node")
// For server: target address for traffic forwarding
function parseTargetAddr(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null;

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null; // No target_addr part

  const targetAndQuery = restOfString.substring(pathSeparatorIndex + 1);
  const querySeparatorIndex = targetAndQuery.indexOf('?');

  if (querySeparatorIndex !== -1) {
    return targetAndQuery.substring(0, querySeparatorIndex);
  }
  // If no query string, the whole part is the target_addr
  return targetAndQuery;
}


function splitHostPort(address: string | null): [string | null, string | null] {
  if (!address) return [null, null];
  
  const ipv6WithPortMatch = address.match(/^\[(.+)\]:(\d+)$/);
  if (ipv6WithPortMatch && ipv6WithPortMatch[1] && ipv6WithPortMatch[2]) {
    return [ipv6WithPortMatch[1], ipv6WithPortMatch[2]];
  }

  const parts = address.split(':');
  if (parts.length > 1) {
    const port = parts.pop();
    const host = parts.join(':');
    if (port && !isNaN(parseInt(port, 10))) {
       return [host, port];
    }
  }
  return [address, null];
}


export default function TopologyPage() {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  
  const [serverNodes, setServerNodes] = useState<ServerInstanceNode[]>([]);
  const [clientNodes, setClientNodes] = useState<ClientInstanceNode[]>([]);
  const [lines, setLines] = useState<ConnectionLine[]>([]);
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);


  const processInstanceData = useCallback((allInstances: InstanceWithApiDetails[]) => {
    const S_Nodes: ServerInstanceNode[] = [];
    const C_Nodes_Unconnected: ClientInstanceNode[] = [];

    allInstances.forEach(inst => {
      if (inst.type === 'server') {
        S_Nodes.push({
          ...inst,
          listeningTunnelAddress: parseTunnelAddr(inst.url)
        });
      } else if (inst.type === 'client') {
        C_Nodes_Unconnected.push({
          ...inst,
          localTargetAddress: parseTargetAddr(inst.url), // For client, target_addr is "落地node"
          connectedToServerId: null, // Will be determined next
        });
      }
    });
    
    const finalClientNodes: ClientInstanceNode[] = [];
    // const connections: { clientId: string, serverId: string, clientApiId: string, serverApiId: string }[] = [];

    C_Nodes_Unconnected.forEach(client => {
      const clientConnectionTarget = parseTunnelAddr(client.url); // What server the client *wants* to connect to
      if (!clientConnectionTarget) {
        finalClientNodes.push(client); // Add as unconnected if no target
        return;
      }

      const [clientTargetHost, clientTargetPort] = splitHostPort(clientConnectionTarget);
      let connected = false;
      for (const server of S_Nodes) {
        const serverListeningAddress = server.listeningTunnelAddress;
        if (!serverListeningAddress) continue;

        const [serverHost, serverPort] = splitHostPort(serverListeningAddress);

        if (clientTargetPort === serverPort) { // Ports must match
          const isServerHostWildcard = serverHost === '0.0.0.0' || serverHost === '::' || serverHost === '';
          if (isServerHostWildcard || clientTargetHost === serverHost) {
            finalClientNodes.push({ ...client, connectedToServerId: server.id });
            // connections.push({ clientId: client.id, serverId: server.id, clientApiId: client.apiId, serverApiId: server.apiId });
            connected = true;
            break; 
          }
        }
      }
      if (!connected) {
         finalClientNodes.push(client); // Add as unconnected if no server match
      }
    });

    setServerNodes(S_Nodes);
    setClientNodes(finalClientNodes);
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
        setServerNodes([]);
        setClientNodes([]);
        setLines([]);
        return;
    }
    
    setIsLoadingData(true);
    setFetchErrors(new Map()); 
    nodeRefs.current.clear();
    
    let combinedInstances: InstanceWithApiDetails[] = [];
    let currentErrors = new Map<string, string>();

    for (const config of apiConfigsList) {
      const apiRoot = getApiRootUrl(config.id); 
      const token = getToken(config.id);

      if (!apiRoot || !token) {
        currentErrors.set(config.id, `API 配置 "${config.name}" (ID: ${config.id}) 无效或不完整。`);
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

  useEffect(() => {
    const calculateLines = () => {
      if (!svgRef.current || (serverNodes.length === 0 && clientNodes.length === 0)) {
        setLines([]);
        return;
      }

      const newLines: ConnectionLine[] = [];
      const svgRect = svgRef.current.getBoundingClientRect();

      clientNodes.forEach(client => {
        if (client.connectedToServerId) {
          const clientRef = nodeRefs.current.get(`client-node-${client.id}`);
          const server = serverNodes.find(s => s.id === client.connectedToServerId);
          const serverRef = server ? nodeRefs.current.get(`server-node-${server.id}`) : null;

          if (clientRef && serverRef && server) {
            const clientRect = clientRef.getBoundingClientRect();
            const serverRect = serverRef.getBoundingClientRect();
            
            const startX = clientRect.left + clientRect.width / 2 - svgRect.left;
            const startY = clientRect.top + clientRect.height / 2 - svgRect.top;
            const endX = serverRect.left + serverRect.width / 2 - svgRect.left;
            const endY = serverRect.top + serverRect.height / 2 - svgRect.top;

            newLines.push({
              id: `line-${client.id}-${server.id}`,
              startX, startY, endX, endY,
              isInterApi: client.apiId !== server.apiId,
            });
          }
        }
      });
      setLines(newLines);
    };

    if (!isLoadingData) {
        const timer = setTimeout(calculateLines, 200); // Increased timeout for DOM updates
        window.addEventListener('resize', calculateLines);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', calculateLines);
        };
    }
  }, [serverNodes, clientNodes, isLoadingData]);


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

  const renderNode = (node: InstanceWithApiDetails, type: 'server' | 'client') => (
    <Tooltip key={node.id}>
      <TooltipTrigger asChild>
        <div
          id={`${type}-node-${node.id}`}
          ref={el => nodeRefs.current.set(`${type}-node-${node.id}`, el)}
          className="border bg-card text-card-foreground shadow-lg rounded-xl p-4 m-2 w-80 hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-1"
        >
          <div className="flex items-center gap-3 mb-2">
            {type === 'server' ? <ServerIcon className="h-6 w-6 text-primary shrink-0" /> : <SmartphoneIcon className="h-5 w-5 text-accent shrink-0" />}
            <span className="font-bold text-md truncate" title={node.id}>{node.id.substring(0,12)}...</span>
            <Badge variant="outline" className="text-xs ml-auto scale-90 py-1">{node.apiName}</Badge>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground break-all font-mono truncate cursor-default">
                URL: {node.url}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-md break-all bg-popover text-popover-foreground p-2 rounded shadow-lg">
              <p className="font-mono">{node.url}</p>
            </TooltipContent>
          </Tooltip>
          
          {type === 'client' && (node as ClientInstanceNode).localTargetAddress && (
             <p className="text-xs text-foreground mt-2 flex items-center">
                <Waypoints className="h-4 w-4 mr-1.5 text-green-600 dark:text-green-400 shrink-0"/>
                落地Node: <span className="font-semibold font-mono text-green-600 dark:text-green-400 ml-1">{(node as ClientInstanceNode).localTargetAddress}</span>
             </p>
          )}
           {type === 'server' && (node as ServerInstanceNode).listeningTunnelAddress && (
             <p className="text-xs text-foreground mt-2 flex items-center">
                <LinkIcon className="h-4 w-4 mr-1.5 text-blue-600 dark:text-blue-400 shrink-0"/>
                监听: <span className="font-semibold font-mono text-blue-600 dark:text-blue-400 ml-1">{(node as ServerInstanceNode).listeningTunnelAddress}</span>
             </p>
          )}
           <p className={`text-xs mt-2 capitalize font-semibold ${node.status === 'running' ? 'text-green-500' : node.status === 'stopped' ? 'text-gray-500' : 'text-red-500'}`}>状态: {node.status}</p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs break-all bg-popover text-popover-foreground p-2 rounded shadow-lg">
        <p><span className="font-semibold">ID:</span> {node.id}</p>
        <p><span className="font-semibold">类型:</span> {node.type}</p>
        <p><span className="font-semibold">API:</span> {node.apiName} ({node.apiId})</p>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="container mx-auto px-2 sm:px-4 py-8 flex flex-col h-full">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-center sm:text-left">实例连接拓扑</h1>
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
                <div key={apiId} className="text-destructive-foreground bg-destructive p-3 rounded-md text-sm flex items-center shadow">
                  <AlertTriangle className="h-5 w-5 mr-2 shrink-0" /> {errorMsg}
                </div>
              )
            ))}
          </div>
        )}

        {isLoadingData && !isLoadingApiConfig && (
           <div className="flex justify-center items-center flex-grow">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-4 text-lg">加载拓扑数据中...</p>
          </div>
        )}

        {!isLoadingData && serverNodes.length === 0 && clientNodes.length === 0 && (
          <Card className="text-center py-10 shadow-lg flex-grow flex flex-col justify-center items-center bg-card">
            <CardHeader><CardTitle>无实例数据</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {apiConfigsList.length > 0 ? "未找到任何服务器或客户端实例。" : "请先配置API连接。"}
              </p>
              {fetchErrors.size > 0 && <p className="text-muted-foreground mt-2">部分API配置加载失败，可能影响结果。</p>}
            </CardContent>
          </Card>
        )}
        
        {!isLoadingData && (serverNodes.length > 0 || clientNodes.length > 0) && (
          <div className="flex-grow relative border border-border rounded-lg shadow-inner bg-background p-4 overflow-auto">
            <svg ref={svgRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
              <defs>
                <marker id="arrow-primary" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
                  <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
                </marker>
                <marker id="arrow-accent" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
                  <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--accent))" />
                </marker>
              </defs>
              {lines.map(line => (
                <line
                  key={line.id}
                  x1={line.startX} y1={line.startY}
                  x2={line.endX} y2={line.endY}
                  stroke={line.isInterApi ? "hsl(var(--accent))" : "hsl(var(--primary))"}
                  strokeWidth="2.5"
                  markerEnd={line.isInterApi ? "url(#arrow-accent)" : "url(#arrow-primary)"}
                  className="opacity-75 hover:opacity-100 transition-opacity"
                />
              ))}
            </svg>
            
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <section>
                    <h2 className="text-xl font-semibold mb-3 pb-2 border-b border-border text-primary flex items-center sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10 -mt-4 -mx-4 px-4 pt-4">
                        <ServerIcon className="mr-2.5 h-5 w-5"/>服务器实例 ({serverNodes.length})
                    </h2>
                    <div className="flex flex-col items-center md:items-start gap-3 pt-2"> {/* Changed to flex-col and items-center/start */}
                        {serverNodes.length > 0 ? serverNodes.map(sNode => renderNode(sNode, 'server')) : <p className="text-sm text-muted-foreground italic p-2">无服务器实例</p>}
                    </div>
                </section>

                <section>
                     <h2 className="text-xl font-semibold mb-3 pb-2 border-b border-border text-accent flex items-center sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10 -mt-4 -mx-4 px-4 pt-4">
                        <SmartphoneIcon className="mr-2.5 h-5 w-5"/>客户端实例 ({clientNodes.length})
                     </h2>
                     <div className="flex flex-col items-center md:items-start gap-3 pt-2"> {/* Changed to flex-col and items-center/start */}
                        {clientNodes.length > 0 ? clientNodes.map(cNode => renderNode(cNode, 'client')) : <p className="text-sm text-muted-foreground italic p-2">无客户端实例</p>}
                    </div>
                </section>
            </div>
          </div>
        )}
        
        <div className="mt-8 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground shadow-sm">
          <div className="flex items-center font-semibold mb-2"><Info className="h-4 w-4 mr-2 text-primary shrink-0" />拓扑说明</div>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>此视图显示从所有已配置的API源聚合的服务器和客户端实例。</li>
            <li>服务器通过其“监听”地址 (<code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code>) 与客户端的连接目标 (<code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code>) 匹配。</li>
            <li>客户端的“落地Node”是从其URL的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code> 解析的。</li>
            <li>连接线从客户端指向其连接的服务器。</li>
            <li><svg viewBox="0 0 10 1" className="inline-block h-2.5 mr-1 align-middle"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="hsl(var(--primary))" strokeWidth="1"/></svg>主色连接线表示客户端和服务器源自同一API配置。</li>
            <li><svg viewBox="0 0 10 1" className="inline-block h-2.5 mr-1 align-middle"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="hsl(var(--accent))" strokeWidth="1"/></svg>强调色连接线表示客户端和服务器源自不同API配置。</li>
          </ul>
        </div>
      </div>
    </TooltipProvider>
  );
}


    