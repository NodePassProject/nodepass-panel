
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, Server, Smartphone, RefreshCw, Info } from 'lucide-react';
import { InstanceStatusBadge } from '@/components/nodepass/InstanceStatusBadge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

interface InstanceWithApiName extends Instance {
  apiName: string;
  apiId: string;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'server' | 'client';
  apiName: string;
}

interface Connection {
  from: string; // client instance id
  to: string;   // server instance id
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  type: 'intra-api' | 'inter-api'; // Type of connection
}

// Helper function to parse <tunnel_addr> from NodePass URL string
// scheme://<tunnel_addr>/<target_addr>?...
function parseTunnelAddr(urlString: string): string | null {
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
    // If no path or query separator, the rest of the string is the tunnel_addr
    return restOfString;
  }
  
  if (endOfTunnelAddr !== -1) {
    return restOfString.substring(0, endOfTunnelAddr);
  }
  return restOfString; // Fallback if only one separator is present
}

// Helper function to parse <target_addr> from NodePass URL string
// scheme://<tunnel_addr>/<target_addr>?...
function parseTargetAddr(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null;

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null; // No target_addr if no path separator

  const targetAndQuery = restOfString.substring(pathSeparatorIndex + 1);
  const querySeparatorIndex = targetAndQuery.indexOf('?');

  if (querySeparatorIndex !== -1) {
    return targetAndQuery.substring(0, querySeparatorIndex);
  }
  return targetAndQuery; // If no query params, the rest is target_addr
}


export default function TopologyPage() {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  const [allInstances, setAllInstances] = useState<InstanceWithApiName[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());

  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [connections, setConnections] = useState<Connection[]>([]);

  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const calculateLayout = useCallback(() => {
    if (allInstances.length === 0 || !svgContainerRef.current) return;

    const newPositions = new Map<string, NodePosition>();
    const svgRect = svgContainerRef.current.getBoundingClientRect();

    allInstances.forEach(inst => {
      const el = nodeRefs.current.get(inst.id);
      if (el) {
        newPositions.set(inst.id, {
          id: inst.id,
          type: inst.type,
          x: (el.offsetLeft + el.offsetWidth / 2) - svgContainerRef.current!.scrollLeft,
          y: (el.offsetTop + el.offsetHeight / 2) - svgContainerRef.current!.scrollTop,
          width: el.offsetWidth,
          height: el.offsetHeight,
          apiName: inst.apiName,
        });
      }
    });
    setNodePositions(newPositions);

    const newConnections: Connection[] = [];
    const clientInstances = allInstances.filter(inst => inst.type === 'client');
    const serverInstances = allInstances.filter(inst => inst.type === 'server');

    clientInstances.forEach(client => {
      const clientTunnelAddr = parseTunnelAddr(client.url); // Client's <tunnel_addr>
      const clientPos = newPositions.get(client.id);
      const clientApiId = client.apiId;

      if (clientTunnelAddr && clientPos) {
        serverInstances.forEach(server => {
          const serverTargetAddr = parseTargetAddr(server.url); // Server's <target_addr>
          const serverPos = newPositions.get(server.id);
          const serverApiId = server.apiId;
          
          if (serverTargetAddr && clientTunnelAddr === serverTargetAddr && serverPos) {
            newConnections.push({ 
              from: client.id, 
              to: server.id,
              fromPos: { x: clientPos.x, y: clientPos.y },
              toPos: { x: serverPos.x, y: serverPos.y },
              type: clientApiId === serverApiId ? 'intra-api' : 'inter-api',
            });
          }
        });
      }
    });
    setConnections(newConnections);
  }, [allInstances]);


  useEffect(() => {
    const fetchAllInstances = async () => {
      if (isLoadingApiConfig || apiConfigsList.length === 0) {
        setIsLoadingInstances(false);
        if (!isLoadingApiConfig && apiConfigsList.length === 0) {
            setFetchErrors(prev => new Map(prev).set("global", "没有配置任何 API 连接。"));
        }
        return;
      }

      setIsLoadingInstances(true);
      setFetchErrors(new Map());
      let combinedInstances: InstanceWithApiName[] = [];
      let currentErrors = new Map<string, string>();

      for (const config of apiConfigsList) {
        const apiRoot = getApiRootUrl(config.id);
        const token = getToken(config.id);

        if (!apiRoot || !token) {
          currentErrors.set(config.id, `API 配置 "${config.name}" 不完整或无效。`);
          continue;
        }

        try {
          const data = await nodePassApi.getInstances(apiRoot, token);
          combinedInstances.push(...data.map(inst => ({ ...inst, apiName: config.name, apiId: config.id })));
        } catch (err: any) {
          console.error(`加载实例失败，来自 API "${config.name}":`, err);
          currentErrors.set(config.id, `从 "${config.name}" 加载实例失败: ${err.message || '未知错误'}`);
        }
      }
      
      setAllInstances(combinedInstances);
      setFetchErrors(currentErrors);
      setIsLoadingInstances(false);
    };
    fetchAllInstances();
  }, [apiConfigsList, isLoadingApiConfig, getApiRootUrl, getToken]);

  useEffect(() => {
    if (allInstances.length > 0) {
      const handleResize = () => {
        setTimeout(calculateLayout, 150);
      };
      const timer = setTimeout(calculateLayout, 150); 

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        clearTimeout(timer);
      };
    }
  }, [allInstances, calculateLayout]);


  if (isLoadingApiConfig || isLoadingInstances) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">加载拓扑信息中...</p>
      </div>
    );
  }

  const globalError = fetchErrors.get("global");
  if (globalError) {
     return (
      <div className="container mx-auto px-4 py-8 text-center">
        <div className="text-destructive-foreground bg-destructive p-4 rounded-md inline-flex items-center">
          <AlertTriangle className="h-6 w-6 mr-2" />
          {globalError}
        </div>
        <Button onClick={() => router.push('/connections')} className="mt-4">前往连接管理</Button>
      </div>
    );
  }
  
  if (allInstances.length === 0 && !isLoadingInstances && fetchErrors.size === 0 && apiConfigsList.length > 0) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">所有已配置的 API 连接下均无实例可供显示拓扑。</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">实例连接拓扑图</h1>
         <Button variant="outline" onClick={calculateLayout} disabled={isLoadingInstances}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingInstances ? 'animate-spin' : ''}`} />
          刷新布局
        </Button>
      </div>
      <div className="flex items-center space-x-4 mb-4 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-0.5 bg-primary mr-2"></div>
            <span>同一 API 内连接</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-0.5 bg-accent mr-2"></div>
            <span>跨 API 连接</span>
          </div>
      </div>
      {fetchErrors.size > 0 && !globalError && (
        <div className="mb-4 space-y-2">
          {Array.from(fetchErrors.entries()).map(([apiId, errorMsg]) => (
            <div key={apiId} className="text-destructive-foreground bg-destructive p-3 rounded-md text-sm flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 shrink-0" />
              {errorMsg}
            </div>
          ))}
        </div>
      )}
      <div 
        ref={svgContainerRef}
        className="relative border p-4 rounded-lg shadow-lg flex-grow bg-muted/20 overflow-auto"
      >
        <svg width="100%" height="100%" className="absolute top-0 left-0 pointer-events-none z-0" style={{minWidth: '800px', minHeight: '600px'}}>
          <defs>
            <marker id="arrowhead-primary" markerWidth="10" markerHeight="7" 
                  refX="9" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"> 
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
            </marker>
            <marker id="arrowhead-accent" markerWidth="10" markerHeight="7" 
                  refX="9" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"> 
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--accent))" />
            </marker>
          </defs>
          {connections.map((conn, index) => (
            <line
              key={`conn-${index}-${conn.from}-${conn.to}`}
              x1={conn.fromPos.x}
              y1={conn.fromPos.y}
              x2={conn.toPos.x}
              y2={conn.toPos.y}
              stroke={conn.type === 'intra-api' ? "hsl(var(--primary))" : "hsl(var(--accent))"}
              strokeWidth="1.5"
              markerEnd={conn.type === 'intra-api' ? "url(#arrowhead-primary)" : "url(#arrowhead-accent)"}
            />
          ))}
        </svg>

        <div className="relative z-10 flex flex-wrap gap-6 p-4 items-start">
          {allInstances.map(instance => (
            <div
              key={instance.id}
              id={`node-${instance.id}`}
              ref={el => { if(el) nodeRefs.current.set(instance.id, el); else nodeRefs.current.delete(instance.id); }}
              className="p-3 border rounded-md shadow-sm bg-card hover:shadow-md transition-shadow cursor-default break-words w-56 flex flex-col space-y-1"
              title={`ID: ${instance.id}\nURL: ${instance.url}\n来源 API: ${instance.apiName} (ID: ${instance.apiId})\n类型: ${instance.type}`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm truncate">
                  {instance.type === 'server' ? 
                    <Server className="inline h-4 w-4 mr-1 text-blue-500"/> : 
                    <Smartphone className="inline h-4 w-4 mr-1 text-green-500"/>}
                  {instance.id.substring(0,8)}...
                </p>
                <InstanceStatusBadge status={instance.status} />
              </div>
              <Badge variant="secondary" className="text-xs self-start px-1.5 py-0.5">{instance.apiName}</Badge>
              <p className="text-xs text-muted-foreground truncate" title={instance.url}>
                {instance.type === 'client' ? 
                  `客户端连接到: ${parseTunnelAddr(instance.url) || 'N/A'}` : 
                  `服务器目标: ${parseTargetAddr(instance.url) || 'N/A'}`
                }
              </p>
            </div>
          ))}
          {allInstances.length === 0 && fetchErrors.size === 0 && !isLoadingInstances && (
             <p className="text-muted-foreground w-full text-center py-10">在所有配置的API中均未找到实例。</p>
          )}
        </div>
      </div>
       <div className="mt-4 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground flex items-center">
        <Info className="h-4 w-4 mr-2 shrink-0 text-primary" />
        拓扑连接是基于客户端 URL 中的 `<tunnel_addr>` 部分与服务器 URL 中的 `<target_addr>` 部分匹配来推断的。
      </div>
    </div>
  );
}

    