
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Info, Network, ServerIcon, SmartphoneIcon } from 'lucide-react'; // Added Network, ServerIcon, SmartphoneIcon
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

interface ApiNode {
  id: string; // API Config ID
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InterApiLink {
  sourceApiId: string;
  targetApiId: string;
  connections: { clientInstanceId: string; serverInstanceId: string; clientApiName: string; serverApiName: string }[];
  id: string; // Unique ID for the link, e.g., sourceApiId-targetApiId
  sourcePos?: { x: number; y: number };
  targetPos?: { x: number; y: number };
}

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
    return restOfString; // No / or ? after tunnel_addr
  }
  
  if (endOfTunnelAddr !== -1) {
    return restOfString.substring(0, endOfTunnelAddr);
  }
  return restOfString;
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

  if (querySeparatorIndex !== -1) {
    return targetAndQuery.substring(0, querySeparatorIndex);
  }
  return targetAndQuery;
}


export default function TopologyPage() {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  
  const [allInstances, setAllInstances] = useState<InstanceWithApiDetails[]>([]);
  const [apiNodes, setApiNodes] = useState<ApiNode[]>([]);
  const [interApiLinks, setInterApiLinks] = useState<InterApiLink[]>([]);
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());

  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const calculateLayout = useCallback(() => {
    if (apiConfigsList.length === 0 || !svgContainerRef.current) return;

    const newApiNodes: ApiNode[] = [];
    const svgRect = svgContainerRef.current.getBoundingClientRect();
    const nodeWidth = 220; // Approximate width of an API node card
    const nodeHeight = 100; // Approximate height
    const padding = 50;
    const nodesPerRow = Math.max(1, Math.floor((svgRect.width - padding) / (nodeWidth + padding)));


    apiConfigsList.forEach((apiConfig, index) => {
      const el = nodeRefs.current.get(apiConfig.id);
      if (el) {
         newApiNodes.push({
          id: apiConfig.id,
          name: apiConfig.name,
          x: el.offsetLeft + el.offsetWidth / 2 - svgContainerRef.current!.scrollLeft,
          y: el.offsetTop + el.offsetHeight / 2 - svgContainerRef.current!.scrollTop,
          width: el.offsetWidth,
          height: el.offsetHeight,
        });
      } else {
        // Fallback positioning if element not yet rendered (might happen on initial fast load)
        // This simple grid might not be ideal but prevents errors.
        const col = index % nodesPerRow;
        const row = Math.floor(index / nodesPerRow);
        newApiNodes.push({
            id: apiConfig.id,
            name: apiConfig.name,
            x: col * (nodeWidth + padding) + padding + nodeWidth / 2,
            y: row * (nodeHeight + padding) + padding + nodeHeight / 2,
            width: nodeWidth,
            height: nodeHeight,
        });
      }
    });
    setApiNodes(newApiNodes);


    // Identify inter-API instance connections
    const clientInstances = allInstances.filter(inst => inst.type === 'client');
    const serverInstances = allInstances.filter(inst => inst.type === 'server');
    const linksMap = new Map<string, InterApiLink>();

    clientInstances.forEach(client => {
      const clientTunnelAddr = parseTunnelAddr(client.url);
      if (!clientTunnelAddr) return;

      serverInstances.forEach(server => {
        if (client.apiId === server.apiId) return; // Skip intra-API connections for this visualization

        const serverTargetAddr = parseTargetAddr(server.url);
        if (!serverTargetAddr) return;

        if (clientTunnelAddr === serverTargetAddr) {
          const linkId = [client.apiId, server.apiId].sort().join('-');
          let link = linksMap.get(linkId);
          if (!link) {
            link = {
              id: linkId,
              sourceApiId: client.apiId, // Or server.apiId, depends on how you want to draw
              targetApiId: server.apiId,
              connections: [],
            };
          }
          link.connections.push({ 
            clientInstanceId: client.id, 
            serverInstanceId: server.id,
            clientApiName: client.apiName,
            serverApiName: server.apiName,
          });
          linksMap.set(linkId, link);
        }
      });
    });

    const finalLinks = Array.from(linksMap.values()).map(link => {
      const sourceNode = newApiNodes.find(n => n.id === link.sourceApiId);
      const targetNode = newApiNodes.find(n => n.id === link.targetApiId);
      if (sourceNode && targetNode) {
        return {
          ...link,
          sourcePos: { x: sourceNode.x, y: sourceNode.y },
          targetPos: { x: targetNode.x, y: targetNode.y },
        };
      }
      return null;
    }).filter(Boolean) as InterApiLink[];
    
    setInterApiLinks(finalLinks);

  }, [apiConfigsList, allInstances]);


  useEffect(() => {
    const fetchAllData = async () => {
      if (isLoadingApiConfig) return;
      
      setIsLoadingData(true);
      setFetchErrors(new Map());
      
      if (apiConfigsList.length === 0) {
        setFetchErrors(prev => new Map(prev).set("global", "没有配置任何 API 连接。"));
        setAllInstances([]);
        setApiNodes([]);
        setInterApiLinks([]);
        setIsLoadingData(false);
        return;
      }

      let combinedInstances: InstanceWithApiDetails[] = [];
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
          combinedInstances.push(...data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name })));
        } catch (err: any) {
          console.error(`加载实例失败，来自 API "${config.name}":`, err);
          currentErrors.set(config.id, `从 "${config.name}" 加载实例失败: ${err.message || '未知错误'}`);
        }
      }
      
      setAllInstances(combinedInstances);
      setFetchErrors(currentErrors);
      
      // Initial API nodes setup based on configs (positions will be refined by calculateLayout)
      const initialApiNodes = apiConfigsList.map(config => ({
        id: config.id,
        name: config.name,
        x: 0, y: 0, width: 200, height: 80 // Placeholder dimensions
      }));
      setApiNodes(initialApiNodes);

      setIsLoadingData(false);
    };

    fetchAllData();
  }, [apiConfigsList, isLoadingApiConfig, getApiRootUrl, getToken]);

  useEffect(() => {
     // Calculate layout once data is loaded and elements are potentially in DOM
    if (!isLoadingData && apiConfigsList.length > 0 && allInstances.length >= 0) {
        const timer = setTimeout(calculateLayout, 150); // Ensure DOM elements are available
        
        const handleResize = () => {
            setTimeout(calculateLayout, 150); 
        };
        window.addEventListener('resize', handleResize);
        
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', handleResize);
        };
    }
  }, [isLoadingData, apiConfigsList, allInstances, calculateLayout]);


  if (isLoadingApiConfig || isLoadingData) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">加载 API 配置和实例拓扑信息中...</p>
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
  
  if (apiConfigsList.length === 0 && !isLoadingData) {
     return (
      <div className="container mx-auto px-4 py-8 text-center">
         <div className="text-muted-foreground bg-muted p-4 rounded-md inline-flex items-center">
          <Info className="h-6 w-6 mr-2" />
          请先添加 API 连接才能查看拓扑图。
        </div>
        <Button onClick={() => router.push('/connections')} className="mt-4">前往连接管理</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">API 配置连接拓扑图</h1>
         <Button variant="outline" onClick={calculateLayout} disabled={isLoadingData}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
          刷新布局
        </Button>
      </div>
      
      {fetchErrors.size > 0 && !globalError && (
        <div className="mb-4 space-y-2">
          {Array.from(fetchErrors.entries()).map(([apiId, errorMsg]) => (
            apiId !== "global" && (
              <div key={apiId} className="text-destructive-foreground bg-destructive p-3 rounded-md text-sm flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 shrink-0" />
                {errorMsg}
              </div>
            )
          ))}
        </div>
      )}

      <div 
        ref={svgContainerRef}
        className="relative border p-4 rounded-lg shadow-lg flex-grow bg-muted/20 overflow-auto"
        style={{ minHeight: '500px' }}
      >
        <svg width="100%" height="100%" className="absolute top-0 left-0 pointer-events-none z-0" style={{minWidth: '800px', minHeight: '600px'}}>
          <defs>
            <marker id="arrowhead-inter-api" markerWidth="10" markerHeight="7" 
                  refX="9" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"> 
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--accent))" />
            </marker>
          </defs>
          {interApiLinks.map((link) => {
            if (!link.sourcePos || !link.targetPos) return null;
            const dx = link.targetPos.x - link.sourcePos.x;
            const dy = link.targetPos.y - link.sourcePos.y;
            const angle = Math.atan2(dy, dx);
            const textX = link.sourcePos.x + dx / 2;
            const textY = link.sourcePos.y + dy / 2;

            return (
              <g key={link.id}>
                <line
                  x1={link.sourcePos.x}
                  y1={link.sourcePos.y}
                  x2={link.targetPos.x}
                  y2={link.targetPos.y}
                  stroke="hsl(var(--accent))"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead-inter-api)"
                />
                {/* Basic text label for connection */}
                <text
                  x={textX}
                  y={textY - 5} // Offset text above the line
                  fill="hsl(var(--foreground))"
                  fontSize="10"
                  textAnchor="middle"
                  className="pointer-events-auto" // Allow text to be interactive if needed later
                  transform={`rotate(${angle * 180 / Math.PI}, ${textX}, ${textY})`}
                >
                  {link.connections.map(c => `${c.clientInstanceId.substring(0,4)}..->${c.serverInstanceId.substring(0,4)}..`).join(', ')}
                  <title>{link.connections.map(c => `Client: ${c.clientInstanceId} (${c.clientApiName}) connects to Server: ${c.serverInstanceId} (${c.serverApiName})`).join('\n')}</title>
                </text>
              </g>
            );
          })}
        </svg>

        <div className="relative z-10 flex flex-wrap gap-6 p-4 items-start justify-around">
          {apiConfigsList.map((apiConfig, index) => (
            <div
              key={apiConfig.id}
              id={`api-node-${apiConfig.id}`}
              ref={el => { if(el) nodeRefs.current.set(apiConfig.id, el); else nodeRefs.current.delete(apiConfig.id); }}
              className="p-4 border rounded-lg shadow-md bg-card hover:shadow-lg transition-shadow cursor-default w-56"
              title={`API Name: ${apiConfig.name}\nAPI URL: ${apiConfig.apiUrl}${apiConfig.prefixPath ? '/' + apiConfig.prefixPath : ''}\nID: ${apiConfig.id}`}
            >
              <div className="flex items-center text-primary mb-2">
                <Network className="h-5 w-5 mr-2" />
                <h3 className="font-semibold text-lg truncate">{apiConfig.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground break-all">
                URL: {apiConfig.apiUrl}
              </p>
              <p className="text-xs text-muted-foreground break-all">
                Prefix: {apiConfig.prefixPath || "/ (none)"}
              </p>
            </div>
          ))}
        </div>
      </div>
       <div className="mt-4 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground flex items-center">
        <Info className="h-4 w-4 mr-2 shrink-0 text-primary" />
        此拓扑图显示不同 API 配置之间的连接。连接基于客户端实例的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> 与另一 API 配置中服务器实例的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code> 匹配来推断。
      </div>
    </div>
  );
}
    

    