
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Instance, UpdateInstanceRequest } from '@/types/nodepass';

interface InstanceControlsProps {
  instance: Instance;
  onAction: (instanceId: string, action: UpdateInstanceRequest['action']) => void;
  isLoading: boolean;
}

export function InstanceControls({ instance, onAction, isLoading }: InstanceControlsProps) {
  const handleAction = (action: UpdateInstanceRequest['action']) => {
    onAction(instance.id, action);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Instance Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleAction('start')}
          disabled={instance.status === 'running' || isLoading}
        >
          <Play className="mr-2 h-4 w-4" />
          Start
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleAction('stop')}
          disabled={instance.status === 'stopped' || isLoading}
        >
          <Square className="mr-2 h-4 w-4" />
          Stop
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleAction('restart')}
          disabled={isLoading}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
