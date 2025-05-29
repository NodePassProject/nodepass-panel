
"use client"

import React from 'react';
import Link from 'next/link';
import { Moon, Sun, Settings, LogOut, PlusCircle, Edit3, Check, Trash2, ListTree, Network, BarChartHorizontalBig } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  onManageApiConfigs: (configToEdit?: NamedApiConfig | null) => void;
  onClearActiveConfig?: () => void;
  hasActiveApiConfig: boolean;
}

export function Header({ onManageApiConfigs, onClearActiveConfig, hasActiveApiConfig }: HeaderProps) {
  const { setTheme, theme } = useTheme();
  const { apiConfigsList, activeApiConfig, setActiveApiConfigId, deleteApiConfig } = useApiConfig();
  const { toast } = useToast();
  const router = useRouter();

  const handleSwitchApiConfig = (id: string) => {
    const newActiveConf = apiConfigsList.find(c => c.id === id);
    setActiveApiConfigId(id);
     toast({
      title: '活动连接已切换',
      description: `已连接到 “${newActiveConf?.name}”。`,
    });
    router.push('/'); 
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <Link href="/" className="flex items-center" aria-label="主页">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2 text-primary">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h1 className="text-2xl font-bold tracking-tight">NodePass 管理器</h1>
          </Link>
           {activeApiConfig && (
            <span className="ml-2 text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full hidden sm:inline-block">
              已连接: {activeApiConfig.name}
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
              <Button variant="ghost" size="icon" aria-label="应用设置">
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>API 连接</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onManageApiConfigs(null)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>添加新连接</span>
              </DropdownMenuItem>

              <Link href="/connections" passHref legacyBehavior>
                <DropdownMenuItem>
                  <ListTree className="mr-2 h-4 w-4" />
                  <span>管理所有连接</span>
                </DropdownMenuItem>
              </Link>

              {apiConfigsList.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                     <Check className="mr-2 h-4 w-4 text-primary" />
                    <span>切换活动连接</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="max-h-60 overflow-y-auto">
                      {apiConfigsList.map(config => (
                        <DropdownMenuItem 
                          key={config.id} 
                          onClick={() => handleSwitchApiConfig(config.id)}
                          disabled={activeApiConfig?.id === config.id}
                        >
                          {activeApiConfig?.id === config.id && <Check className="mr-2 h-4 w-4 text-green-500" />}
                          <span className={`truncate ${activeApiConfig?.id !== config.id ? 'ml-6' : ''}`}>{config.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel>可视化与分析</DropdownMenuLabel>
               <Link href="/topology" passHref legacyBehavior>
                <DropdownMenuItem>
                  <Network className="mr-2 h-4 w-4" />
                  <span>连接拓扑图</span>
                </DropdownMenuItem>
              </Link>
              <Link href="/traffic" passHref legacyBehavior>
                <DropdownMenuItem>
                  <BarChartHorizontalBig className="mr-2 h-4 w-4" />
                  <span>流量统计</span>
                </DropdownMenuItem>
              </Link>

              {hasActiveApiConfig && onClearActiveConfig && (
                 <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onClearActiveConfig} className="text-destructive hover:!text-destructive focus:!text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>断开当前连接</span>
                  </DropdownMenuItem>
                 </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
