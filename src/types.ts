import { TAbstractFile, TFolder } from "obsidian";

export type FolderOrder = Record<string, string[]>;

export interface SidebarrerSettings {
  enabled: boolean;
  foldersFirst: boolean;
  newItemPosition: "top" | "bottom";
  customOrder: FolderOrder;
}

export interface FileTreeItem {
  file: TAbstractFile;
  el: HTMLElement;
  selfEl: HTMLElement;
  collapsed: boolean;
  setCollapsed(collapsed: boolean, check: boolean): void;
}

export interface FileExplorerView {
  fileItems: Record<string, FileTreeItem>;
  sortOrder: string;
  sort(): void;
  setSortOrder(order: string): void;
  getSortedFolderItems(folder: TFolder, bypass?: boolean): FileTreeItem[];
  tree: { selectedDoms: Set<FileTreeItem> };
  containerEl: HTMLElement;
}
