
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss } from 'lucide-react';
import type { InstanceEvent } from '@/types/nodepass';
import { useApiKey } from '@/hooks/use-api-key';
import { getApiBaseUrl } from '@/lib/api';


export function EventLog() {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const { apiKey } = useApiKey();

  useEffect(() => {
    // This is a placeholder. Real SSE connection needs careful handling of API key authentication.
    // Standard EventSource cannot send custom headers like X-API-Key.
    // If the server supports API key via query parameter (e.g., /events?apiKey=YOUR_KEY), that could be a workaround.
    if (!apiKey) {
      setEvents([{type: 'log', data: 'API Key not set. Event stream disabled.', timestamp: new Date().toISOString()}]);
      return;
    }
    
    setEvents([{type: 'log', data: 'Event stream initialized. Waiting for events...', timestamp: new Date().toISOString()}]);
    
    // Example of how EventSource would be set up IF auth was handled (e.g. via query param)
    // const eventSource = new EventSource(`${getApiBaseUrl()}/events?apiKey=${apiKey}`);
    // eventSource.onmessage = (event) => {
    //   try {
    //     const newEvent: InstanceEvent = JSON.parse(event.data);
    //     setEvents((prevEvents) => [newEvent, ...prevEvents.slice(0, 99)]); // Keep last 100 events
    //   } catch (error) {
    //     console.error("Failed to parse event data:", error);
    //     const errorEvent: InstanceEvent = { type: 'log', data: `Error parsing event: ${event.data}`, timestamp: new Date().toISOString() };
    //     setEvents((prevEvents) => [errorEvent, ...prevEvents.slice(0,99)]);
    //   }
    // };
    // eventSource.onerror = (error) => {
    //   console.error("EventSource error:", error);
    //   const errorEvent: InstanceEvent = { type: 'log', data: 'EventSource connection error.', timestamp: new Date().toISOString() };
    //   setEvents((prevEvents) => [errorEvent, ...prevEvents.slice(0,99)]);
    //   // eventSource.close(); // Or implement retry logic
    // };
    // return () => {
    //   eventSource.close();
    // };

  }, [apiKey]);


  return (
    <Card className="shadow-lg mt-6">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Rss className="mr-2 h-5 w-5 text-primary" />
          Real-Time Event Log
        </CardTitle>
        <CardDescription>
          Live updates from NodePass instances. (Note: Actual SSE connection might be limited by API key authentication method).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 w-full rounded-md border p-4">
          {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
          {events.map((event, index) => (
            <div key={index} className="mb-2 pb-2 border-b last:border-b-0 last:mb-0 text-xs">
              <div className="flex justify-between items-center">
                <Badge variant={
                    event.type.includes('created') ? 'default' : 
                    event.type.includes('updated') ? 'secondary' :
                    event.type.includes('deleted') ? 'destructive' : 'outline'
                } className="capitalize text-xs py-0.5 px-1.5">
                  {event.type.replace('_', ' ')}
                </Badge>
                <span className="text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 font-mono break-all">{typeof event.data === 'object' ? JSON.stringify(event.data) : event.data}</p>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

