import {
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileVideo,
  FileArchive,
  File,
  FileType,
} from 'lucide-react';

import type { FC } from 'react';

export interface FileIconProps {
  fileName: string;
  className?: string;
}

const getFileIcon = (fileName: string): typeof File => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  // Code files
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'rb', 'php', 'swift', 'kt'].includes(ext)) {
    return FileCode;
  }

  // Markup/Config
  if (['html', 'xml', 'svg', 'vue'].includes(ext)) {
    return FileType;
  }

  // Data/Config
  if (['json', 'yaml', 'yml', 'toml', 'env'].includes(ext)) {
    return FileJson;
  }

  // Documents
  if (['md', 'txt', 'pdf', 'doc', 'docx'].includes(ext)) {
    return FileText;
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'].includes(ext)) {
    return FileImage;
  }

  // Video
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return FileVideo;
  }

  // Archives
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) {
    return FileArchive;
  }

  return File;
};

const getFileColor = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (['ts', 'tsx'].includes(ext)) return 'text-blue-500';
  if (['js', 'jsx'].includes(ext)) return 'text-yellow-500';
  if (['py'].includes(ext)) return 'text-blue-400';
  if (['json'].includes(ext)) return 'text-green-500';
  if (['html', 'xml'].includes(ext)) return 'text-orange-500';
  if (['css', 'scss'].includes(ext)) return 'text-purple-500';
  if (['md'].includes(ext)) return 'text-gray-500';

  return 'text-muted-foreground';
};

export const FileIcon: FC<FileIconProps> = ({ fileName, className = '' }) => {
  const Icon = getFileIcon(fileName);
  const colorClass = getFileColor(fileName);

  return <Icon className={`${colorClass} ${className}`} />;
};
