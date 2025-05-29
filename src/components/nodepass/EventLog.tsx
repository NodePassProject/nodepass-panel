
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss, ChevronRight, ChevronDown, Server, Smartphone, Link2 } from 'lucide-react';
import type { Instance } from '@/types/nodepass';
import { getEventsUrl } from '@/lib/api';
import { InstanceStatusBadge } from './InstanceStatusBadge';

export interface InstanceEvent {
  type: 'initial' | 'create' | 'update' | 'delete' | 'log' | 'shutdown' | 'error';
  data: any;
  instanceDetails?: Instance;
  timestamp: string;
}

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
            frontendEventData = instanceDetailsPayload || {};
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
            frontendEventType = 'log';
            frontendEventData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload.instance || serverEventPayload)}`;
            break;
        }

        const newEventToLog: InstanceEvent = {
          type: frontendEventType,
          data: frontendEventData,
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
      // This case handles generic messages not specifically typed as 'instance'
      // It might be useful for debugging if the server sends other event types or untyped data.
      console.log("收到通用 SSE 消息 (fetch, 非 'instance' 事件):", eventDataLine);
      const genericEvent: InstanceEvent = {
        type: 'log', // Treat as a log for display purposes
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
    setEvents(prev => [{ type: 'log', data: `正在初始化事件流 (fetch) 到 ${eventsUrl} (携带 X-API-Key)...`, timestamp: new Date().toISOString() }, ...prev.filter(e => !e.data.startsWith('正在初始化') && !e.data.includes('错误') && !e.data.includes('已连接') && !e.data.includes('已禁用'))]);
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
      
      setIsConnected(true);
      setIsConnecting(false);
      setEvents(prev => [{ type: 'log', data: `事件流 (fetch) 已连接。等待事件... (目标: ${eventsUrl})`, timestamp: new Date().toISOString() }, ...prev.filter(e => !e.data.startsWith('正在初始化') && !e.data.includes('错误'))]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (signal.aborted || done) {
          const reason = signal.aborted ? '已中止' : '已关闭 (done)';
          console.log(`事件流 (fetch) ${reason}。`);
          setIsConnected(false);
          setIsConnecting(false);
          if (!signal.aborted) { // Only reconnect if not intentionally aborted
            setEvents(prev => [{ type: 'log', data: `事件流 (fetch) 连接已关闭。5秒后尝试重连... (目标: ${eventsUrl})`, timestamp: new Date().toISOString() }, ...prev]);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => connectWithFetch(), 5000);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        // SSE messages are separated by double newlines.
        // A single newline might be part of a multi-line data field.
        const messageBlocks = buffer.split('\n\n');
        buffer = messageBlocks.pop() || ''; // Keep the last incomplete message block

        for (const block of messageBlocks) {
          if (block.trim() !== '') {
            processSseMessageData(block);
          }
        }
      }
    } catch (error: any) {
      setIsConnected(false);
      setIsConnecting(false);
      if (signal.aborted) {
        console.log('SSE 连接 (fetch) 已由客户端中止。');
        setEvents(prev => [{ type: 'log', data: `SSE 连接 (fetch) 已中止。`, timestamp: new Date().toISOString() }, ...prev]);
      } else {
        // This is the section that logs the "Failed to fetch" error
        const baseMessage = `SSE 连接 (fetch) 尝试失败. 目标: ${eventsUrl}.`;
        let reasonMessage = `原因: ${error.message || '未知网络错误'}.`;
        if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
          reasonMessage += ' 这通常是由于目标服务器的CORS策略阻止了请求, 或网络连接问题。请检查服务器CORS配置 (如 Access-Control-Allow-Origin) 和网络连通性。';
        }
        const fullErrorMessage = `${baseMessage} ${reasonMessage} 查看服务器日志了解详情。5秒后尝试重连...`;
        
        console.error("EventLog: " + fullErrorMessage, error); // Log the original error object too for full details

        setEvents(prev => [{ type: 'log', data: fullErrorMessage, timestamp: new Date().toISOString() }, ...prev.slice(0, 99)]);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => connectWithFetch(), 5000);
      }
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
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // Add a generic disconnected message on unmount if it wasn't an abort
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          setEvents(prev => [{ type: 'log', data: `事件流 (fetch) 已断开。`, timestamp: new Date().toISOString() }, ...prev.slice(0,99)]);
      }
      setIsConnected(false);
      setIsConnecting(false);
    };
  // connectWithFetch is memoized and its dependencies are apiId, apiRoot, apiToken, apiName, processSseMessageData
  // processSseMessageData is also memoized.
  // So, this effect should re-run only when apiId, apiRoot, apiToken, or apiName change.
  }, [apiId, apiRoot, apiToken, apiName, connectWithFetch]); 

  const getBadgeTextAndVariant = (type: InstanceEvent['type']): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' } => {
    switch (type) {
      case 'initial': return { text: '初始', variant: 'default' };
      case 'create': return { text: '创建', variant: 'default' };
      case 'update': return { text: '更新', variant: 'secondary' };
      case 'delete': return { text: '删除', variant: 'destructive' };
      case 'log': return { text: '日志', variant: 'outline' };
      case 'shutdown': return { text: '关闭', variant: 'destructive'};
      case 'error': return { text: '错误', variant: 'destructive'}; // For UI-reported errors
      default: return { text: String(type).toUpperCase(), variant: 'outline'};
    }
  };

  const isExpandable = (event: InstanceEvent): boolean => {
    if (event.instanceDetails) return true;
    if (event.type === 'log' && typeof event.data === 'string' && event.data.length > 100) return true; // Expand long log messages
    if (['initial', 'create', 'update', 'delete'].includes(event.type) && typeof event.data === 'object' && event.data !== null && !event.instanceDetails) return true; // If data is object but not yet in instanceDetails
    return false;
  };

  let statusText = "等待连接...";
  if (isConnecting) statusText = "连接中...";
  else if (isConnected) statusText = "已连接";
  // Check the latest event for error messages
  else if (events.length > 0 && typeof events[0].data === 'string' && events[0].data.includes('错误')) statusText = "连接错误";
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
                   <div className="flex items-center shrink-0 w-6 h-[1.125rem]"> {/* Standard height for icon area */}
                    {canExpand && (
                      isExpanded ? <ChevronDown className="h-4 w-4 " /> : <ChevronRight className="h-4 w-4 " />
                    )}
                  </div>
                  <Badge variant={badgeVariant} className="py-0.5 px-1.5 shadow-sm whitespace-nowrap shrink-0">
                    {badgeText}
                  </Badge>
                  <div className="flex-grow min-w-0"> {/* Ensure this div can shrink and grow */}
                    {event.type !== 'log' && instance ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight">
                        <span className="font-mono text-foreground/90">ID: {instance.id.substring(0, 8)}...</span>
                        <Badge
                          variant={instance.type === 'server' ? 'default' : 'accent'}
                          className="items-center whitespace-nowrap text-xs shrink-0" // Added shrink-0
                        >
                          {instance.type === 'server' ? <Server size={12} className="mr-1" /> : <Smartphone size={12} className="mr-1" />}
                          {instance.type === 'server' ? '服务器' : '客户端'}
                        </Badge>
                        <InstanceStatusBadge status={instance.status} />
                        <span className="font-mono truncate text-foreground/70" title={instance.url}>{instance.url.length > 30 ? instance.url.substring(0, 27) + '...' : instance.url}</span>
                      </div>
                    ) : (
                      // For log messages, allow words to break to prevent overflow
                      <p className="font-mono break-words whitespace-pre-wrap text-foreground/90 leading-relaxed">
                        {typeof event.data === 'string' && (isExpanded || !canExpand || event.data.length <= 70) ? event.data : `${String(event.data).substring(0, 70)}...`}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap ml-auto pl-2 self-start shrink-0"> {/* Added shrink-0 */}
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
                    ) : typeof event.data === 'object' && event.data !== null ? (
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
