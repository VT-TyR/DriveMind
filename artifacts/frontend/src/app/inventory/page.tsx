'use client';

/**
 * File inventory with advanced filtering and bulk operations
 * Implements ALPHA-CODENAME v1.4 data management standards
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { RouteGuard } from '@/components/auth/route-guard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/auth-provider';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import apiClient, { FileInfo } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useMobile } from '@/hooks/use-mobile';
import { 
  Files, 
  Search,
  Filter,
  Download,
  Trash2,
  MoreHorizontal,
  SortAsc,
  SortDesc,
  Eye,
  FolderOpen,
  Calendar,
  HardDrive,
  Loader2,
  RefreshCw,
  FileText,
  Image,
  Video,
  FileSpreadsheet,
  FileBarChart,
  Archive,
  Star,
  Copy,
  Move,
  Edit,
  Share,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SortField = 'name' | 'size' | 'lastModified' | 'type' | 'vaultScore';
type SortDirection = 'asc' | 'desc';
type FileType = 'Document' | 'Spreadsheet' | 'Presentation' | 'Image' | 'Video' | 'PDF' | 'Folder' | 'Other' | 'all';
type ViewMode = 'table' | 'grid' | 'list';

interface FilterState {
  search: string;
  type: FileType;
  sizeMin: number | null;
  sizeMax: number | null;
  dateFrom: string;
  dateTo: string;
  isDuplicate: boolean | null;
  hasVaultScore: boolean | null;
  path: string;
}

interface BulkAction {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  destructive?: boolean;
}

const bulkActions: BulkAction[] = [
  {
    id: 'move',
    name: 'Move Files',
    icon: Move,
    description: 'Move selected files to a different folder',
  },
  {
    id: 'copy',
    name: 'Copy Files',
    icon: Copy,
    description: 'Create copies of selected files',
  },
  {
    id: 'rename',
    name: 'Batch Rename',
    icon: Edit,
    description: 'Rename files using a pattern',
  },
  {
    id: 'share',
    name: 'Share Files',
    icon: Share,
    description: 'Share selected files with others',
  },
  {
    id: 'archive',
    name: 'Archive Files',
    icon: Archive,
    description: 'Move files to archive folder',
  },
  {
    id: 'delete',
    name: 'Delete Files',
    icon: Trash2,
    description: 'Move selected files to trash',
    destructive: true,
  },
];

const fileTypeIcons = {
  Document: FileText,
  Spreadsheet: FileSpreadsheet,
  Presentation: FileBarChart,
  Image: Image,
  Video: Video,
  PDF: FileText,
  Folder: FolderOpen,
  Other: Files,
};

const fileTypeColors = {
  Document: 'text-blue-600',
  Spreadsheet: 'text-green-600',
  Presentation: 'text-orange-600',
  Image: 'text-purple-600',
  Video: 'text-red-600',
  PDF: 'text-red-600',
  Folder: 'text-gray-600',
  Other: 'text-gray-600',
};

export default function InventoryPage() {
  const { user, getIdToken } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  const isMobile = useMobile();
  
  // Data state
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    type: 'all',
    sizeMin: null,
    sizeMax: null,
    dateFrom: '',
    dateTo: '',
    isDuplicate: null,
    hasVaultScore: null,
    path: '',
  });

  // Mock data (in production, this would come from API)
  useEffect(() => {
    const mockFiles: FileInfo[] = [
      {
        id: '1',
        name: 'Invoice_2024_Q1.pdf',
        type: 'PDF',
        size: 245760,
        lastModified: '2024-01-15T10:30:00Z',
        path: ['Documents', 'Invoices'],
        isDuplicate: false,
        vaultScore: 85,
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/1/view',
      },
      {
        id: '2',
        name: 'Project_Proposal.docx',
        type: 'Document',
        size: 512000,
        lastModified: '2024-02-20T14:15:00Z',
        path: ['Documents', 'Projects'],
        isDuplicate: false,
        vaultScore: 92,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        webViewLink: 'https://drive.google.com/file/d/2/view',
      },
      {
        id: '3',
        name: 'Budget_2024.xlsx',
        type: 'Spreadsheet',
        size: 789456,
        lastModified: '2024-03-10T09:45:00Z',
        path: ['Documents', 'Finance'],
        isDuplicate: false,
        vaultScore: 78,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        webViewLink: 'https://drive.google.com/file/d/3/view',
      },
      {
        id: '4',
        name: 'Photo_001.jpg',
        type: 'Image',
        size: 1024000,
        lastModified: '2024-01-05T16:20:00Z',
        path: ['Photos', '2024'],
        isDuplicate: true,
        vaultScore: 65,
        mimeType: 'image/jpeg',
        webViewLink: 'https://drive.google.com/file/d/4/view',
      },
      {
        id: '5',
        name: 'Photo_001_copy.jpg',
        type: 'Image',
        size: 1024000,
        lastModified: '2024-01-05T16:20:00Z',
        path: ['Downloads'],
        isDuplicate: true,
        vaultScore: null,
        mimeType: 'image/jpeg',
        webViewLink: 'https://drive.google.com/file/d/5/view',
      },
    ];
    
    setTimeout(() => {
      setFiles(mockFiles);
      setIsLoading(false);
    }, 1000);
  }, []);

  // Apply filters and sorting
  const processedFiles = useMemo(() => {
    let result = [...files];
    
    // Apply filters
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(file => 
        file.name.toLowerCase().includes(searchLower) ||
        file.path.some(p => p.toLowerCase().includes(searchLower))
      );
    }
    
    if (filters.type !== 'all') {
      result = result.filter(file => file.type === filters.type);
    }
    
    if (filters.sizeMin !== null) {
      result = result.filter(file => file.size >= filters.sizeMin!);
    }
    
    if (filters.sizeMax !== null) {
      result = result.filter(file => file.size <= filters.sizeMax!);
    }
    
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      result = result.filter(file => new Date(file.lastModified) >= fromDate);
    }
    
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      result = result.filter(file => new Date(file.lastModified) <= toDate);
    }
    
    if (filters.isDuplicate !== null) {
      result = result.filter(file => file.isDuplicate === filters.isDuplicate);
    }
    
    if (filters.hasVaultScore !== null) {
      result = result.filter(file => 
        filters.hasVaultScore ? file.vaultScore !== null : file.vaultScore === null
      );
    }
    
    if (filters.path) {
      const pathLower = filters.path.toLowerCase();
      result = result.filter(file => 
        file.path.some(p => p.toLowerCase().includes(pathLower))
      );
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'lastModified':
          comparison = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'vaultScore':
          const aScore = a.vaultScore || 0;
          const bScore = b.vaultScore || 0;
          comparison = aScore - bScore;
          break;
      }
      
      return sortDirection === 'desc' ? -comparison : comparison;
    });
    
    return result;
  }, [files, filters, sortField, sortDirection]);

  // Update filtered files when processed files change
  useEffect(() => {
    setFilteredFiles(processedFiles);
    setCurrentPage(1); // Reset to first page when filters change
  }, [processedFiles]);

  // Pagination
  const totalPages = Math.ceil(filteredFiles.length / pageSize);
  const paginatedFiles = filteredFiles.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Format file size
  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  // Format date
  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }, []);

  // Handle sort change
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  // Handle file selection
  const handleFileSelect = useCallback((fileId: string, selected: boolean) => {
    setSelectedFiles(prev => 
      selected 
        ? [...prev, fileId]
        : prev.filter(id => id !== fileId)
    );
  }, []);

  // Handle select all
  const handleSelectAll = useCallback((selected: boolean) => {
    setSelectedFiles(selected ? paginatedFiles.map(f => f.id) : []);
  }, [paginatedFiles]);

  // Handle bulk action
  const handleBulkAction = useCallback(async (actionId: string) => {
    if (selectedFiles.length === 0) {
      toast({
        title: 'No Files Selected',
        description: 'Please select files to perform bulk actions',
        variant: 'destructive',
      });
      return;
    }
    
    const action = bulkActions.find(a => a.id === actionId);
    if (!action) return;
    
    // Mock bulk operation
    toast({
      title: `${action.name} Started`,
      description: `Processing ${selectedFiles.length} files...`,
    });
    
    // Simulate API call
    setTimeout(() => {
      toast({
        title: `${action.name} Complete`,
        description: `Successfully processed ${selectedFiles.length} files`,
      });
      setSelectedFiles([]);
    }, 2000);
  }, [selectedFiles, toast]);

  // Refresh inventory
  const refreshInventory = useCallback(async () => {
    setIsRefreshing(true);
    // In production, this would trigger a new scan or fetch updated data
    setTimeout(() => {
      setIsRefreshing(false);
      toast({
        title: 'Inventory Refreshed',
        description: 'File inventory has been updated',
      });
    }, 1500);
  }, [toast]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setFilters({
      search: '',
      type: 'all',
      sizeMin: null,
      sizeMax: null,
      dateFrom: '',
      dateTo: '',
      isDuplicate: null,
      hasVaultScore: null,
      path: '',
    });
  }, []);

  if (isLoading) {
    return (
      <MainLayout>
        <RouteGuard requireAuth requireDriveAuth>
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="text-muted-foreground">Loading file inventory...</p>
            </div>
          </div>
        </RouteGuard>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <RouteGuard requireAuth requireDriveAuth>
        <div className="flex-1 space-y-6 p-4 pt-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Files className="h-8 w-8" />
                File Inventory
              </h2>
              <p className="text-muted-foreground">
                Browse and manage your Google Drive files
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                onClick={refreshInventory}
                disabled={isRefreshing}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>{filteredFiles.length} files total</span>
              <span>
                {formatFileSize(filteredFiles.reduce((sum, file) => sum + file.size, 0))} total size
              </span>
              {selectedFiles.length > 0 && (
                <span className="text-primary font-medium">
                  {selectedFiles.length} selected
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {/* View Mode Toggle */}
              <div className="flex items-center border rounded-lg">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="rounded-r-none"
                >
                  Table
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-none"
                >
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-l-none"
                >
                  List
                </Button>
              </div>
              
              {/* Filter Toggle */}
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                    {Object.values(filters).some(v => v !== '' && v !== 'all' && v !== null) && (
                      <Badge variant="secondary" className="ml-2 h-4 w-4 p-0 text-xs">
                        !
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Filter Files</SheetTitle>
                    <SheetDescription>
                      Refine your file search with advanced filters
                    </SheetDescription>
                  </SheetHeader>
                  
                  <div className="mt-6 space-y-6">
                    {/* Search */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Search</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search files and folders..."
                          value={filters.search}
                          onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    
                    {/* File Type */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">File Type</label>
                      <Select 
                        value={filters.type} 
                        onValueChange={(value: FileType) => 
                          setFilters(prev => ({ ...prev, type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="Document">Documents</SelectItem>
                          <SelectItem value="Spreadsheet">Spreadsheets</SelectItem>
                          <SelectItem value="Presentation">Presentations</SelectItem>
                          <SelectItem value="Image">Images</SelectItem>
                          <SelectItem value="Video">Videos</SelectItem>
                          <SelectItem value="PDF">PDFs</SelectItem>
                          <SelectItem value="Folder">Folders</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Size Range */}
                    <div className="space-y-4">
                      <label className="text-sm font-medium">File Size</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Input
                            placeholder="Min (MB)"
                            type="number"
                            value={filters.sizeMin ? (filters.sizeMin / 1024 / 1024).toFixed(0) : ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFilters(prev => ({
                                ...prev,
                                sizeMin: value ? parseInt(value) * 1024 * 1024 : null
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <Input
                            placeholder="Max (MB)"
                            type="number"
                            value={filters.sizeMax ? (filters.sizeMax / 1024 / 1024).toFixed(0) : ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFilters(prev => ({
                                ...prev,
                                sizeMax: value ? parseInt(value) * 1024 * 1024 : null
                              }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Date Range */}
                    <div className="space-y-4">
                      <label className="text-sm font-medium">Modified Date</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Input
                            type="date"
                            value={filters.dateFrom}
                            onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Input
                            type="date"
                            value={filters.dateTo}
                            onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Special Filters */}
                    <div className="space-y-4">
                      <label className="text-sm font-medium">Special Filters</label>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="duplicates"
                          checked={filters.isDuplicate === true}
                          onCheckedChange={(checked) => 
                            setFilters(prev => ({ ...prev, isDuplicate: checked ? true : null }))
                          }
                        />
                        <label htmlFor="duplicates" className="text-sm">Duplicates only</label>
                      </div>
                      
                      {isAiEnabled && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="vaultScore"
                            checked={filters.hasVaultScore === true}
                            onCheckedChange={(checked) => 
                              setFilters(prev => ({ ...prev, hasVaultScore: checked ? true : null }))
                            }
                          />
                          <label htmlFor="vaultScore" className="text-sm">Has AI score</label>
                        </div>
                      )}
                    </div>
                    
                    {/* Path Filter */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Folder Path</label>
                      <Input
                        placeholder="e.g., Documents, Photos"
                        value={filters.path}
                        onChange={(e) => setFilters(prev => ({ ...prev, path: e.target.value }))}
                      />
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button onClick={clearFilters} variant="outline" className="flex-1">
                        Clear All
                      </Button>
                      <Button onClick={() => setShowFilters(false)} className="flex-1">
                        Apply
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {selectedFiles.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{selectedFiles.length} files selected</span>
                <div className="flex gap-2 ml-4">
                  {bulkActions.slice(0, 3).map((action) => (
                    <Button
                      key={action.id}
                      onClick={() => handleBulkAction(action.id)}
                      size="sm"
                      variant={action.destructive ? "destructive" : "outline"}
                    >
                      <action.icon className="h-3 w-3 mr-1" />
                      {action.name}
                    </Button>
                  ))}
                  <Select onValueChange={handleBulkAction}>
                    <SelectTrigger className="w-auto">
                      <MoreHorizontal className="h-4 w-4" />
                    </SelectTrigger>
                    <SelectContent>
                      {bulkActions.slice(3).map((action) => (
                        <SelectItem key={action.id} value={action.id}>
                          <div className="flex items-center gap-2">
                            <action.icon className="h-3 w-3" />
                            {action.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* File Table */}
          {viewMode === 'table' && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedFiles.length === paginatedFiles.length && paginatedFiles.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-2">
                        Name
                        {sortField === 'name' && (
                          sortDirection === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('type')}
                    >
                      <div className="flex items-center gap-2">
                        Type
                        {sortField === 'type' && (
                          sortDirection === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('size')}
                    >
                      <div className="flex items-center gap-2">
                        Size
                        {sortField === 'size' && (
                          sortDirection === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('lastModified')}
                    >
                      <div className="flex items-center gap-2">
                        Modified
                        {sortField === 'lastModified' && (
                          sortDirection === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead>Path</TableHead>
                    {isAiEnabled && (
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('vaultScore')}
                      >
                        <div className="flex items-center gap-2">
                          AI Score
                          {sortField === 'vaultScore' && (
                            sortDirection === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                    )}
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedFiles.map((file) => {
                    const IconComponent = fileTypeIcons[file.type];
                    const iconColor = fileTypeColors[file.type];
                    
                    return (
                      <TableRow key={file.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Checkbox
                            checked={selectedFiles.includes(file.id)}
                            onCheckedChange={(checked) => handleFileSelect(file.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <IconComponent className={cn("h-4 w-4", iconColor)} />
                            <div className="space-y-1">
                              <p className="font-medium leading-none">{file.name}</p>
                              {file.isDuplicate && (
                                <Badge variant="outline" className="text-xs">
                                  Duplicate
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{file.type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatFileSize(file.size)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(file.lastModified)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          /{file.path.join('/')}
                        </TableCell>
                        {isAiEnabled && (
                          <TableCell>
                            {file.vaultScore !== null ? (
                              <div className="flex items-center gap-2">
                                <Star className={cn(
                                  "h-4 w-4",
                                  file.vaultScore >= 80 ? "text-yellow-500" :
                                  file.vaultScore >= 60 ? "text-blue-500" :
                                  "text-gray-400"
                                )} />
                                <span className="text-sm font-medium">
                                  {file.vaultScore}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => window.open(file.webViewLink, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View file</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {Math.min((currentPage - 1) * pageSize + 1, filteredFiles.length)} to{' '}
              {Math.min(currentPage * pageSize, filteredFiles.length)} of {filteredFiles.length} files
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </RouteGuard>
    </MainLayout>
  );
}
