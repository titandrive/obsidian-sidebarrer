import { Plugin, TAbstractFile } from "obsidian";
import { DEFAULT_SETTINGS, SidebarrerSettingTab } from "./settings";
import { Patcher } from "./patcher";
import { OrderManager } from "./order-manager";
import { DragDropManager } from "./drag-drop";
import { ContextMenuManager } from "./context-menu";
import type { SidebarrerSettings, FileExplorerView } from "./types";

export default class SidebarrerPlugin extends Plugin {
  settings: SidebarrerSettings = DEFAULT_SETTINGS;
  orderManager: OrderManager;
  private patcher: Patcher;
  private dragDrop: DragDropManager;
  private contextMenu: ContextMenuManager;
  private ribbonEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    console.log("Sidebarrer: onload");
    await this.loadSettings();

    this.orderManager = new OrderManager(this);
    this.patcher = new Patcher(this);
    this.dragDrop = new DragDropManager(this);
    this.contextMenu = new ContextMenuManager(this);

    this.addSettingTab(new SidebarrerSettingTab(this.app, this));
    this.addRibbonToggle();

    this.app.workspace.onLayoutReady(() => {
      console.log("Sidebarrer: layout ready");
      // Simple delay — the file explorer needs a moment after layout ready
      setTimeout(() => this.initialize(), 500);
    });
  }

  onunload(): void {
    this.patcher.unpatch();
    this.dragDrop.disable();

    const view = this.getFileExplorerView();
    if (view && typeof view.sort === "function") {
      view.sort();
    }
  }

  private initialize(): void {
    console.log("Sidebarrer: initializing");

    const view = this.getFileExplorerView();
    console.log("Sidebarrer: file explorer view:", view ? "found" : "NOT FOUND");

    if (view) {
      const proto = Object.getPrototypeOf(view);
      const methods = Object.getOwnPropertyNames(proto);
      console.log("Sidebarrer: view prototype methods:", methods);
      console.log("Sidebarrer: has sort:", typeof proto.sort);
      console.log("Sidebarrer: has getSortedFolderItems:", typeof proto.getSortedFolderItems);
      console.log("Sidebarrer: has requestSort:", typeof proto.requestSort);
      console.log("Sidebarrer: has setSortOrder:", typeof proto.setSortOrder);
    }

    this.patcher.patchExplorer();
    this.contextMenu.register();
    this.dragDrop.enable();
    this.orderManager.reconcile();
    this.sortExplorer();
    this.registerVaultEvents();

    console.log("Sidebarrer: initialized");
  }

  private registerVaultEvents(): void {
    this.registerEvent(
      this.app.vault.on("create", (item: TAbstractFile) => {
        this.orderManager.onItemCreated(item);
        this.saveSettings();
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (item: TAbstractFile) => {
        this.orderManager.onItemDeleted(item.path);
        this.saveSettings();
      })
    );

    this.registerEvent(
      this.app.vault.on(
        "rename",
        (item: TAbstractFile, oldPath: string) => {
          this.orderManager.onItemRenamed(item.path, oldPath);
          this.saveSettings();
          this.sortExplorer();
        }
      )
    );
  }

  getFileExplorerView(): FileExplorerView | null {
    const leaf =
      this.app.workspace.getLeavesOfType("file-explorer")[0];
    if (!leaf) return null;
    return leaf.view as unknown as FileExplorerView;
  }

  sortExplorer(): void {
    const view = this.getFileExplorerView();
    if (!view) return;

    // view.sort() re-renders root-level items via getSortedFolderItems
    view.sort();

    if (!this.settings.enabled) return;

    // For nested folders, sort() doesn't re-render expanded children.
    // Toggle their collapse state to force Obsidian to rebuild them,
    // which calls our patched getSortedFolderItems.
    for (const folderPath of Object.keys(this.settings.customOrder)) {
      if (folderPath === "/" || folderPath === "") continue;
      const item = view.fileItems[folderPath];
      if (item && !item.collapsed) {
        console.log("Sidebarrer: toggling collapse for", folderPath);
        item.setCollapsed(true, false);
        item.setCollapsed(false, false);
      }
    }
  }

  private addRibbonToggle(): void {
    this.ribbonEl = this.addRibbonIcon(
      "arrow-up-down",
      "Toggle custom order",
      async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();

        if (this.settings.enabled) {
          this.dragDrop.enable();
        } else {
          this.dragDrop.disable();
        }

        this.sortExplorer();
        this.updateRibbonState();
      }
    );
    this.updateRibbonState();
  }

  private updateRibbonState(): void {
    if (!this.ribbonEl) return;
    this.ribbonEl.toggleClass(
      "sidebarrer-ribbon-off",
      !this.settings.enabled
    );
    this.ribbonEl.ariaLabel = this.settings.enabled
      ? "Turn custom sort order off"
      : "Turn custom sort order on";
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
    this.sortExplorer();
  }
}
