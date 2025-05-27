
"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { createInstanceSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest } from '@/types/nodepass';
import { PlusCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiKey } from '@/hooks/use-api-key';


export function CreateInstanceCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { apiKey } = useApiKey();

  const form = useForm<z.infer<typeof createInstanceSchema>>({
    resolver: zodResolver(createInstanceSchema),
    defaultValues: {
      url: '',
    },
  });

  const createInstanceMutation = useMutation({
    mutationFn: (data: CreateInstanceRequest) => {
      if (!apiKey) throw new Error("API key is not available.");
      return nodePassApi.createInstance(data, apiKey);
    },
    onSuccess: () => {
      toast({
        title: 'Instance Created',
        description: 'The new instance has been created successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Error Creating Instance',
        description: error.message || 'An unknown error occurred.',
        variant: 'destructive',
      });
    },
  });

  function onSubmit(values: z.infer<typeof createInstanceSchema>) {
    createInstanceMutation.mutate(values);
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <PlusCircle className="mr-2 h-6 w-6 text-primary" />
          Create New Instance
        </CardTitle>
        <CardDescription>
          Provide the command URL to set up a new NodePass instance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="instance-url">Instance Command URL</FormLabel>
                  <FormControl>
                    <Input
                      id="instance-url"
                      placeholder="e.g., server://0.0.0.0:8080/example.com:80?tls=0"
                      {...field}
                      className="text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full sm:w-auto" disabled={createInstanceMutation.isPending}>
              {createInstanceMutation.isPending ? 'Creating...' : 'Create Instance'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
