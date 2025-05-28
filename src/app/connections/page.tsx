
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { PlusCircle, Edit3, Trash2, CheckCircle, Power } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AppLayout } from '@/components/layout/AppLayout'; // Import AppLayout

export default function ConnectionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    apiConfigsList,
    activeApiConfig,
    addOrUpdateApiConfig,
    deleteApiConfig,
    setActiveApiConfigId,
    isLoading: isLoadingApiConfig,
  } = useApiConfig();

  const [isApiConfigDialogOpen, setIsApiConfigDialogOpen] = useState(false);
  const [editingApiConfig, setEditingApiConfig] = useState<NamedApiConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<NamedApiConfig | null>(null);


  const handleOpenApiConfigDialog = (configToEdit?: NamedApiConfig | null) => {
    setEditingApiConfig(configToEdit || null);
    setIsApiConfigDialogOpen(true);
  };

  const handleSaveApiConfig = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const savedConfig = addOrUpdateApiConfig(configToSave);
    // setActiveApiConfigId(savedConfig.id); // Optionally set new/updated config as active
    setEditingApiConfig(null);
    setIsApiConfigDialogOpen(false);
    toast({
      title: configToSave.id ? '连接已更新' : '连接已添加',
      description: `“${savedConfig.name}”已保存。`,
    });
  };

  const handleSetActive = (id: string) => {
    setActiveApiConfigId(id);
    toast({
      title: '活动连接已切换',
      description: `现在已连接到 “${apiConfigsList.find(c => c.id === id)?.name}”。`,
    });
    router.push('/'); // Navigate to homepage after setting active
  };

  const handleDeleteConfirm = () => {
    if (deletingConfig) {
      deleteApiConfig(deletingConfig.id);
      toast({
        title: '连接已删除',
        description: `“${deletingConfig.name}”已被删除。`,
        variant: 'destructive',
      });
      setDeletingConfig(null);
    }
  };
  
  if (isLoadingApiConfig) {
    return (
      <AppLayout>
        <div className="text-center">
          <p>加载 API 连接中...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">API 连接管理</h1>
        <Button onClick={() => handleOpenApiConfigDialog(null)} size="lg">
          <PlusCircle className="mr-2 h-5 w-5" />
          添加新连接
        </Button>
      </div>

      {apiConfigsList.length === 0 ? (
        <Card className="text-center py-10">
          <CardHeader>
            <CardTitle>没有已保存的连接</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">您还没有添加任何 API 连接。</p>
            <p className="text-muted-foreground">点击上方的“添加新连接”按钮开始。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apiConfigsList.map((config) => (
            <Card key={config.id} className={`flex flex-col justify-between shadow-lg hover:shadow-xl transition-shadow duration-200 ${activeApiConfig?.id === config.id ? 'border-primary ring-2 ring-primary' : ''}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xl break-all">{config.name}</CardTitle>
                  {activeApiConfig?.id === config.id && (
                    <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
                  )}
                </div>
                <CardDescription className="break-all text-xs pt-1">
                  URL: {config.apiUrl}
                  {config.prefixPath && `/${config.prefixPath}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                {/* Additional details can be added here if needed */}
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenApiConfigDialog(config)}
                  aria-label={`编辑连接 ${config.name}`}
                >
                  <Edit3 className="mr-1 h-4 w-4" />
                  编辑
                </Button>
                 <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => setDeletingConfig(config)}
                      aria-label={`删除连接 ${config.name}`}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      删除
                    </Button>
                  </AlertDialogTrigger>
                  {deletingConfig && deletingConfig.id === config.id && (
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>
                          您确定要删除连接 “{deletingConfig.name}” 吗？此操作无法撤销。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingConfig(null)}>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteConfirm}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          删除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  )}
                </AlertDialog>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleSetActive(config.id)}
                  disabled={activeApiConfig?.id === config.id}
                  aria-label={`激活连接 ${config.name}`}
                >
                  <Power className="mr-1 h-4 w-4" />
                  {activeApiConfig?.id === config.id ? '当前活动' : '设为活动'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <ApiConfigDialog
        open={isApiConfigDialogOpen}
        onOpenChange={setIsApiConfigDialogOpen}
        onSave={handleSaveApiConfig}
        currentConfig={editingApiConfig}
        isEditing={!!editingApiConfig}
      />
    </AppLayout>
  );
}
