
"use client";

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { CreateInstanceCard } from '@/components/nodepass/CreateInstanceCard';
import { InstanceList } from '@/components/nodepass/InstanceList';
import { EventLog } from '@/components/nodepass/EventLog';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';


export default function HomePage() {
  const { 
    activeApiConfig, 
    apiConfigsList,
    addOrUpdateApiConfig, 
    clearActiveApiConfig, 
    isLoading: isLoadingApiConfig,
    setActiveApiConfigId 
  } = useApiConfig();
  const { toast } = useToast();
  
  const [isApiConfigDialogOpen, setIsApiConfigDialogOpen] = useState(false);
  const [editingApiConfig, setEditingApiConfig] = useState<NamedApiConfig | null>(null);

  useEffect(() => {
    if (!isLoadingApiConfig && apiConfigsList.length === 0 && !activeApiConfig) {
      setEditingApiConfig(null); 
      setIsApiConfigDialogOpen(true);
    }
  }, [apiConfigsList, isLoadingApiConfig, activeApiConfig]);

  const handleSaveApiConfig = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setActiveApiConfigId(savedConfig.id); 
    setEditingApiConfig(null);
    setIsApiConfigDialogOpen(false);
    toast({
      title: configToSave.id ? '连接已更新' : '连接已添加',
      description: `“${savedConfig.name}”已保存并设为活动连接。`,
    });
  };
  
  const handleOpenApiConfigDialog = (configToEdit?: NamedApiConfig | null) => {
    setEditingApiConfig(configToEdit || null);
    setIsApiConfigDialogOpen(true);
  };

  const handleLogout = () => { 
    clearActiveApiConfig();
    toast({
      title: '已断开连接',
      description: '当前 API 连接已断开。',
    });
  };

  if (isLoadingApiConfig) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header 
          onManageApiConfigs={handleOpenApiConfigDialog} 
          hasActiveApiConfig={!!activeApiConfig} 
          onClearActiveConfig={handleLogout}
        />
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">加载 API 配置中...</p>
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header 
        onManageApiConfigs={handleOpenApiConfigDialog}
        hasActiveApiConfig={!!activeApiConfig} 
        onClearActiveConfig={handleLogout}
      />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeApiConfig ? (
          <div className="space-y-8">
            <CreateInstanceCard />
            {/* <BatchCreateInstancesCard /> Removed */}
            <InstanceList />
            <EventLog />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-[calc(100vh-10rem)]">
            <h2 className="text-2xl font-semibold mb-4">
              {apiConfigsList.length > 0 ? '未选择 API 连接' : '需要 API 连接'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {apiConfigsList.length > 0 
                ? '请从顶部设置菜单中选择一个 API 连接，或添加一个新的连接。' 
                : '请添加您的第一个 NodePass API 连接以开始管理实例。'}
            </p>
            {apiConfigsList.length === 0 && (
              <Button onClick={() => handleOpenApiConfigDialog(null)} size="lg">
                添加 API 连接
              </Button>
            )}
             {apiConfigsList.length > 0 && !activeApiConfig && (
              <p className="text-sm text-muted-foreground mt-4">
                您可以通过点击页面右上角的设置图标来选择、添加或管理 API 连接。
              </p>
            )}
          </div>
        )}
      </main>
      <ApiConfigDialog
        open={isApiConfigDialogOpen}
        onOpenChange={setIsApiConfigDialogOpen}
        onSave={handleSaveApiConfig}
        currentConfig={editingApiConfig}
        isEditing={!!editingApiConfig}
      />
      <footer className="py-6 text-center text-sm text-muted-foreground border-t">
        NodePass 管理器 &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
