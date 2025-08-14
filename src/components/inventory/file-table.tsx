
'use client';

import React from 'react';
import type { File } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  ArrowUpDown,
  FileText,
  ImageIcon,
  Video,
  FileType,
  Folder as FolderIcon,
  Sparkles,
  BrainCircuit,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FileActions } from '@/components/shared/file-actions';

type SortKey = keyof File | 'name' | 'size' | 'lastModified';

const typeIcons: Record<File['type'], React.ReactNode> = {
  Document: <FileText className="size-4 text-muted-foreground" />,
  Spreadsheet: <FileText className="size-4 text-muted-foreground" />,
  Presentation: <FileText className="size-4 text-muted-foreground" />,
  Image: <ImageIcon className="size-4 text-muted-foreground" />,
  Video: <Video className="size-4 text-muted-foreground" />,
  PDF: <FileType className="size-4 text-muted-foreground" />,
  Folder: <FolderIcon className="size-4 text-muted-foreground" />,
  Other: <FileText className="size-4 text-muted-foreground" />,
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

type FileTableProps = {
  files: File[];
  onScoreFile: (file: File) => void;
  onCleanupSuggestion: (file: File) => void;
  isAiEnabled: boolean;
  isProcessing: boolean;
  onRefresh?: () => void;
};

export default function FileTable({
  files: initialFiles,
  onScoreFile,
  onCleanupSuggestion,
  isAiEnabled,
  isProcessing,
  onRefresh,
}: FileTableProps) {
  const [filter, setFilter] = React.useState('');
  const [sortConfig, setSortConfig] = React.useState<{
    key: SortKey;
    direction: 'asc' | 'desc';
  } | null>({ key: 'lastModified', direction: 'desc' });

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedAndFilteredFiles = React.useMemo(() => {
    let sortableItems = [...initialFiles];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key as keyof File];
        let valB = b[sortConfig.key as keyof File];
        
        // Handle Date objects specifically
        if (valA instanceof Date && valB instanceof Date) {
            valA = valA.getTime();
            valB = valB.getTime();
        }

        // Handle nulls by treating them as the lowest value
        if (valA === null) return 1;
        if (valB === null) return -1;

        if (valA < valB) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems.filter((file) =>
      file.name.toLowerCase().includes(filter.toLowerCase())
    );
  }, [initialFiles, filter, sortConfig]);

  const AiMenuItem = ({ onClick, file, disabled, children, tooltipText }: { onClick: (file: File) => void, file: File, disabled: boolean, children: React.ReactNode, tooltipText: string }) => {
    const item = (
       <DropdownMenuItem
          onClick={() => onClick(file)}
          disabled={!isAiEnabled || disabled}
        >
          {children}
        </DropdownMenuItem>
    );
    if (isAiEnabled) return item;

    return (
       <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="relative">{item}</div>
                </TooltipTrigger>
                <TooltipContent side="left">
                    <p>{tooltipText}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Filter files by name..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 max-w-sm"
        />
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('name')}>
                  Name <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('size')}>
                  Size <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('lastModified')}>
                  Last Modified <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </TableHead>
              <TableHead>Vault Score</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedAndFilteredFiles.map((file) => (
              <TableRow key={file.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {typeIcons[file.type]}
                    <span className="font-medium truncate max-w-xs">{file.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {file.isDuplicate && (
                    <Badge variant="destructive">Duplicate</Badge>
                  )}
                </TableCell>
                <TableCell>{formatBytes(file.size)}</TableCell>
                <TableCell>
                  {new Date(file.lastModified).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {file.vaultScore !== null ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="font-bold">{file.vaultScore}</div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>AI-generated score based on relevance</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">AI Actions</span>
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                         <AiMenuItem
                            onClick={onCleanupSuggestion}
                            file={file}
                            disabled={isProcessing}
                            tooltipText="Enable AI Mode to get cleanup suggestions."
                          >
                            <Sparkles className="mr-2 h-4 w-4" /> Suggest Cleanup
                         </AiMenuItem>
                         <AiMenuItem
                            onClick={onScoreFile}
                            file={file}
                            disabled={isProcessing}
                            tooltipText="Enable AI Mode to score files."
                          >
                            <BrainCircuit className="mr-2 h-4 w-4" /> Score Candidacy
                          </AiMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <FileActions file={file} onRefresh={onRefresh} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
