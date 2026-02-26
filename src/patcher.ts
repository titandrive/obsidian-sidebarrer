import { TFolder } from "obsidian";
import { around } from "monkey-around";
import type SidebarrerPlugin from "./main";
import type { FileExplorerView, FileTreeItem } from "./types";

export class Patcher {
  private uninstaller: (() => void) | null = null;

  constructor(private plugin: SidebarrerPlugin) {}

  patchExplorer(): void {
    const plugin = this.plugin;
    const view = plugin.getFileExplorerView();
    if (!view) {
      console.log("Sidebarrer: no file explorer view found");
      return;
    }

    this.unpatch();

    const proto = Object.getPrototypeOf(view);
    if (!proto.getSortedFolderItems) {
      console.log(
        "Sidebarrer: getSortedFolderItems not found on prototype"
      );
      return;
    }

    console.log("Sidebarrer: patching getSortedFolderItems");

    this.uninstaller = around(
      proto as Record<string, Function>,
      {
        getSortedFolderItems(original: Function) {
          return function (
            this: FileExplorerView,
            folder: TFolder,
            bypass?: boolean
          ): FileTreeItem[] {
            const items: FileTreeItem[] = original.call(
              this,
              folder
            );

            if (bypass) {
              return items;
            }

            const folderPath = folder.path;
            const customOrder =
              plugin.settings.customOrder[folderPath];

            if (!customOrder || customOrder.length === 0) {
              return items;
            }

            // Sort the original array IN-PLACE using custom order
            // This is critical — Obsidian expects the same array reference
            items.sort((a, b) => {
              let idxA = customOrder.indexOf(a.file.path);
              let idxB = customOrder.indexOf(b.file.path);

              // Items not in custom order go to end
              if (idxA === -1) idxA = customOrder.length;
              if (idxB === -1) idxB = customOrder.length;

              // Apply folders-first if enabled
              if (plugin.settings.foldersFirst) {
                const aIsFolder = a.file instanceof TFolder;
                const bIsFolder = b.file instanceof TFolder;
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
              }

              return idxA - idxB;
            });

            return items;
          };
        },
      }
    );

    console.log("Sidebarrer: patch applied successfully");
  }

  unpatch(): void {
    if (this.uninstaller) {
      this.uninstaller();
      this.uninstaller = null;
    }
  }
}
