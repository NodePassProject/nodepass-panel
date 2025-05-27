
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Info, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

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
  apiUrl: string;
  prefixPath: string | null;
}

interface InterApiLink {
  sourceApiId: string;
  targetApiId: string;
  connections: { clientInstanceId: string; serverInstanceId: string; clientApiName: string; serverApiName: string }[];
  id: string; // Unique ID for the link, e.g., sourceApiId-targetApiId
  sourcePos?: { x: number; y: number };
  targetPos?: { x: number; y: number };
  type: 'intra-api' | 'inter-api'; // To differentiate link types
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
    // No / or ? after tunnel_addr, the whole restOfString is tunnel_addr
    // However, nodepass URLs MUST have a / to separate tunnel_addr and target_addr
    // If no path separator, it's likely an invalid URL for this parsing context or implies no target_addr
    if (pathSeparatorIndex === -1 && urlString.startsWith("client://")) return restOfString; // Client URL might just be client://host:port
    return pathSeparatorIndex !== -1 ? restOfString.substring(0, pathSeparatorIndex) : restOfString;

  }
  
  if (endOfTunnelAddr !== -1) {
    return restOfString.substring(0, endOfTunnelAddr);
  }
  return restOfString; // Should not happen if URL is valid with / or ?
}


function parseTargetAddr(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null;

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
    const defaultNodeWidth = 240; 
    const defaultNodeHeight = 110;
    const padding = 60; 
    const svgRect = svgContainerRef.current.getBoundingClientRect();
    const nodesPerRow = Math.max(1, Math.floor((svgRect.width - padding) / (defaultNodeWidth + padding)));

    apiConfigsList.forEach((apiConfig, index) => {
      const el = nodeRefs.current.get(apiConfig.id);
      if (el && svgContainerRef.current) {
         newApiNodes.push({
          id: apiConfig.id,
          name: apiConfig.name,
          x: el.offsetLeft + el.offsetWidth / 2, // Center X relative to its own position
          y: el.offsetTop + el.offsetHeight / 2, // Center Y relative to its own position
          width: el.offsetWidth,
          height: el.offsetHeight,
          apiUrl: apiConfig.apiUrl,
          prefixPath: apiConfig.prefixPath,
        });
      } else {
        const col = index % nodesPerRow;
        const row = Math.floor(index / nodesPerRow);
        newApiNodes.push({
            id: apiConfig.id,
            name: apiConfig.name,
            x: col * (defaultNodeWidth + padding) + padding + defaultNodeWidth / 2,
            y: row * (defaultNodeHeight + padding) + padding + defaultNodeHeight / 2,
            width: defaultNodeWidth,
            height: defaultNodeHeight,
            apiUrl: apiConfig.apiUrl,
            prefixPath: apiConfig.prefixPath,
        });
      }
    });
    setApiNodes(newApiNodes);

    const clientInstances = allInstances.filter(inst => inst.type === 'client');
    const serverInstances = allInstances.filter(inst => inst.type === 'server');
    const linksMap = new Map<string, InterApiLink>();

    clientInstances.forEach(client => {
      const clientTunnelAddr = parseTunnelAddr(client.url);
      if (!clientTunnelAddr) return;

      serverInstances.forEach(server => {
        const serverTargetAddr = parseTargetAddr(server.url);
        if (!serverTargetAddr) return;
        
        // Corrected logic: client's tunnel_addr links to server's target_addr
        if (clientTunnelAddr === serverTargetAddr) {
          const linkType = client.apiId === server.apiId ? 'intra-api' : 'inter-api';
          // Link ID based on the API configs involved
          const linkIdSortedApiIds = [client.apiId, server.apiId].sort();
          const linkId = `${linkIdSortedApiIds[0]}-${linkIdSortedApiIds[1]}`; // Ensures A-B is same as B-A for inter-api
          
          let link = linksMap.get(linkId);
          if (!link) {
            link = {
              id: linkId,
              sourceApiId: client.apiId, 
              targetApiId: server.apiId, 
              connections: [],
              type: linkType, // Set type based on whether APIs are same or different
            };
          }
          // Ensure type is inter-api if any connection within this group is inter-api
          if (linkType === 'inter-api') link.type = 'inter-api';

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
      // For source/target, always use the sorted IDs to ensure consistent line direction if preferred
      // Or, decide based on client/server (e.g. client API is source, server API is target)
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

      console.log("Topology: Starting to fetch data for all API configs:", apiConfigsList.length);
      for (const config of apiConfigsList) {
        console.log(`Topology: Fetching for config ID: ${config.id}, Name: ${config.name}`);
        const apiRoot = getApiRootUrl(config.id); 
        const token = getToken(config.id);

        if (!apiRoot || !token) {
          console.warn(`Topology: API config "${config.name}" (ID: ${config.id}) is incomplete. Skipping.`);
          currentErrors.set(config.id, `API 配置 "${config.name}" 不完整或无效。`);
          continue;
        }

        try {
          console.log(`Topology: Calling getInstances for ${apiRoot}`);
          const data = await nodePassApi.getInstances(apiRoot, token);
          console.log(`Topology: Received ${data.length} instances from ${config.name}`);
          combinedInstances.push(...data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name })));
        } catch (err: any) {
          console.error(`Topology: Error loading instances from API "${config.name}" (ID: ${config.id}):`, err);
          currentErrors.set(config.id, `从 "${config.name}" 加载实例失败: ${err.message || '未知错误'}`);
        }
      }
      
      console.log("Topology: All instance fetching complete. Total instances:", combinedInstances.length);
      setAllInstances(combinedInstances);
      setFetchErrors(currentErrors);
      
      const initialApiNodes = apiConfigsList.map(config => ({
        id: config.id,
        name: config.name,
        apiUrl: config.apiUrl,
        prefixPath: config.prefixPath,
        x: 0, y: 0, width: 220, height: 100 
      }));
      setApiNodes(initialApiNodes);

      setIsLoadingData(false); 
    };

    fetchAllData();
  }, [apiConfigsList, isLoadingApiConfig, getApiRootUrl, getToken]); // Removed calculateLayout, it's called separately

  useEffect(() => {
    if (!isLoadingData && apiConfigsList.length > 0 && allInstances.length > 0) {
        const timer = setTimeout(calculateLayout, 250); 
        
        const handleResize = () => {
            setTimeout(calculateLayout, 250); 
        };
        window.addEventListener('resize', handleResize);
        
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', handleResize);
        };
    } else if (!isLoadingData && apiConfigsList.length > 0 && allInstances.length === 0 && fetchErrors.size === 0) {
        // If no instances were found but also no errors, still attempt layout (might show empty API nodes)
        const timer = setTimeout(calculateLayout, 250);
        return () => clearTimeout(timer);
    }
  }, [isLoadingData, apiConfigsList, allInstances, calculateLayout, fetchErrors]);


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
        className="relative border p-4 rounded-lg shadow-lg flex-grow bg-background overflow-auto"
        style={{ minHeight: '500px' }} 
      >
        <svg width="100%" height="100%" className="absolute top-0 left-0 pointer-events-none z-0" style={{minWidth: '800px', minHeight: '600px'}}>
          <defs>
            <marker id="arrowhead-inter-api" markerWidth="10" markerHeight="7" 
                  refX="9" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"> 
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--accent))" />
            </marker>
            <marker id="arrowhead-intra-api" markerWidth="10" markerHeight="7" 
                  refX="9" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"> 
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
            </marker>
          </defs>
          {interApiLinks.map((link) => {
            if (!link.sourcePos || !link.targetPos || link.sourceApiId === link.targetApiId) return null; // Only draw inter-api links
            
            const dx = link.targetPos.x - link.sourcePos.x;
            const dy = link.targetPos.y - link.sourcePos.y;
            const angle = Math.atan2(dy, dx);
            const textX = link.sourcePos.x + dx / 2;
            const textY = link.sourcePos.y + dy / 2;
            const strokeColor = link.type === 'inter-api' ? 'hsl(var(--accent))' : 'hsl(var(--primary))';
            const markerEndUrl = link.type === 'inter-api' ? 'url(#arrowhead-inter-api)' : 'url(#arrowhead-intra-api)';

            return (
              <g key={link.id}>
                <line
                  x1={link.sourcePos.x}
                  y1={link.sourcePos.y}
                  x2={link.targetPos.x}
                  y2={link.targetPos.y}
                  stroke={strokeColor}
                  strokeWidth="2"
                  markerEnd={markerEndUrl}
                />
                <text
                  x={textX}
                  y={textY - 8} 
                  fill="hsl(var(--foreground))"
                  fontSize="10"
                  textAnchor="middle"
                  className="pointer-events-auto"
                  transform={`rotate(${angle * 180 / Math.PI}, ${textX}, ${textY})`}
                >
                  {link.connections.map(c => `C:${c.clientInstanceId.substring(0,4)}(${c.clientApiName.substring(0,3)}) ↔ S:${c.serverInstanceId.substring(0,4)}(${c.serverApiName.substring(0,3)})`).join('; ')}
                  <title>{link.connections.map(c => `客户端: ${c.clientInstanceId} (API: ${c.clientApiName}) 连接到 服务器: ${c.serverInstanceId} (API: ${c.serverApiName})`).join('\n')}</title>
                </text>
              </g>
            );
          })}
        </svg>

        <div className="relative z-10 flex flex-wrap gap-x-8 gap-y-12 p-4 items-start justify-around">
          {apiNodes.map((apiNode) => (
            <div
              key={apiNode.id}
              id={`api-node-${apiNode.id}`}
              ref={el => { if(el) nodeRefs.current.set(apiNode.id, el); else nodeRefs.current.delete(apiNode.id); }}
              className="p-4 border rounded-lg shadow-md bg-card hover:shadow-xl transition-shadow cursor-default w-60 transform hover:scale-105"
              title={`API 名称: ${apiNode.name}\nAPI URL: ${apiNode.apiUrl}${apiNode.prefixPath ? '/' + apiNode.prefixPath : ''}\nID: ${apiNode.id}`}
            >
              <div className="flex items-center text-primary mb-2 border-b pb-2">
                <Network className="h-5 w-5 mr-2 shrink-0" />
                <h3 className="font-semibold text-lg truncate" title={apiNode.name}>{apiNode.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground break-all">
                URL: {apiNode.apiUrl}
              </p>
              <p className="text-xs text-muted-foreground break-all mt-1">
                路径前缀: {apiNode.prefixPath || "/ (无)"}
              </p>
              <Badge variant="outline" className="mt-2 text-xs bg-muted text-muted-foreground">
                ID: {apiNode.id.substring(0, 8)}...
              </Badge>
            </div>
          ))}
           {apiNodes.length === 0 && !isLoadingData && (
             <div className="col-span-full text-center py-10 text-muted-foreground">
                {fetchErrors.size > 0 ? "部分 API 配置加载失败，无数据显示。" : "未找到 API 配置或所有 API 配置均无实例。"}
             </div>
           )}
        </div>
      </div>
       <div className="mt-4 p-3 bg-muted/20 rounded-md text-xs text-muted-foreground flex items-center space-x-2">
        <Info className="h-4 w-4 shrink-0 text-primary" />
        <span>此拓扑图显示不同 API 配置之间的连接。</span>
        <span className="font-semibold text-accent">强调色连线</span><span>表示跨 API 配置的连接。</span>
        {/* <span className="font-semibold text-primary">主色连线</span><span>表示同一 API 配置内的连接 (当前未显示)。</span> */}
        <span>连接基于一个 API 配置中客户端实例的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> 与另一 API 配置中服务器实例的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code> 匹配来推断。</span>
      </div>
    </div>
  );
}
