
"use client"

import React from 'react';
import { Moon, Sun, Settings, LogOut, PlusCircle, Edit3, Server, Check, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
  DropdownMenuPortal
} from "@/components/ui/dropdown-menu"
import { useApiConfig } from '@/hooks/use-api-key';

interface HeaderProps {
  onManageApiConfigs: () => void; // Opens dialog to edit current or add new
  onClearActiveConfig?: () => void;
  hasActiveApiConfig: boolean;
}

export function Header({ onManageApiConfigs, onClearActiveConfig, hasActiveApiConfig }: HeaderProps) {
  const { setTheme, theme } = useTheme();
  const { apiConfigsList, activeApiConfig, setActiveApiConfigId, deleteApiConfig } = useApiConfig();

  const handleSwitchApiConfig = (id: string) => {
    setActiveApiConfigId(id);
  };

  const handleDeleteApiConfig = (id: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent DropdownMenuItem onClick from closing the menu
    if (window.confirm(`您确定要删除连接 "${apiConfigsList.find(c=>c.id === id)?.name}" 吗？`)) {
      deleteApiConfig(id);
    }
  };


  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2 text-primary">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 className="text-2xl font-bold tracking-tight">NodePass 管理器</h1>
           {activeApiConfig && (
            <span className="ml-2 text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full hidden sm:inline-block">
              已连接到: {activeApiConfig.name}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label="切换主题"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="用户设置">
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>API 连接</DropdownMenuLabel>
              {apiConfigsList.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Server className="mr-2 h-4 w-4" />
                    <span>切换连接</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      {apiConfigsList.map(config => (
                        <DropdownMenuItem key={config.id} onClick={() => handleSwitchApiConfig(config.id)} className="justify-between">
                          <div className="flex items-center">
                            {activeApiConfig?.id === config.id && <Check className="mr-2 h-4 w-4 text-green-500" />}
                            <span>{config.name}</span>
                          </div>
                           <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-destructive hover:text-destructive/80"
                              onClick={(e) => handleDeleteApiConfig(config.id, e)}
                              aria-label={`删除连接 ${config.name}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                        </DropdownMenuItem>
                      ))}
                       <DropdownMenuSeparator />
                       <DropdownMenuItem onClick={onManageApiConfigs}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        <span>添加新连接...</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
               <DropdownMenuItem onClick={onManageApiConfigs}>
                {hasActiveApiConfig ? <Edit3 className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                <span>{hasActiveApiConfig ? '编辑当前连接' : '添加新连接'}</span>
              </DropdownMenuItem>
              {hasActiveApiConfig && onClearActiveConfig && (
                 <DropdownMenuItem onClick={onClearActiveConfig}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>断开当前连接</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
