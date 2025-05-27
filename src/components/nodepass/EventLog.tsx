
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss } from 'lucide-react';
import type { InstanceEvent } from '@/types/nodepass';
import { useApiConfig } from '@/hooks/use-api-key';
import { getEventsUrl } from '@/lib/api';


export function EventLog() {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const { getApiRootUrl, getToken } = useApiConfig();

  useEffect(() => {
    const apiRootUrl = getApiRootUrl();
    const token = getToken(); // Token might be needed for query param auth

    if (!apiRootUrl || !token) {
      setEvents([{type: 'log', data: 'API 配置未设置。事件流已禁用。', timestamp: new Date().toISOString()}]);
      return;
    }
    
    setEvents([{type: 'log', data: '事件流已初始化。等待事件...', timestamp: new Date().toISOString()}]);
    
    const sseUrl = getEventsUrl(apiRootUrl, token); // Pass token if SSE auth uses query params
    // console.log(`Attempting to connect to EventSource: ${sseUrl}`);

    // Standard EventSource cannot send custom headers. Authentication for SSE needs to be handled
    // by other means, e.g. cookies (if same-origin) or token in query parameter (if server supports it).
    // The current placeholder reflects this limitation.
    // const eventSource = new EventSource(sseUrl);
    // eventSource.onmessage = (event) => {
    //   try {
    //     const newEventData = JSON.parse(event.data);
    //     // Ensure the parsed data conforms to InstanceEvent structure, especially timestamp
    //     const newEvent: InstanceEvent = {
    //         type: newEventData.type || 'log',
    //         data: newEventData.data || newEventData,
    //         timestamp: newEventData.timestamp || new Date().toISOString()
    //     };
    //     setEvents((prevEvents) => [newEvent, ...prevEvents.slice(0, 99)]); // Keep last 100 events
    //   } catch (error) {
    //     console.error("无法解析事件数据:", error);
    //     const errorEvent: InstanceEvent = { type: 'log', data: `解析事件错误: ${event.data}`, timestamp: new Date().toISOString() };
    //     setEvents((prevEvents) => [errorEvent, ...prevEvents.slice(0,99)]);
    //   }
    // };
    // eventSource.onerror = (error) => {
    //   console.error("EventSource 错误:", error);
    //   const errorEvent: InstanceEvent = { type: 'log', data: 'EventSource 连接错误。', timestamp: new Date().toISOString() };
    //   setEvents((prevEvents) => [errorEvent, ...prevEvents.slice(0,99)]);
    //   // eventSource.close(); // Or implement retry logic
    // };
    // return () => {
    //   eventSource.close();
    // };

  }, [getApiRootUrl, getToken]);

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
          来自 NodePass 实例的实时更新。(注意: 实际的 SSE 连接可能受到 API 认证方法的限制)。
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
              <p className="mt-1 font-mono break-all">{typeof event.data === 'object' ? JSON.stringify(event.data) : event.data}</p>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
