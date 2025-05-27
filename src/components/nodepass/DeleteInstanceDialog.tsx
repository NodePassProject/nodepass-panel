
"use client";

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Instance } from '@/types/nodepass';

interface DeleteInstanceDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: (instanceId: string) => void;
  isLoading: boolean;
}

export function DeleteInstanceDialog({
  instance,
  open,
  onOpenChange,
  onConfirmDelete,
  isLoading,
}: DeleteInstanceDialogProps) {
  if (!instance) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Instance</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete instance <span className="font-semibold">{instance.id}</span>?
            This action cannot be undone. The instance URL is <span className="font-semibold break-all">{instance.url}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirmDelete(instance.id)}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
