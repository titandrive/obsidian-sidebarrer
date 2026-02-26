import { App, PluginSettingTab, Setting } from "obsidian";
import type SidebarrerPlugin from "./main";
import type { SidebarrerSettings } from "./types";

export const DEFAULT_SETTINGS: SidebarrerSettings = {
  enabled: true,
  foldersFirst: true,
  newItemPosition: "bottom",
  customOrder: {},
};

export class SidebarrerSettingTab extends PluginSettingTab {
  plugin: SidebarrerPlugin;

  constructor(app: App, plugin: SidebarrerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Folders first")
      .setDesc(
        "Group folders above files in each directory. When off, folders and files can be freely interleaved."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.foldersFirst)
          .onChange(async (value) => {
            this.plugin.settings.foldersFirst = value;
            await this.plugin.saveSettings();
            this.plugin.sortExplorer();
          })
      );

    new Setting(containerEl)
      .setName("New item placement")
      .setDesc(
        "Where newly created files or folders appear in their parent's custom order."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("top", "Top")
          .addOption("bottom", "Bottom")
          .setValue(this.plugin.settings.newItemPosition)
          .onChange(async (value) => {
            this.plugin.settings.newItemPosition = value as
              | "top"
              | "bottom";
            await this.plugin.saveSettings();
          })
      );
  }
}
