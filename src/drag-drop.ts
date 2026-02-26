import type SidebarrerPlugin from "./main";

export class DragDropManager {
  private explorerEl: HTMLElement | null = null;
  private dragStartHandler: ((e: DragEvent) => void) | null = null;
  private cleanupFns: (() => void)[] = [];

  constructor(private plugin: SidebarrerPlugin) {}

  enable(): void {
    const leaf =
      this.plugin.app.workspace.getLeavesOfType("file-explorer")[0];
    if (!leaf) return;

    this.explorerEl =
      leaf.view.containerEl.querySelector(".nav-files-container");
    if (!this.explorerEl) {
      console.log("Sidebarrer: .nav-files-container not found");
      return;
    }

    this.setupDragListeners();
    console.log("Sidebarrer: drag-and-drop enabled");
  }

  disable(): void {
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns = [];
    this.explorerEl = null;
  }

  private setupDragListeners(): void {
    if (!this.explorerEl) return;

    this.dragStartHandler = (e: DragEvent) => {
      const draggedEl = (
        e.target as HTMLElement
      ).closest<HTMLElement>(".tree-item-self");
      if (!draggedEl) return;

      const draggedPath = draggedEl.getAttribute("data-path");
      if (!draggedPath) return;

      console.log("Sidebarrer: drag started for", draggedPath);

      // Mark the dragged element
      draggedEl.dataset.sidebarrerDragging = "";
      this.explorerEl!.dataset.sidebarrerDragActive = "";

      // Collapse dragged folder
      this.collapseDraggedFolder(draggedPath);

      let futureSibling: HTMLElement | null = null;
      let dropPosition: "before" | "after" = "before";

      const onDrag = (e: DragEvent) => {
        cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => {
          // Check if pointer is outside explorer
          if (!this.explorerEl) return;
          const explorerRect =
            this.explorerEl.getBoundingClientRect();
          const isOutside =
            e.clientX < explorerRect.left ||
            e.clientX > explorerRect.right ||
            e.clientY < explorerRect.top ||
            e.clientY > explorerRect.bottom;

          if (isOutside || e.clientY === 0) {
            this.clearDropIndicators();
            futureSibling = null;
            return;
          }

          const result = this.findDropTarget(
            e.clientY,
            draggedPath
          );
          futureSibling = result.futureSibling;
          dropPosition = result.dropPosition;
          this.updateDropIndicators(futureSibling, dropPosition);
        });
      };

      const onDragEnd = () => {
        console.log("Sidebarrer: drag ended");
        cancelAnimationFrame(this.rafId);
        draggedEl.removeEventListener("drag", onDrag);

        this.clearDropIndicators();
        delete this.explorerEl!.dataset.sidebarrerDragActive;

        if (futureSibling) {
          const siblingEl =
            futureSibling.querySelector<HTMLElement>(
              ".tree-item-self"
            );
          const siblingPath = siblingEl?.dataset.path;

          if (siblingPath && siblingPath !== draggedPath) {
            // Check same parent
            const draggedParent =
              this.plugin.orderManager.getParentPath(draggedPath);
            const siblingParent =
              this.plugin.orderManager.getParentPath(siblingPath);

            if (draggedParent === siblingParent) {
              console.log(
                "Sidebarrer: moving",
                draggedPath,
                dropPosition,
                siblingPath
              );
              this.plugin.orderManager.moveItem(
                draggedPath,
                siblingPath,
                dropPosition
              );
              this.plugin.saveSettings();
              this.plugin.sortExplorer();
            }
          }
        }

        futureSibling = null;
      };

      draggedEl.addEventListener("drag", onDrag);
      draggedEl.addEventListener("dragend", onDragEnd, {
        once: true,
      });
    };

    this.explorerEl.addEventListener(
      "dragstart",
      this.dragStartHandler
    );

    this.cleanupFns.push(() => {
      if (this.dragStartHandler && this.explorerEl) {
        this.explorerEl.removeEventListener(
          "dragstart",
          this.dragStartHandler
        );
      }
    });
  }

  private rafId = 0;

  private findDropTarget(
    mouseY: number,
    draggedPath: string
  ): {
    futureSibling: HTMLElement | null;
    dropPosition: "before" | "after";
  } {
    if (!this.explorerEl) {
      return { futureSibling: null, dropPosition: "before" };
    }

    // Get all visible tree items, excluding children of the dragged folder
    const treeItems = Array.from<HTMLElement>(
      this.explorerEl.querySelectorAll(".tree-item")
    ).filter((item) => {
      const selfEl = item.querySelector<HTMLElement>(
        ".tree-item-self"
      );
      if (!selfEl) return false;
      const path = selfEl.dataset.path;
      if (!path) return false;
      // Exclude the dragged item and its children
      if (
        path === draggedPath ||
        path.startsWith(draggedPath + "/")
      ) {
        return false;
      }
      return true;
    });

    if (!treeItems.length) {
      return { futureSibling: null, dropPosition: "before" };
    }

    let bestItem = treeItems[0];
    let bestPosition: "before" | "after" = "before";
    let bestDist = Infinity;

    for (const item of treeItems) {
      const rect = item.getBoundingClientRect();
      const topDist = Math.abs(rect.top - mouseY);
      const bottomDist = Math.abs(rect.bottom - mouseY);

      if (topDist < bestDist) {
        bestDist = topDist;
        bestItem = item;
        bestPosition = "before";
      }
      if (bottomDist < bestDist) {
        bestDist = bottomDist;
        bestItem = item;
        bestPosition = "after";
      }
    }

    return {
      futureSibling: bestItem,
      dropPosition: bestPosition,
    };
  }

  private updateDropIndicators(
    target: HTMLElement | null,
    position: "before" | "after"
  ): void {
    // Clear previous indicators
    document
      .querySelectorAll("[data-sidebarrer-drop]")
      .forEach((el) => el.removeAttribute("data-sidebarrer-drop"));

    if (target) {
      target.dataset.sidebarrerDrop = position;
    }
  }

  private clearDropIndicators(): void {
    document
      .querySelectorAll("[data-sidebarrer-dragging]")
      .forEach((el) =>
        el.removeAttribute("data-sidebarrer-dragging")
      );
    document
      .querySelectorAll("[data-sidebarrer-drop]")
      .forEach((el) => el.removeAttribute("data-sidebarrer-drop"));
  }

  private collapseDraggedFolder(path: string): void {
    const view = this.plugin.getFileExplorerView();
    if (!view) return;
    const item = view.fileItems[path];
    if (item && !item.collapsed && item.setCollapsed) {
      item.setCollapsed(true, true);
    }
  }
}
