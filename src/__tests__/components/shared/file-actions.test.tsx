/**
 * @fileoverview Tests for FileActions component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileActions } from '@/components/shared/file-actions';
import { useFileOperations } from '@/contexts/file-operations-context';
import type { File } from '@/lib/types';

// Mock dependencies
jest.mock('@/contexts/file-operations-context');
jest.mock('@/lib/feature-flags', () => ({
  isFileOpsEnabledClient: jest.fn(() => true),
}));

// Mock UI components to make dropdown work in tests
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: any) => children,
  DropdownMenuContent: ({ children }: any) => (
    <div data-testid="dropdown-menu-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, ...props }: any) => (
    <input value={value} onChange={onChange} {...props} />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

const mockUseFileOperations = useFileOperations as jest.MockedFunction<typeof useFileOperations>;

describe('FileActions', () => {
  const mockFile: File = {
    id: 'test-file-id',
    name: 'test-file.txt',
    type: 'Document',
    size: 1024,
    lastModified: new Date('2023-01-01'),
    isDuplicate: false,
    path: [],
    vaultScore: null,
  };

  const mockFileOperations = {
    operations: [],
    isProcessing: false,
    moveFileOperation: jest.fn(),
    deleteFileOperation: jest.fn(),
    restoreFileOperation: jest.fn(),
    renameFileOperation: jest.fn(),
    createFolderOperation: jest.fn(),
    addToBatch: jest.fn(),
    executeBatch: jest.fn(),
    clearBatch: jest.fn(),
    getBatchSize: jest.fn().mockReturnValue(0),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFileOperations.mockReturnValue(mockFileOperations);
  });

  it('renders file actions dropdown', () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    expect(dropdownTrigger).toBeInTheDocument();
  });

  it('opens dropdown menu when clicked', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    await waitFor(() => {
      expect(screen.getByText('Rename')).toBeInTheDocument();
      expect(screen.getByText('Move')).toBeInTheDocument();
      expect(screen.getByText('Move to trash')).toBeInTheDocument();
    });
  });

  it('shows rename dialog when rename clicked', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const renameButton = await screen.findByText('Rename');
    fireEvent.click(renameButton);

    await waitFor(() => {
      expect(screen.getByText('Rename file')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-file.txt')).toBeInTheDocument();
    });
  });

  it('performs rename operation', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const renameButton = await screen.findByText('Rename');
    fireEvent.click(renameButton);

    const nameInput = await screen.findByDisplayValue('test-file.txt');
    fireEvent.change(nameInput, { target: { value: 'new-name.txt' } });

    const confirmButtons = screen.getAllByRole('button', { name: 'Rename' });
    const confirmButton = confirmButtons[confirmButtons.length - 1]; // Get the last one (dialog button)
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockFileOperations.renameFileOperation).toHaveBeenCalledWith(
        'test-file-id',
        'test-file.txt',
        'new-name.txt'
      );
    });
  });

  it('shows delete dialog when delete clicked', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const deleteButton = await screen.findByText('Move to trash');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      const deleteTexts = screen.getAllByText('Move to trash');
      expect(deleteTexts.length).toBeGreaterThan(0);
      expect(screen.getByText(/Are you sure you want to move.*to trash/)).toBeInTheDocument();
    });
  });

  it('performs delete operation', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const deleteButton = await screen.findByText('Move to trash');
    fireEvent.click(deleteButton);

    const confirmButtons = await screen.findAllByRole('button', { name: 'Move to trash' });
    const confirmButton = confirmButtons[confirmButtons.length - 1]; // Get the last one (dialog button)
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockFileOperations.deleteFileOperation).toHaveBeenCalledWith(
        'test-file-id',
        'test-file.txt'
      );
    });
  });

  it('shows move dialog when move clicked', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const moveButton = await screen.findByText('Move');
    fireEvent.click(moveButton);

    await waitFor(() => {
      const moveTexts = screen.getAllByText('Move file');
      expect(moveTexts.length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText(/Enter folder ID/)).toBeInTheDocument();
    });
  });

  it('performs move operation', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const moveButton = await screen.findByText('Move');
    fireEvent.click(moveButton);

    const folderInput = await screen.findByPlaceholderText(/Enter folder ID/);
    fireEvent.change(folderInput, { target: { value: 'new-folder-id' } });

    const confirmButton = screen.getByRole('button', { name: 'Move file' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockFileOperations.moveFileOperation).toHaveBeenCalledWith(
        'test-file-id',
        'test-file.txt',
        'new-folder-id'
      );
    });
  });

  it('adds operations to batch', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const batchMoveButton = await screen.findByText('Add move to batch');
    fireEvent.click(batchMoveButton);

    expect(mockFileOperations.addToBatch).toHaveBeenCalledWith(
      'move',
      'test-file-id',
      'test-file.txt',
      { newParentId: 'root' }
    );
  });

  it('disables actions when processing', () => {
    mockUseFileOperations.mockReturnValue({
      ...mockFileOperations,
      isProcessing: true,
    });

    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    expect(dropdownTrigger).toBeDisabled();
  });

  it('shows duplicate-specific actions for duplicate files', async () => {
    const duplicateFile: File = {
      ...mockFile,
      isDuplicate: true,
    };

    render(<FileActions file={duplicateFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    await waitFor(() => {
      expect(screen.getByText('Delete duplicate')).toBeInTheDocument();
    });
  });

  it('calls onRefresh after operations', async () => {
    const mockOnRefresh = jest.fn();
    render(<FileActions file={mockFile} onRefresh={mockOnRefresh} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const renameButton = await screen.findByText('Rename');
    fireEvent.click(renameButton);

    const nameInput = await screen.findByDisplayValue('test-file.txt');
    fireEvent.change(nameInput, { target: { value: 'new-name.txt' } });

    const confirmButtons = screen.getAllByRole('button', { name: 'Rename' });
    const confirmButton = confirmButtons[confirmButtons.length - 1]; // Get the last one (dialog button)
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalled();
    });
  });

  it('validates empty file names', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const renameButton = await screen.findByText('Rename');
    fireEvent.click(renameButton);

    const nameInput = await screen.findByDisplayValue('test-file.txt');
    fireEvent.change(nameInput, { target: { value: '' } });

    const confirmButtons = screen.getAllByRole('button', { name: 'Rename' });
    const confirmButton = confirmButtons[confirmButtons.length - 1]; // Get the last one (dialog button)
    expect(confirmButton).toBeDisabled();
  });

  it('validates empty folder IDs for move', async () => {
    render(<FileActions file={mockFile} />);
    
    const dropdownTrigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(dropdownTrigger);

    const moveButton = await screen.findByText('Move');
    fireEvent.click(moveButton);

    const confirmButton = await screen.findByRole('button', { name: 'Move file' });
    expect(confirmButton).toBeDisabled();
  });
});