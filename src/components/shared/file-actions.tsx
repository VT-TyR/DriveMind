'use client';

import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFileOperations } from '@/contexts/file-operations-context';
import { File } from '@/lib/types';
import { isFileOpsEnabledClient } from '@/lib/feature-flags';
import {
  MoreHorizontal,
  Move,
  Trash2,
  Edit,
  Copy,
  FolderPlus,
  Download,
  RotateCcw,
} from 'lucide-react';

interface FileActionsProps {
  file: File;
  onRefresh?: () => void;
}

export function FileActions({ file, onRefresh }: FileActionsProps) {
  if (!isFileOpsEnabledClient()) {
    return null;
  }
  const {
    moveFileOperation,
    deleteFileOperation,
    restoreFileOperation,
    renameFileOperation,
    addToBatch,
    isProcessing,
  } = useFileOperations();

  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [newName, setNewName] = useState(file.name);
  const [targetFolderId, setTargetFolderId] = useState('');

  const handleRename = async () => {
    if (!newName.trim() || newName === file.name) return;
    
    try {
      await renameFileOperation(file.id, file.name, newName.trim());
      setShowRenameDialog(false);
      onRefresh?.();
    } catch (error) {
      // Error handling is done in the context
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFileOperation(file.id, file.name);
      setShowDeleteDialog(false);
      onRefresh?.();
    } catch (error) {
      // Error handling is done in the context
    }
  };

  const handleMove = async () => {
    if (!targetFolderId.trim()) return;
    
    try {
      await moveFileOperation(file.id, file.name, targetFolderId);
      setShowMoveDialog(false);
      onRefresh?.();
    } catch (error) {
      // Error handling is done in the context
    }
  };

  const handleRestore = async () => {
    try {
      await restoreFileOperation(file.id, file.name);
      onRefresh?.();
    } catch (error) {
      // Error handling is done in the context
    }
  };

  const addToBatchMove = () => {
    addToBatch('move', file.id, file.name, { newParentId: 'root' }); // Default to root
  };

  const addToBatchDelete = () => {
    addToBatch('delete', file.id, file.name);
  };

  const addToBatchRename = () => {
    addToBatch('rename', file.id, file.name, { newName: `${file.name}_copy` });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={isProcessing}
          >
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowRenameDialog(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowMoveDialog(true)}>
            <Move className="mr-2 h-4 w-4" />
            Move
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={addToBatchMove}>
            <Copy className="mr-2 h-4 w-4" />
            Add move to batch
          </DropdownMenuItem>
          <DropdownMenuItem onClick={addToBatchRename}>
            <Copy className="mr-2 h-4 w-4" />
            Add rename to batch
          </DropdownMenuItem>
          <DropdownMenuItem onClick={addToBatchDelete}>
            <Copy className="mr-2 h-4 w-4" />
            Add delete to batch
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {file.isDuplicate && (
            <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete duplicate
            </DropdownMenuItem>
          )}
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Move to trash
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRestore}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              Enter a new name for "{file.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim() || newName === file.name}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to trash</DialogTitle>
            <DialogDescription>
              Are you sure you want to move "{file.name}" to trash? You can restore it later if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Move to trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move file</DialogTitle>
            <DialogDescription>
              Enter the folder ID where you want to move "{file.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="folder" className="text-right">
                Folder ID
              </Label>
              <Input
                id="folder"
                value={targetFolderId}
                onChange={(e) => setTargetFolderId(e.target.value)}
                placeholder="Enter folder ID or 'root' for root directory"
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMove} disabled={!targetFolderId.trim()}>
              Move file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface BatchOperationsPanelProps {
  onRefresh?: () => void;
}

export function BatchOperationsPanel({ onRefresh }: BatchOperationsPanelProps) {
  const { operations, executeBatch, clearBatch, getBatchSize, isProcessing } = useFileOperations();
  const batchSize = getBatchSize();

  if (batchSize === 0) {
    return null;
  }

  const handleExecute = async () => {
    await executeBatch();
    onRefresh?.();
  };

  return (
    <div className="sticky bottom-4 mx-4 p-4 bg-background border rounded-lg shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderPlus className="h-4 w-4" />
          <span className="font-medium">
            {batchSize} operation{batchSize !== 1 ? 's' : ''} queued
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearBatch}
            disabled={isProcessing}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Execute All'}
          </Button>
        </div>
      </div>
      
      {operations.length > 0 && (
        <div className="mt-2 max-h-32 overflow-y-auto">
          {operations.map((op) => (
            <div key={op.id} className="flex items-center justify-between py-1 text-sm">
              <span className="truncate">
                {op.type} "{op.fileName}"
              </span>
              <span className={`px-2 py-1 rounded text-xs ${
                op.status === 'completed' ? 'bg-green-100 text-green-800' :
                op.status === 'failed' ? 'bg-red-100 text-red-800' :
                op.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {op.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
