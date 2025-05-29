
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss, ChevronRight, ChevronDown, Server, Smartphone, Link2 } from 'lucide-react';
import type { Instance, InstanceEvent } from '@/types/nodepass'; // Ensure InstanceEvent is imported
import { getEventsUrl } from '@/lib/api';
import { InstanceStatusBadge } from './InstanceStatusBadge';

interface EventLogProps {
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
}

export function EventLog({ apiId, apiRoot, apiToken, apiName }: EventLogProps) {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const processSseMessageData = useCallback((messageBlock: string) => {
    let eventType = 'message'; // Default event type
    let eventDataLine = '';

    const lines = messageBlock.split('\n');
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        eventDataLine = line.substring('data:'.length).trim();
      }
    }

    if (eventType === 'instance' && eventDataLine) {
      try {
        const serverEventPayload = JSON.parse(eventDataLine);
        let frontendEventType: InstanceEvent['type'];
        let frontendEventData: any = serverEventPayload;
        let instanceDetailsPayload: Instance | undefined = serverEventPayload.instance;

        switch (serverEventPayload.type) {
          case 'initial':
          case 'create':
          case 'update':
          case 'delete':
            frontendEventType = serverEventPayload.type;
            // For these types, data field primarily stores instanceDetails if available
            frontendEventData = instanceDetailsPayload || serverEventPayload.data || {}; 
            break;
          case 'log':
            frontendEventType = 'log';
            frontendEventData = serverEventPayload.logs || `日志事件，但缺少 .logs 字段: ${JSON.stringify(serverEventPayload)}`;
            break;
          case 'shutdown':
            frontendEventType = 'shutdown';
            frontendEventData = "主控服务即将关闭。事件流已停止。";
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
            }
            break;
          default:
            console.warn("未知服务器事件类型 (fetch):", serverEventPayload.type, serverEventPayload);
            frontendEventType = 'log'; // Treat as log
            frontendEventData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload.instance || serverEventPayload)}`;
            break;
        }
        
        const newEventToLog: InstanceEvent = {
          type: frontendEventType,
          data: frontendEventData, // This could be an object for instance events, or string for logs
          instanceDetails: instanceDetailsPayload,
          timestamp: serverEventPayload.time || new Date().toISOString(),
        };
        setEvents((prevEvents) => [newEventToLog, ...prevEvents.slice(0, 99)]);
      } catch (error) {
        console.error("无法解析事件数据 (fetch):", error, "原始数据:", eventDataLine);
        const errorEventToLog: InstanceEvent = { type: 'log', data: `解析事件错误 (fetch): ${eventDataLine}`, timestamp: new Date().toISOString() };
        setEvents((prevEvents) => [errorEventToLog, ...prevEvents.slice(0, 99)]);
      }
    } else if (eventDataLine) {
      // Generic SSE message not specifically typed as 'instance'
      const genericEvent: InstanceEvent = {
        type: 'log', 
        data: `通用消息 (fetch): ${eventDataLine}`,
        timestamp: new Date().toISOString()
      };
      setEvents((prevEvents) => [genericEvent, ...prevEvents.slice(0, 99)]);
    }
  }, []);

  const connectWithFetch = useCallback(async () => {
    if (!apiId || !apiRoot || !apiToken || !apiName) {
      setEvents([{ type: 'log', data: `API 配置无效，事件流 (fetch) 禁用。`, timestamp: new Date().toISOString() }]);
      setIsConnected(false);
      setIsConnecting(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const eventsUrl = getEventsUrl(apiRoot);
    // Clear previous error/status messages and show connecting message
    setEvents(prev => [{ type: 'log', data: `正在初始化事件流 (fetch) 到 ${eventsUrl} (携带 X-API-Key)...`, timestamp: new Date().toISOString() }, 
      ...prev.filter(e => {
        if (typeof e.data === 'string') {
          return !e.data.startsWith('正在初始化') && !e.data.includes('错误') && !e.data.includes('已连接') && !e.data.includes('已禁用');
        }
        return true; // Keep non-string data (likely instance objects)
      })
    ]);
    setIsConnecting(true);
    setIsConnected(false);

    try {
      const response = await fetch(eventsUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': apiToken,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP 错误: ${response.status} ${response.statusText}. 详情: ${errorText.substring(0, 200)}`);
      }

      if (!response.body) {
        throw new Error("响应体为空，无法读取事件流。");
      }
      
      setEvents(prev => [{ type: 'log', data: `事件流 (fetch) 已连接。等待事件... (目标: ${eventsUrl})`, timestamp: new Date().toISOString() }, ...prev.filter(e => typeof e.data !== 'string' || (!e.data.startsWith('正在初始化') && !e.data.includes('错误')))]);
      setIsConnected(true);
      setIsConnecting(false);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (signal.aborted || done) {
          const reason = signal.aborted ? '已中止' : '已关闭 (done)';
          setIsConnected(false);
          setIsConnecting(false);
          if (!signal.aborted) { 
            setEvents(prev => [{ type: 'log', data: `事件流 (fetch) 连接已关闭。5秒后尝试重连... (目标: ${eventsUrl})`, timestamp: new Date().toISOString() }, ...prev]);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => connectWithFetch(), 5000);
          } else {
            setEvents(prev => [{ type: 'log', data: `SSE 连接 (fetch) 已中止。`, timestamp: new Date().toISOString() }, ...prev]);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const messageBlocks = buffer.split('\n\n');
        buffer = messageBlocks.pop() || ''; 

        for (const block of messageBlocks) {
          if (block.trim() !== '') {
            processSseMessageData(block);
          }
        }
      }
    } catch (error: any) {
      setIsConnected(false);
      setIsConnecting(false);
      let uiErrorMessage = `SSE 连接 (fetch) 尝试失败. 目标: ${eventsUrl}.`;
      if (signal.aborted) {
        uiErrorMessage = `SSE 连接 (fetch) 已中止。`;
        console.log('SSE connection (fetch) aborted by client.');
      } else {
        let reasonMessage = `原因: ${error.message || '未知网络错误'}.`;
        if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
          reasonMessage += ' 这通常是由于目标服务器的CORS策略阻止了请求, 或网络连接问题。请检查服务器CORS配置 (如 Access-Control-Allow-Origin) 和网络连通性。';
        }
        uiErrorMessage = `${baseMessage} ${reasonMessage} 查看服务器日志了解详情。5秒后尝试重连...`;
        console.error("EventLog: " + uiErrorMessage, error);

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => connectWithFetch(), 5000);
      }
      setEvents(prev => [{ type: 'log', data: uiErrorMessage, timestamp: new Date().toISOString() }, ...prev.slice(0, 99)]);
    }
  }, [apiId, apiRoot, apiToken, apiName, processSseMessageData]);

  useEffect(() => {
    if (apiId && apiRoot && apiToken) {
      connectWithFetch();
    } else {
      setEvents(prev => [{ type: 'log', data: '事件流：等待有效的API配置...', timestamp: new Date().toISOString() }, ...prev.slice(0,99)]);
      setIsConnected(false);
      setIsConnecting(false);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setEvents(prev => [{ type: 'log', data: `事件流 (fetch) 已断开。`, timestamp: new Date().toISOString() }, ...prev.slice(0,99)]);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setIsConnected(false);
      setIsConnecting(false);
    };
  }, [apiId, apiRoot, apiToken, apiName, connectWithFetch]); 

  const getBadgeTextAndVariant = (type: InstanceEvent['type']): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' } => {
    switch (type) {
      case 'initial': return { text: '初始', variant: 'default' };
      case 'create': return { text: '创建', variant: 'default' };
      case 'update': return { text: '更新', variant: 'secondary' };
      case 'delete': return { text: '删除', variant: 'destructive' };
      case 'log': return { text: '日志', variant: 'outline' };
      case 'shutdown': return { text: '关闭', variant: 'destructive'};
      case 'error': return { text: '错误', variant: 'destructive'};
      default: return { text: String(type).toUpperCase(), variant: 'outline'};
    }
  };

  const isExpandable = (event: InstanceEvent): boolean => {
    if (event.instanceDetails) return true;
    if (event.type === 'log' && typeof event.data === 'string' && event.data.length > 100) return true;
    if (['initial', 'create', 'update', 'delete'].includes(event.type) && typeof event.data === 'object' && event.data !== null && Object.keys(event.data).length > 0 && !event.instanceDetails) return true;
    return false;
  };

  let statusText = "等待连接...";
  if (isConnecting) statusText = "连接中...";
  else if (isConnected) statusText = "已连接";
  else if (events.length > 0 && typeof events[0].data === 'string' && (events[0].data.includes('错误') || events[0].data.includes('失败'))) statusText = "连接错误";
  else if (events.length > 0 && typeof events[0].data === 'string' && events[0].data.includes('禁用')) statusText = "已禁用";
  else statusText = "未连接";


  return (
    <Card className="shadow-lg mt-6">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Rss className="mr-2 h-5 w-5 text-primary" />
          实时事件日志
        </CardTitle>
        <CardDescription>
          NodePass 实例实时更新 (API: {apiName || 'N/A'}，通过 Fetch API 连接)。
          状态: <span className={`font-semibold ${isConnected ? 'text-green-500' : isConnecting ? 'text-yellow-500' : 'text-red-500'}`}>
            {statusText}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 w-full rounded-md border p-3 bg-muted/20 text-xs" ref={scrollAreaRef}>
          {events.length === 0 && <p className="text-sm text-muted-foreground">无事件。</p>}
          {events.map((event, index) => {
            const isExpanded = expandedIndex === index;
            const { text: badgeText, variant: badgeVariant } = getBadgeTextAndVariant(event.type);
            const instance = event.instanceDetails;
            const canExpand = isExpandable(event);

            return (
              <div key={index} className="py-1.5 border-b border-border/30 last:border-b-0 last:pb-0 first:pt-0">
                <div
                  className="flex items-start space-x-2"
                  onClick={() => canExpand && setExpandedIndex(isExpanded ? null : index)}
                  role={canExpand ? "button" : undefined}
                  tabIndex={canExpand ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (canExpand && (e.key === 'Enter' || e.key === ' ')) {
                      setExpandedIndex(isExpanded ? null : index);
                    }
                  }}
                  style={canExpand ? { cursor: 'pointer' } : {}}
                >
                   <div className="flex items-center shrink-0 w-6 h-[1.125rem]"> 
                    {canExpand && (
                      isExpanded ? <ChevronDown className="h-4 w-4 " /> : <ChevronRight className="h-4 w-4 " />
                    )}
                  </div>
                  <Badge variant={badgeVariant} className="py-0.5 px-1.5 shadow-sm whitespace-nowrap shrink-0">
                    {badgeText}
                  </Badge>
                  <div className="flex-grow min-w-0"> 
                    {event.type !== 'log' && instance ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight">
                        <span className="font-mono text-foreground/90">ID: {instance.id.substring(0, 8)}...</span>
                        <Badge
                          variant={instance.type === 'server' ? 'default' : 'accent'}
                          className="items-center whitespace-nowrap text-xs shrink-0"
                        >
                          {instance.type === 'server' ? <Server size={12} className="mr-1" /> : <Smartphone size={12} className="mr-1" />}
                          {instance.type === 'server' ? '服务器' : '客户端'}
                        </Badge>
                        <InstanceStatusBadge status={instance.status} />
                        <span className="font-mono truncate text-foreground/70" title={instance.url}>{instance.url.length > 30 ? instance.url.substring(0, 27) + '...' : instance.url}</span>
                      </div>
                    ) : (
                      <p className="font-mono break-words whitespace-pre-wrap text-foreground/90 leading-relaxed">
                        {typeof event.data === 'string' && (isExpanded || !canExpand || event.data.length <= 70) ? event.data : `${String(event.data).substring(0, 70)}...`}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap ml-auto pl-2 self-start shrink-0"> 
                    {new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                {isExpanded && canExpand && (
                  <div className="mt-2 ml-8 pl-4 border-l-2 border-muted/50 py-2 bg-background/30 rounded-r-md">
                    {instance ? (
                      <pre className="text-xs p-2 rounded-md overflow-x-auto bg-muted/40">
                        {JSON.stringify(instance, null, 2)}
                      </pre>
                    ) : event.type === 'log' && typeof event.data === 'string' ? (
                      <p className="font-mono break-all whitespace-pre-wrap text-foreground/90 leading-relaxed text-xs">
                        {event.data}
                      </p>
                    ) : typeof event.data === 'object' && event.data !== null && Object.keys(event.data).length > 0 ? (
                       <pre className="text-xs p-2 rounded-md overflow-x-auto bg-muted/40">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    ) : (
                       <p className="text-xs text-muted-foreground italic">无详情。</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
