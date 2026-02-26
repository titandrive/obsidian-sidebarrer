import { TAbstractFile, TFolder } from "obsidian";
import type SidebarrerPlugin from "./main";

export class OrderManager {
  constructor(private plugin: SidebarrerPlugin) {}

  /**
   * Ensure saved order matches current vault state.
   * Uses bypass=true to get default-sorted items from the patched method.
   */
  reconcile(): void {
    const view = this.plugin.getFileExplorerView();
    if (!view) return;

    const vault = this.plugin.app.vault;
    const order = this.plugin.settings.customOrder;

    for (const folderPath of Object.keys(order)) {
      const folder =
        folderPath === "/"
          ? vault.getRoot()
          : vault.getAbstractFileByPath(folderPath);

      if (!(folder instanceof TFolder)) {
        delete order[folderPath];
        continue;
      }

      // Get current children from the default sort (bypass our custom sort)
      const sortedItems = view.getSortedFolderItems(folder, true);
      const currentChildPaths = sortedItems.map((item) => item.file.path);
      const savedOrder = order[folderPath];

      // Keep only paths that still exist
      const validPaths = savedOrder.filter((p) =>
        currentChildPaths.includes(p)
      );

      // Find new paths not in saved order
      const newPaths = currentChildPaths.filter(
        (p) => !savedOrder.includes(p)
      );

      if (this.plugin.settings.newItemPosition === "top") {
        order[folderPath] = [...newPaths, ...validPaths];
      } else {
        order[folderPath] = [...validPaths, ...newPaths];
      }
    }
  }

  /**
   * Initialize order for a folder from its current default-sorted state.
   */
  initializeFolder(folderPath: string): string[] {
    const view = this.plugin.getFileExplorerView();
    if (!view) return [];

    const folder =
      folderPath === "/"
        ? this.plugin.app.vault.getRoot()
        : this.plugin.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) return [];

    // Use bypass=true to get default sort order
    const items = view.getSortedFolderItems(folder, true);
    const order = items.map((item) => item.file.path);
    this.plugin.settings.customOrder[folderPath] = order;
    return order;
  }

  /**
   * Get or create order entry for a folder.
   */
  ensureFolder(folderPath: string): string[] {
    if (!this.plugin.settings.customOrder[folderPath]) {
      return this.initializeFolder(folderPath);
    }
    return this.plugin.settings.customOrder[folderPath];
  }

  /**
   * Move an item to before or after a target sibling.
   */
  moveItem(
    itemPath: string,
    targetSiblingPath: string,
    position: "before" | "after"
  ): void {
    const dir = this.getParentPath(itemPath);
    const order = this.ensureFolder(dir);

    const filtered = order.filter((p) => p !== itemPath);
    const siblingIdx = filtered.indexOf(targetSiblingPath);
    if (siblingIdx < 0) return;

    const insertIdx =
      position === "before" ? siblingIdx : siblingIdx + 1;
    filtered.splice(insertIdx, 0, itemPath);
    this.plugin.settings.customOrder[dir] = filtered;
  }

  /**
   * Move item up one position. Returns true if moved.
   */
  moveUp(itemPath: string): boolean {
    const dir = this.getParentPath(itemPath);
    console.log("Sidebarrer: moveUp - parent dir:", dir);
    const order = this.ensureFolder(dir);
    console.log("Sidebarrer: moveUp - order:", JSON.stringify(order));
    const idx = order.indexOf(itemPath);
    console.log("Sidebarrer: moveUp - item index:", idx);
    if (idx <= 0) return false;

    if (this.plugin.settings.foldersFirst) {
      const vault = this.plugin.app.vault;
      const prevItem = vault.getAbstractFileByPath(order[idx - 1]);
      const thisItem = vault.getAbstractFileByPath(itemPath);
      if (
        prevItem instanceof TFolder &&
        !(thisItem instanceof TFolder)
      ) {
        return false;
      }
    }

    [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
    return true;
  }

  /**
   * Move item down one position. Returns true if moved.
   */
  moveDown(itemPath: string): boolean {
    const dir = this.getParentPath(itemPath);
    console.log("Sidebarrer: moveDown - parent dir:", dir);
    const order = this.ensureFolder(dir);
    console.log("Sidebarrer: moveDown - order:", JSON.stringify(order));
    const idx = order.indexOf(itemPath);
    console.log("Sidebarrer: moveDown - item index:", idx);
    if (idx < 0 || idx >= order.length - 1) return false;

    if (this.plugin.settings.foldersFirst) {
      const vault = this.plugin.app.vault;
      const nextItem = vault.getAbstractFileByPath(order[idx + 1]);
      const thisItem = vault.getAbstractFileByPath(itemPath);
      if (
        thisItem instanceof TFolder &&
        !(nextItem instanceof TFolder)
      ) {
        return false;
      }
    }

    [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
    return true;
  }

  /**
   * Remove custom order for a folder (revert to default sort).
   */
  resetFolder(folderPath: string): void {
    delete this.plugin.settings.customOrder[folderPath];
  }

  onItemCreated(item: TAbstractFile): void {
    const dir = this.getParentPath(item.path);
    const order = this.plugin.settings.customOrder[dir];
    if (!order) return;
    if (order.includes(item.path)) return;

    if (this.plugin.settings.newItemPosition === "top") {
      order.unshift(item.path);
    } else {
      order.push(item.path);
    }
  }

  onItemDeleted(path: string): void {
    const dir = this.getParentPath(path);
    const order = this.plugin.settings.customOrder[dir];
    if (order) {
      this.plugin.settings.customOrder[dir] = order.filter(
        (p) => p !== path
      );
    }
    delete this.plugin.settings.customOrder[path];
  }

  onItemRenamed(newPath: string, oldPath: string): void {
    const oldDir = this.getParentPath(oldPath);
    const newDir = this.getParentPath(newPath);

    if (oldDir === newDir) {
      const order = this.plugin.settings.customOrder[oldDir];
      if (order) {
        const idx = order.indexOf(oldPath);
        if (idx >= 0) order[idx] = newPath;
      }
    } else {
      this.onItemDeleted(oldPath);
      const item =
        this.plugin.app.vault.getAbstractFileByPath(newPath);
      if (item) this.onItemCreated(item);
    }

    // If it was a folder, update its order entry key and child paths
    if (this.plugin.settings.customOrder[oldPath]) {
      this.plugin.settings.customOrder[newPath] =
        this.plugin.settings.customOrder[oldPath].map((p) =>
          p.startsWith(oldPath + "/")
            ? newPath + p.slice(oldPath.length)
            : p
        );
      delete this.plugin.settings.customOrder[oldPath];
      this.updateNestedFolderPaths(oldPath, newPath);
    }
  }

  private updateNestedFolderPaths(
    oldPrefix: string,
    newPrefix: string
  ): void {
    const keysToUpdate = Object.keys(
      this.plugin.settings.customOrder
    ).filter((k) => k.startsWith(oldPrefix + "/"));

    for (const oldKey of keysToUpdate) {
      const newKey = newPrefix + oldKey.slice(oldPrefix.length);
      this.plugin.settings.customOrder[newKey] =
        this.plugin.settings.customOrder[oldKey].map((p) =>
          p.startsWith(oldPrefix + "/")
            ? newPrefix + p.slice(oldPrefix.length)
            : p
        );
      delete this.plugin.settings.customOrder[oldKey];
    }
  }

  getParentPath(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash < 0) return "/";
    return path.substring(0, lastSlash);
  }
}
