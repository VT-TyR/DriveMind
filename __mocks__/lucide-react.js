import React from 'react';

const createMockIcon = (name) => React.forwardRef((props, ref) => (
  <div ref={ref} data-testid={name} {...props} />
));

module.exports = {
  __esModule: true,
  AlertTriangle: createMockIcon('AlertTriangle'),
  CheckCircle: createMockIcon('CheckCircle'),
  XCircle: createMockIcon('XCircle'),
  Info: createMockIcon('Info'),
  Copy: createMockIcon('Copy'),
  Download: createMockIcon('Download'),
  RefreshCw: createMockIcon('RefreshCw'),
  MoreHorizontal: createMockIcon('MoreHorizontal'),
  Edit: createMockIcon('Edit'),
  Move: createMockIcon('Move'),
  Trash2: createMockIcon('Trash2'),
  RotateCcw: createMockIcon('RotateCcw'),
  Play: createMockIcon('Play'),
  X: createMockIcon('X'),
  // Add other icons as needed
};
