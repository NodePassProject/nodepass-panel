
"use client";

import type { NextPage } from 'next';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Network, ServerIcon, SmartphoneIcon, Move, Link2, Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AppLayout } from '@/components/layout/AppLayout';
import { InstanceStatusBadge } from '@/components/nodepass/InstanceStatusBadge';
import { cn } from "@/lib/utils"; // Added import

interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

interface Position {
  x: number;
  y: number;
}

interface NodeBase extends InstanceWithApiDetails {
  position: Position;
}

interface ServerNode extends NodeBase {
  type: 'server';
  serverListeningAddress: string | null;
  serverForwardsToAddress: string | null;
}

interface ClientNode extends NodeBase {
  type: 'client';
  clientConnectsToServerAddress: string | null;
  localTargetAddress: string | null;
  connectedToServerId: string | null;
}

type DraggableNode = ServerNode | ClientNode;

interface ConnectionLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'intra-api' | 'inter-api';
}

interface DraggingNodeInfo {
  id: string;
  type: 'server' | 'client';
  initialMouseX: number;
  initialMouseY: number;
  initialNodeX: number;
  initialNodeY: number;
}

function parseTunnelAddr(urlString: string): string | null {
  try {
    const url = new URL(urlString);
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
  if (ipv6WithPortMatch) {
    return { host: ipv6WithPortMatch[1], port: ipv6WithPortMatch[2] };
  }
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

const NODE_WIDTH = 250; 
const NODE_HEIGHT = 130; 
const HORIZONTAL_SPACING = 100;
const VERTICAL_SPACING = 50;
const SERVER_COLUMN_X = 50;
const CLIENT_COLUMN_X = SERVER_COLUMN_X + NODE_WIDTH + HORIZONTAL_SPACING;

const TopologyPage: NextPage = () => {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();

  const [serverNodes, setServerNodes] = useState<ServerNode[]>([]);
  const [clientNodes, setClientNodes] = useState<ClientNode[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [lines, setLines] = useState<ConnectionLine[]>([]);

  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [draggingNodeInfo, setDraggingNodeInfo] = useState<DraggingNodeInfo | null>(null);

  const processAllInstanceData = useCallback((allInstances: InstanceWithApiDetails[]) => {
    let yPosServer = 50;
    const yPosClientMap = new Map<string, number>(); 

    const sNodes: ServerNode[] = [];
    const cNodes: ClientNode[] = [];

    const rawServers = allInstances.filter(inst => inst.type === 'server');
    const rawClients = allInstances.filter(inst => inst.type === 'client');

    rawServers.forEach(sInst => {
      sNodes.push({
        ...sInst,
        type: 'server',
        position: { x: SERVER_COLUMN_X, y: yPosServer },
        serverListeningAddress: parseTunnelAddr(sInst.url),
        serverForwardsToAddress: parseTargetAddr(sInst.url),
      });
      yPosServer += NODE_HEIGHT + VERTICAL_SPACING;
    });

    rawClients.forEach(cInst => {
      const clientConnectsTo = parseTunnelAddr(cInst.url);
      const { host: clientHostConnectsTo, port: clientPortConnectsTo } = splitHostPort(clientConnectsTo);
      let connectedServer: ServerNode | undefined = undefined;

      for (const sNode of sNodes) {
        const { host: serverHostListensOn, port: serverPortListensOn } = splitHostPort(sNode.serverListeningAddress);
        if (clientPortConnectsTo && serverPortListensOn && clientPortConnectsTo === serverPortListensOn) {
          const isServerHostWildcard = serverHostListensOn === '0.0.0.0' || serverHostListensOn === '::' || serverHostListensOn === '' || serverHostListensOn === null;
          if (isServerHostWildcard || clientHostConnectsTo === serverHostListensOn) {
            connectedServer = sNode;
            break;
          }
        }
      }
      
      let clientYPos = yPosServer + 50; 
      if (connectedServer) {
          const serverId = connectedServer.id;
          const currentClientYOffset = yPosClientMap.get(serverId) || connectedServer.position.y;
          clientYPos = currentClientYOffset;
          yPosClientMap.set(serverId, currentClientYOffset + NODE_HEIGHT + VERTICAL_SPACING / 3);
      }


      cNodes.push({
        ...cInst,
        type: 'client',
        position: { x: CLIENT_COLUMN_X, y: clientYPos },
        clientConnectsToServerAddress: clientConnectsTo,
        localTargetAddress: parseTargetAddr(cInst.url),
        connectedToServerId: connectedServer?.id || null,
      });
       if(!connectedServer) yPosServer += NODE_HEIGHT + VERTICAL_SPACING; 
    });

    setServerNodes(sNodes);
    setClientNodes(cNodes);
    setLastRefreshed(new Date());
  }, []);

  const fetchDataAndProcess = useCallback(async () => {
    if (isLoadingApiConfig) return;
    if (apiConfigsList.length === 0) {
      setIsLoadingData(false);
      setFetchErrors(new Map().set("global", "无API连接，请先添加。"));
      setServerNodes([]); setClientNodes([]); setLines([]);
      return;
    }

    setIsLoadingData(true);
    setFetchErrors(new Map());
    let combinedInstances: InstanceWithApiDetails[] = [];
    const currentErrors = new Map<string, string>();
    console.log("TopologyPage: Fetching data from all API configs:", apiConfigsList.map(c => c.name));

    for (const config of apiConfigsList) {
      const apiRoot = getApiRootUrl(config.id);
      const token = getToken(config.id);
      console.log(`TopologyPage: For config "${config.name}" (ID: ${config.id}), API Root: ${apiRoot}, Token Present: ${!!token}`);
      if (!apiRoot || !token) {
        currentErrors.set(config.id, `API配置 "${config.name}" 无效或不完整。`);
        continue;
      }
      try {
        const data = await nodePassApi.getInstances(apiRoot, token);
        console.log(`TopologyPage: Fetched ${data.length} instances from "${config.name}"`);
        combinedInstances.push(...data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name })));
      } catch (err: any) {
        console.error(`TopologyPage: Error fetching instances from "${config.name}":`, err);
        currentErrors.set(config.id, `加载 "${config.name}" 实例失败: ${err.message || '未知错误'}`);
      }
    }
    setFetchErrors(currentErrors);
    if (combinedInstances.length > 0) {
      processAllInstanceData(combinedInstances);
    } else {
      setServerNodes([]); 
      setClientNodes([]);
    }
    setIsLoadingData(false);
  }, [apiConfigsList, isLoadingApiConfig, getApiRootUrl, getToken, processAllInstanceData]);

  useEffect(() => {
    fetchDataAndProcess();
  }, [fetchDataAndProcess]);

  const calculateLines = useCallback(() => {
    if (!svgRef.current || !canvasRef.current || (serverNodes.length === 0 && clientNodes.length === 0)) {
      setLines([]);
      return;
    }
    const newLines: ConnectionLine[] = [];
    clientNodes.forEach(client => {
      if (client.connectedToServerId) {
        const clientEl = nodeRefs.current.get(`client-${client.id}`);
        const serverNode = serverNodes.find(s => s.id === client.connectedToServerId);
        const serverEl = serverNode ? nodeRefs.current.get(`server-${serverNode.id}`) : null;


        if (clientEl && serverEl && serverNode) {
          const clientRect = clientEl.getBoundingClientRect();
          const serverRect = serverEl.getBoundingClientRect();
          // const canvasRect = canvasRef.current!.getBoundingClientRect();

          const x1 = client.position.x; 
          const y1 = client.position.y + clientRect.height / 2;
          
          const x2 = serverNode.position.x + serverRect.width;
          const y2 = serverNode.position.y + serverRect.height / 2;
          
          newLines.push({
            id: `line-${client.id}-${serverNode.id}`,
            x1, y1, x2, y2,
            type: client.apiId === serverNode.apiId ? 'intra-api' : 'inter-api',
          });
        }
      }
    });
    setLines(newLines);
  }, [serverNodes, clientNodes, nodeRefs]);

  useEffect(() => {
    if (!isLoadingData && (serverNodes.length > 0 || clientNodes.length > 0)) {
      const timer = setTimeout(calculateLines, 150); 
      window.addEventListener('resize', calculateLines);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', calculateLines);
      };
    }
  }, [isLoadingData, serverNodes, clientNodes, calculateLines, draggingNodeInfo]);


  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, nodeId: string, nodeType: 'server' | 'client') => {
    e.preventDefault();
    e.stopPropagation();
    const node = nodeType === 'server' ? serverNodes.find(s => s.id === nodeId) : clientNodes.find(c => c.id === nodeId);
    if (!node || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseXInCanvas = e.clientX - canvasRect.left;
    const mouseYInCanvas = e.clientY - canvasRect.top;

    setDraggingNodeInfo({
      id: nodeId,
      type: nodeType,
      initialMouseX: mouseXInCanvas,
      initialMouseY: mouseYInCanvas,
      initialNodeX: node.position.x,
      initialNodeY: node.position.y,
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
    
    const nodeEl = nodeRefs.current.get(`${draggingNodeInfo.type}-${draggingNodeInfo.id}`);
    const nodeWidth = nodeEl?.offsetWidth || NODE_WIDTH;
    const nodeHeight = nodeEl?.offsetHeight || NODE_HEIGHT;

    newX = Math.max(0, Math.min(newX, canvasRef.current.scrollWidth - nodeWidth));
    newY = Math.max(0, Math.min(newY, canvasRef.current.scrollHeight - nodeHeight));

    if (draggingNodeInfo.type === 'server') {
      setServerNodes(prev => prev.map(s => s.id === draggingNodeInfo.id ? { ...s, position: { x: newX, y: newY } } : s));
    } else {
      setClientNodes(prev => prev.map(c => c.id === draggingNodeInfo.id ? { ...c, position: { x: newX, y: newY } } : c));
    }
  }, [draggingNodeInfo, nodeRefs]);

  const handleMouseUp = useCallback(() => {
    setDraggingNodeInfo(null);
  }, []);

  useEffect(() => {
    if (draggingNodeInfo) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNodeInfo, handleMouseMove, handleMouseUp]);

  const renderNode = (node: DraggableNode) => {
    const Icon = node.type === 'server' ? ServerIcon : SmartphoneIcon;
    const bgColor = node.type === 'server' ? 'bg-primary/10 border-primary/30' : 'bg-accent/10 border-accent/30';
    const title = node.type === 'server' ? '服务器实例' : '客户端实例';

    return (
      <Card
        key={`${node.type}-${node.id}`}
        ref={el => nodeRefs.current.set(`${node.type}-${node.id}`, el)}
        className={cn(
          "absolute shadow-md hover:shadow-lg transition-shadow cursor-grab p-3 rounded-lg",
          "w-[250px] h-auto min-h-[120px]", 
          bgColor
        )}
        style={{
          left: `${node.position.x}px`,
          top: `${node.position.y}px`,
          zIndex: draggingNodeInfo?.id === node.id ? 10 : 1,
          userSelect: 'none',
        }}
        onMouseDown={(e) => handleMouseDown(e, node.id, node.type)}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 mb-1.5">
              <Move className="h-4 w-4 text-muted-foreground hover:text-primary cursor-grab flex-shrink-0" />
              <Icon className={`h-5 w-5 ${node.type === 'server' ? 'text-primary' : 'text-accent'} flex-shrink-0`} />
              <h3 className="font-semibold text-sm truncate" title={node.apiName}>
                {node.apiName}
              </h3>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs break-all text-xs">
            <p>来源 API: {node.apiName} (ID: {node.apiId})</p>
            <p>{title} ID: {node.id}</p>
            <p>URL: {node.url}</p>
          </TooltipContent>
        </Tooltip>
        <div className="text-xs space-y-0.5 text-muted-foreground">
          <div className="flex items-center">
            <InstanceStatusBadge status={node.status} />
            <span className="ml-2 text-xs">(ID: {node.id.substring(0, 8)}...)</span>
          </div>
          {node.type === 'server' && (
            <>
              <p className="truncate" title={node.serverListeningAddress || 'N/A'}>监听: <span className="font-mono">{node.serverListeningAddress || 'N/A'}</span></p>
              <p className="truncate" title={node.serverForwardsToAddress || 'N/A'}>转发至: <span className="font-mono">{node.serverForwardsToAddress || 'N/A'}</span></p>
            </>
          )}
          {node.type === 'client' && (
            <>
              <p className="truncate" title={node.clientConnectsToServerAddress || 'N/A'}>连接至: <span className="font-mono">{node.clientConnectsToServerAddress || 'N/A'}</span></p>
              <p className="truncate text-green-600 dark:text-green-400" title={node.localTargetAddress || 'N/A'}>
                <Link2 className="inline-block h-3 w-3 mr-1"/>
                落地: <span className="font-mono">{node.localTargetAddress || 'N/A'}</span>
              </p>
            </>
          )}
        </div>
      </Card>
    );
  };

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

  const unconnectedClients = clientNodes.filter(c => !c.connectedToServerId);

  return (
    <AppLayout>
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">实例连接拓扑图</h1>
            <div className="flex items-center gap-2">
              {lastRefreshed && <span className="text-xs text-muted-foreground">刷新于: {lastRefreshed.toLocaleTimeString()}</span>}
              <Button variant="outline" onClick={fetchDataAndProcess} disabled={isLoadingData} size="sm">
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                {isLoadingData ? '刷新中...' : '刷新'}
              </Button>
              <Button variant="outline" onClick={calculateLines} disabled={isLoadingData} size="sm" title="重新计算连线">
                <Network className="mr-2 h-4 w-4" />
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

          {!isLoadingData && serverNodes.length === 0 && clientNodes.length === 0 && (
             <Card className="text-center py-10 shadow-lg flex-grow flex flex-col justify-center items-center bg-card">
              <CardHeader><CardTitle>无数据显示</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">{apiConfigsList.length > 0 ? "未找到任何服务器或客户端实例。" : "请先配置API连接。"}</p></CardContent>
            </Card>
          )}
          
          <div 
            ref={canvasRef}
            id="topology-canvas"
            className="relative flex-grow border rounded-lg p-4 bg-muted/5 overflow-auto min-h-[calc(100vh-20rem)] w-full" 
            style={{ touchAction: 'none' }} 
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
            
            {serverNodes.map(renderNode)}
            {clientNodes.filter(c => c.connectedToServerId).map(renderNode)}
            
          </div>

          {unconnectedClients.length > 0 && !isLoadingData && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center">
                <Link2Off className="h-5 w-5 mr-2 text-destructive"/>
                未连接的客户端实例
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unconnectedClients.map(client => (
                   <Card key={`unconn-${client.id}`} className="p-3 rounded-lg bg-accent/5 border-accent/20 shadow">
                     <div className="flex items-center gap-2 mb-1.5">
                        <SmartphoneIcon className="h-5 w-5 text-accent flex-shrink-0" />
                        <h3 className="font-semibold text-sm truncate" title={client.apiName}>
                          {client.apiName}
                        </h3>
                      </div>
                      <div className="text-xs space-y-0.5 text-muted-foreground">
                        <div className="flex items-center">
                          <InstanceStatusBadge status={client.status} />
                          <span className="ml-2 text-xs">(ID: {client.id.substring(0, 8)}...)</span>
                        </div>
                        <p className="truncate" title={client.clientConnectsToServerAddress || 'N/A'}>尝试连接: <span className="font-mono">{client.clientConnectsToServerAddress || 'N/A'}</span></p>
                        <p className="truncate text-green-600 dark:text-green-400" title={client.localTargetAddress || 'N/A'}>
                          <Link2 className="inline-block h-3 w-3 mr-1"/>
                          本地目标: <span className="font-mono">{client.localTargetAddress || 'N/A'}</span>
                        </p>
                        <p className="text-xs italic mt-1">未能连接到任何已知的服务器实例。</p>
                      </div>
                   </Card>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground shadow-sm">
            <div className="flex items-center font-semibold mb-2"><Network className="h-4 w-4 mr-2 text-primary shrink-0" />拓扑说明</div>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>此视图聚合所有API源的服务器和客户端实例。节点可拖动以调整布局。</li>
              <li>连接基于客户端 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> 与服务器 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (监听地址) 匹配 (端口及主机/通配符)。</li>
              <li>客户端“落地”地址指其 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code>。</li>
              <li><span className="inline-flex items-center mr-1.5 align-middle"><svg width="12" height="12" viewBox="0 0 12 12"><line x1="0" y1="6" x2="12" y2="6" stroke="hsl(var(--primary))" strokeWidth="2"/></svg></span><strong className="text-primary">主色连线</strong>: 服务器和客户端属于同一API配置。</li>
              <li><span className="inline-flex items-center mr-1.5 align-middle"><svg width="12" height="12" viewBox="0 0 12 12"><line x1="0" y1="6" x2="12" y2="6" stroke="hsl(var(--accent))" strokeWidth="2"/></svg></span><strong className="text-accent">强调色连线</strong>: 服务器和客户端属于不同API配置。</li>
              <li>未连接的客户端实例会单独列在图表下方。</li>
            </ul>
          </div>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
};

export default TopologyPage;


    