
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss } from 'lucide-react';
import type { InstanceEvent } from '@/types/nodepass';
import { useApiConfig } from '@/hooks/use-api-key';
import { getEventsUrl } from '@/lib/api';


export function EventLog() {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const { getApiRootUrl, apiConfig } = useApiConfig(); // getToken is not directly used here anymore for EventSource
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiRootUrl = getApiRootUrl();
    
    if (!apiConfig || !apiRootUrl) { // Check for apiConfig as well to ensure settings are present
      setEvents([{type: 'log', data: 'API 配置未设置。事件流已禁用。', timestamp: new Date().toISOString()}]);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }
    
    setEvents([{type: 'log', data: '正在初始化事件流... (注意：EventSource 无法发送 X-API-Key 进行认证)', timestamp: new Date().toISOString()}]);
    
    // Get the base URL for events. Authentication via X-API-Key header is expected by the spec for /events,
    // but EventSource cannot send custom headers. The server might allow unauthenticated connections
    // or have other auth mechanisms (e.g., cookies, or a non-standard query param if implemented).
    const sseUrl = getEventsUrl(apiRootUrl);
    // console.log(`Attempting to connect to EventSource: ${sseUrl}`);

    if (eventSourceRef.current) {
        eventSourceRef.current.close();
    }

    const newEventSource = new EventSource(sseUrl, { withCredentials: true }); // withCredentials might be useful if server uses cookie-based auth for SSE
    eventSourceRef.current = newEventSource;

    newEventSource.onopen = () => {
      setEvents((prevEvents) => [{type: 'log', data: '事件流已连接。等待事件... (认证状态取决于服务器配置)', timestamp: new Date().toISOString()}, ...prevEvents.filter(e => !e.data.startsWith('正在初始化事件流...'))]);
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
        errorMessage = 'EventSource 连接已关闭。可能由于服务器端认证失败或网络问题。';
      } else if (newEventSource.readyState === EventSource.CONNECTING) {
        errorMessage = 'EventSource 正在尝试重新连接...';
      }
      
      const errorEvent: InstanceEvent = { type: 'log', data: errorMessage, timestamp: new Date().toISOString() };
      setEvents((prevEvents) => [errorEvent, ...prevEvents.slice(0,99)]);
    };

    return () => {
      if (newEventSource) {
        newEventSource.close();
      }
      eventSourceRef.current = null;
    };

  }, [apiConfig, getApiRootUrl]); // Depend on apiConfig directly to re-init if it changes

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
          来自 NodePass 实例的实时更新。能否成功认证取决于服务器对 EventSource 的支持。
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
