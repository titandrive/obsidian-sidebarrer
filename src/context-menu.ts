import { Menu, TAbstractFile } from "obsidian";
import type SidebarrerPlugin from "./main";

export class ContextMenuManager {
  constructor(private plugin: SidebarrerPlugin) {}

  register(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on(
        "file-menu",
        (menu: Menu, file: TAbstractFile) => {
          this.addMenuItems(menu, file);
        }
      )
    );
  }

  private addMenuItems(menu: Menu, file: TAbstractFile): void {
    const path = file.path;
    const parentPath = this.plugin.orderManager.getParentPath(path);

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle("Move up")
        .setIcon("arrow-up")
        .onClick(async () => {
          console.log("Sidebarrer: Move up clicked for", path);
          const moved = this.plugin.orderManager.moveUp(path);
          console.log("Sidebarrer: moveUp result:", moved);
          if (moved) {
            await this.plugin.saveSettings();
            this.plugin.sortExplorer();
          }
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Move down")
        .setIcon("arrow-down")
        .onClick(async () => {
          console.log("Sidebarrer: Move down clicked for", path);
          const moved = this.plugin.orderManager.moveDown(path);
          console.log("Sidebarrer: moveDown result:", moved);
          if (moved) {
            await this.plugin.saveSettings();
            this.plugin.sortExplorer();
          }
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Reset folder order")
        .setIcon("reset")
        .onClick(async () => {
          console.log("Sidebarrer: Reset folder order for", parentPath);
          this.plugin.orderManager.resetFolder(parentPath);
          await this.plugin.saveSettings();
          this.plugin.sortExplorer();
        });
    });
  }
}
