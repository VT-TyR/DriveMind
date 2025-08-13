
export type File = {
  id: string;
  name: string;
  type:
    | 'Document'
    | 'Spreadsheet'
    | 'Presentation'
    | 'Image'
    | 'Video'
    | 'PDF'
    | 'Folder'
    | 'Other';
  size: number; // in bytes
  lastModified: Date;
  isDuplicate: boolean;
  path: string[];
  vaultScore: number | null;
};
