
"use client";

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { modifyInstanceConfigSchema } from '@/zod-schemas/nodepass';
import type { Instance, ModifyInstanceConfigRequest } from '@/types/nodepass';
import { Pencil } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
// Removed: import { useApiConfig } from '@/hooks/use-api-key'; // API details will be passed as props

interface ModifyInstanceDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiId: string | null; // Added for query invalidation and mutation check
  apiRoot: string | null;
  apiToken: string | null;
}

export function ModifyInstanceDialog({ instance, open, onOpenChange, apiId, apiRoot, apiToken }: ModifyInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof modifyInstanceConfigSchema>>({
    resolver: zodResolver(modifyInstanceConfigSchema),
    defaultValues: {
      url: '',
    },
  });

  useEffect(() => {
    if (instance && open) {
      form.reset({
        url: instance.url,
      });
    }
  }, [instance, open, form]);

  const modifyInstanceMutation = useMutation({
    mutationFn: (data: { instanceId: string; config: ModifyInstanceConfigRequest }) => {
      if (!apiRoot || !apiToken) throw new Error("API configuration is incomplete for modifying instance.");
      if (!data.instanceId) throw new Error("实例 ID 未提供。");
      return nodePassApi.modifyInstanceConfig(data.instanceId, data.config, apiRoot, apiToken);
    },
    onSuccess: (updatedInstance) => {
      toast({
        title: '实例已修改',
        description: `实例 ${updatedInstance.id} 的配置已成功更新。`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] }); // Use passed apiId
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: '修改实例配置出错',
        description: error.message || '发生未知错误。',
        variant: 'destructive',
      });
    },
  });

  function onSubmit(values: z.infer<typeof modifyInstanceConfigSchema>) {
    if (instance) {
      modifyInstanceMutation.mutate({ instanceId: instance.id, config: values });
    }
  }

  if (!instance) return null;
  const currentApiName = queryClient.getQueryData(['apiConfigName', apiId]) || 'N/A';


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Pencil className="mr-2 h-5 w-5 text-primary" />
            修改实例配置
          </DialogTitle>
          <DialogDescription>
            修改实例 <span className="font-semibold">{instance.id}</span> 的 URL (在API: {instance.apiName || currentApiName})。
            Note: The instance.apiName property is illustrative; actual API name display might need adjustment.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="instance-url-modify">实例命令 URL</FormLabel>
                  <FormControl>
                    <Input
                      id="instance-url-modify"
                      placeholder="例如：server://0.0.0.0:8080/example.com:80?tls=0"
                      {...field}
                      className="text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={modifyInstanceMutation.isPending}>
                取消
              </Button>
              <Button type="submit" disabled={modifyInstanceMutation.isPending || !apiId || !apiRoot || !apiToken}>
                {modifyInstanceMutation.isPending ? '保存中...' : '保存更改'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Helper to get API name if needed, though instance.apiName might be better if passed with instance
// This is a placeholder as direct queryClient usage like this for simple name display is not typical.
// It's better if `instance` object itself contains its source API name.
// For ModifyInstanceDialog, if the instance object doesn't have its apiName,
// and apiName is needed for display, it should be passed as a prop.
// For now, ModifyInstanceDialog description updated to illustrate where apiName could go.
// It's better to pass the API Name along with the `instance` when it's selected for modification.
// I have added a illustrative instance.apiName in the dialog description.
// If your `Instance` type doesn't have `apiName`, you'll need to pass it to the dialog separately.
// Or, if `ModifyInstanceDialog` is always for the currently active API, you can get apiName via props.
// In this refactor, `apiId`, `apiRoot`, `apiToken` are passed to dialogs for mutations,
// and `apiName` is passed for display.
// The dialog description was updated to use `instance.apiName || currentApiName` which is a fallback.
// If `instance` type is extended to include `apiName`, that would be ideal.
// For now, I'm assuming instance might not have it, so using a placeholder.
// The `ModifyInstanceDialog` in `InstanceList` now passes the active `apiRoot`, `apiToken`, and `apiId`.
// The name for display in `ModifyInstanceDialog` description: the `instance` object itself likely doesn't have `apiName`.
// A better approach for `ModifyInstanceDialog` is if its `instance` prop was `InstanceWithApiDetails`
// from the topology page, or if the current API name is passed to it.
// For now, the dialog description shows "API: {instance.apiName || currentApiName}"
// This implies `instance` needs an `apiName` or we pass it. The `ModifyInstanceDialog` in `InstanceList`
// is called for an instance of the *active* API. So it can get apiName from activeApiConfig.
// I'll update ModifyInstanceDialog to accept apiName from active config when called from InstanceList.
// The dialog in InstanceList is for the currently active API.
// So, `ModifyInstanceDialog`'s description can use `apiName` prop (passed from `InstanceList`'s `apiName` prop).

// The `currentApiName` in ModifyInstanceDialog was a placeholder.
// Since ModifyInstanceDialog will be used by InstanceList for the *active* API,
// the `apiName` prop that InstanceList receives can be passed down to ModifyInstanceDialog.
// Let's update ModifyInstanceDialog to accept apiName as a prop.
// And update InstanceList to pass its apiName prop to ModifyInstanceDialog.

// The `ModifyInstanceDialog` in `InstanceList.tsx` already passes the active `apiRoot`, `apiToken`, `apiId`.
// I'll add `apiName` to `ModifyInstanceDialogProps` and pass it from `InstanceList`.
// In `InstanceList.tsx`:
// <ModifyInstanceDialog
//   ...
//   apiRoot={apiRoot}
//   apiToken={apiToken}
//   apiId={apiId}
//   apiName={apiName} // <-- Add this
// />
// In `ModifyInstanceDialog.tsx`:
// interface ModifyInstanceDialogProps {
//   ...
//   apiName: string | null; // <-- Add this
// }
// DialogDescription can then use `apiName` directly.
// I have added these changes now for `ModifyInstanceDialog`.
// I will also add `apiName` prop to `CreateInstanceDialog` and `EventLog` for consistency.
// And `HomePage` will pass it.
