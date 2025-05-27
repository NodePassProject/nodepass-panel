
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss } from 'lucide-react';
import type { InstanceEvent } from '@/types/nodepass';
import { useApiConfig } from '@/hooks/use-api-key';
// getEventsUrl is no longer needed here directly for EventSource construction
// import { getEventsUrl } from '@/lib/api';


export function EventLog() {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const { getApiRootUrl, apiConfig, getToken } = useApiConfig(); 
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiRoot = getApiRootUrl();
    const currentToken = getToken();
    
    if (!apiConfig || !apiRoot || !currentToken) {
      setEvents([{type: 'log', data: 'API 配置未设置或不完整。事件流已禁用。', timestamp: new Date().toISOString()}]);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }
    
    setEvents([{type: 'log', data: '正在通过代理初始化事件流...', timestamp: new Date().toISOString()}]);
    
    const actualNodePassEventsUrl = `${apiRoot}/events`;
    const proxyUrl = `/api/events-proxy?targetUrl=${encodeURIComponent(actualNodePassEventsUrl)}&token=${encodeURIComponent(currentToken)}`;
    // console.log(`Attempting to connect to EventSource via proxy: ${proxyUrl}`);

    if (eventSourceRef.current) {
        eventSourceRef.current.close();
    }

    // EventSource does not allow custom headers like X-API-Key.
    // We are using a Next.js API route as a proxy to add the header.
    const newEventSource = new EventSource(proxyUrl); // No withCredentials needed if proxy handles auth
    eventSourceRef.current = newEventSource;

    newEventSource.onopen = () => {
      setEvents((prevEvents) => [{type: 'log', data: '事件流已通过代理连接。等待事件...', timestamp: new Date().toISOString()}, ...prevEvents.filter(e => !e.data.startsWith('正在通过代理初始化事件流...'))]);
    };

    newEventSource.onmessage = (event) => {
      try {
        const newEventData = JSON.parse(event.data);
        const newEvent: InstanceEvent = {
            type: newEventData.type || 'log',
            data: newEventData.data || newEventData, 
            timestamp: newEventData.timestamp || new Date().toISOString()
        };
        setEvents((prevEvents) => [newEvent, ...prevEvents.slice(0, 99)]); 
      } catch (error) {
        console.error("无法解析事件数据:", error, "原始数据:", event.data);
        const errorEvent: InstanceEvent = { type: 'log', data: `解析事件错误: ${event.data}`, timestamp: new Date().toISOString() };
        setEvents((prevEvents) => [errorEvent, ...prevEvents.slice(0,99)]);
      }
    };

    newEventSource.onerror = (error) => {
      console.error("EventSource 错误:", error);
      let errorMessage = 'EventSource 连接错误。';
      if (newEventSource.readyState === EventSource.CLOSED) {
        errorMessage = 'EventSource 连接已关闭。可能由于代理或服务器端问题。';
      } else if (newEventSource.readyState === EventSource.CONNECTING) {
        errorMessage = 'EventSource 正在尝试重新连接...';
      }
      
      const errorEvent: InstanceEvent = { type: 'log', data: errorMessage, timestamp: new Date().toISOString() };
      setEvents((prevEvents) => [errorEvent, ...prevEvents.slice(0,99)]);
      // Optionally, close and nullify if it's a persistent error and not just a reconnect attempt.
      // if (newEventSource.readyState === EventSource.CLOSED) {
      //    newEventSource.close();
      //    eventSourceRef.current = null;
      // }
    };

    return () => {
      if (newEventSource) {
        newEventSource.close();
      }
      eventSourceRef.current = null;
    };

  }, [apiConfig, getApiRootUrl, getToken]);

  const getBadgeText = (type: InstanceEvent['type']): string => {
    if (type.includes('created')) return '已创建';
    if (type.includes('updated')) return '已更新';
    if (type.includes('deleted')) return '已删除';
    return '日志';
  }

  return (
    <Card className="shadow-lg mt-6">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Rss className="mr-2 h-5 w-5 text-primary" />
          实时事件日志
        </CardTitle>
        <CardDescription>
          来自 NodePass 实例的实时更新 (通过应用内代理)。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 w-full rounded-md border p-4">
          {events.length === 0 && <p className="text-sm text-muted-foreground">暂无事件。</p>}
          {events.map((event, index) => (
            <div key={index} className="mb-2 pb-2 border-b last:border-b-0 last:mb-0 text-xs">
              <div className="flex justify-between items-center">
                <Badge variant={
                    event.type.includes('created') ? 'default' : 
                    event.type.includes('updated') ? 'secondary' :
                    event.type.includes('deleted') ? 'destructive' : 'outline'
                } className="capitalize text-xs py-0.5 px-1.5">
                  {getBadgeText(event.type)}
                </Badge>
                <span className="text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString('zh-CN')}</span>
              </div>
              <p className="mt-1 font-mono break-all">{typeof event.data === 'object' ? JSON.stringify(event.data) : String(event.data)}</p>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
