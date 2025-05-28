
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout'; // Import AppLayout
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { CreateInstanceDialog } from '@/components/nodepass/CreateInstanceDialog';
import { InstanceList } from '@/components/nodepass/InstanceList';
import { EventLog } from '@/components/nodepass/EventLog';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Loader2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';


export default function HomePage() {
  const { 
    activeApiConfig, 
    apiConfigsList,
    addOrUpdateApiConfig, 
    // clearActiveApiConfig, // Handled by AppLayout's Header
    isLoading: isLoadingApiConfig,
    setActiveApiConfigId 
  } = useApiConfig();
  const { toast } = useToast();
  
  // This dialog state is specific to HomePage for initial setup if no configs exist
  const [isApiConfigDialogOpenForSetup, setIsApiConfigDialogOpenForSetup] = useState(false);
  const [editingApiConfigForSetup, setEditingApiConfigForSetup] = useState<NamedApiConfig | null>(null);

  const [isCreateInstanceDialogOpen, setIsCreateInstanceDialogOpen] = useState(false);

  useEffect(() => {
    if (!isLoadingApiConfig && apiConfigsList.length === 0 && !activeApiConfig) {
      setEditingApiConfigForSetup(null); 
      setIsApiConfigDialogOpenForSetup(true);
    }
  }, [apiConfigsList, isLoadingApiConfig, activeApiConfig]);

  const handleSaveApiConfigForSetup = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setActiveApiConfigId(savedConfig.id); 
    setEditingApiConfigForSetup(null);
    setIsApiConfigDialogOpenForSetup(false);
    toast({
      title: configToSave.id ? '连接已更新' : '连接已添加',
      description: `“${savedConfig.name}”已保存并设为活动连接。`,
    });
  };
  
  // This function is specifically for the "Add API Connection" button on this page when no active config
  const handleOpenApiConfigDialogForSetup = () => {
    setEditingApiConfigForSetup(null);
    setIsApiConfigDialogOpenForSetup(true);
  };


  if (isLoadingApiConfig) {
    return (
      // AppLayout will render Header and Footer, so just the loading content here
      <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">加载 API 配置中...</p>
      </div>
    );
  }
  
  return (
    <AppLayout>
        {activeApiConfig ? (
          <div className="space-y-8">
            <div className="text-right">
              <Button onClick={() => setIsCreateInstanceDialogOpen(true)}>
                <PlusCircle className="mr-2 h-5 w-5" />
                创建新实例
              </Button>
            </div>
            <InstanceList />
            <EventLog />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-[calc(100vh-10rem-4rem)]"> {/* Adjust height considering header/footer in AppLayout */}
            <h2 className="text-2xl font-semibold mb-4">
              {apiConfigsList.length > 0 ? '未选择 API 连接' : '需要 API 连接'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {apiConfigsList.length > 0 
                ? '请从顶部设置菜单中选择一个 API 连接，或添加一个新的连接。' 
                : '请添加您的第一个 NodePass API 连接以开始管理实例。'}
            </p>
            {apiConfigsList.length === 0 && (
              <Button onClick={handleOpenApiConfigDialogForSetup} size="lg">
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
      {/* This ApiConfigDialog is for the initial setup if no configs exist */}
      <ApiConfigDialog
        open={isApiConfigDialogOpenForSetup}
        onOpenChange={setIsApiConfigDialogOpenForSetup}
        onSave={handleSaveApiConfigForSetup}
        currentConfig={editingApiConfigForSetup}
        isEditing={!!editingApiConfigForSetup}
      />
      <CreateInstanceDialog
        open={isCreateInstanceDialogOpen}
        onOpenChange={setIsCreateInstanceDialogOpen}
      />
    </AppLayout>
  );
}
