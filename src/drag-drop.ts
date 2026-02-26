import type SidebarrerPlugin from "./main";
import type { FileTreeItem } from "./types";

const DRAG_THRESHOLD = 8;

interface DragState {
  path: string;
  startX: number;
  startY: number;
  isDragging: boolean;
  useMouseEvents: boolean;
  futureSibling: FileTreeItem | null;
  dropPosition: "before" | "after";
}

export class DragDropManager {
  private cleanupFns: (() => void)[] = [];
  private rafId = 0;
  private dragState: DragState | null = null;
  private navContainer: HTMLElement | null = null;

  constructor(private plugin: SidebarrerPlugin) {}

  enable(): void {
    const view = this.plugin.getFileExplorerView();
    if (!view) {
      console.log("Sidebarrer: drag-drop: no view");
      return;
    }

    const viewContent = view.containerEl;
    let navContainer =
      viewContent.querySelector<HTMLElement>(
        ".nav-files-container"
      ) || viewContent;

    this.navContainer = navContainer;

    // --- Phase 1: mousedown starts tracking ---
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const raw = e.target as HTMLElement;
      const target =
        raw?.closest?.<HTMLElement>(".tree-item-self") ||
        raw?.closest?.<HTMLElement>("[data-path]");

      if (!target || !navContainer.contains(target)) return;

      const path = target.dataset.path;
      if (!path) return;

      this.dragState = {
        path,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: false,
        useMouseEvents: false,
        futureSibling: null,
        dropPosition: "before",
      };
    };

    // --- Phase 2a: mousemove for mouse-based drag ---
    const onMouseMove = (e: MouseEvent) => {
      if (!this.dragState) return;

      if (
        this.dragState.isDragging &&
        this.dragState.useMouseEvents
      ) {
        e.preventDefault();
        this.updateDragPosition(e.clientX, e.clientY);
        return;
      }

      if (!this.dragState.isDragging) {
        const dx = e.clientX - this.dragState.startX;
        const dy = e.clientY - this.dragState.startY;
        if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
          this.dragState.isDragging = true;
          this.dragState.useMouseEvents = true;
          this.startDrag();
          e.preventDefault();
        }
      }
    };

    // --- Phase 2b: dragstart for HTML5 drag ---
    const onDragStart = (e: DragEvent) => {
      if (
        this.dragState?.isDragging &&
        this.dragState.useMouseEvents
      ) {
        e.preventDefault();
        return;
      }

      const target =
        (
          e.target as HTMLElement
        )?.closest<HTMLElement>(".tree-item-self") ||
        (
          e.target as HTMLElement
        )?.closest<HTMLElement>("[data-path]");
      if (!target || !navContainer.contains(target)) return;

      const path = target.dataset.path;
      if (!path) return;

      if (this.dragState && this.dragState.path === path) {
        this.dragState.isDragging = true;
        this.dragState.useMouseEvents = false;
      } else {
        this.dragState = {
          path,
          startX: 0,
          startY: 0,
          isDragging: true,
          useMouseEvents: false,
          futureSibling: null,
          dropPosition: "before",
        };
      }

      console.log(
        "Sidebarrer: native drag started for",
        this.dragState.path
      );
      this.startDrag();
    };

    // --- Phase 3: drag event tracking (HTML5 path) ---
    const onDrag = (e: DragEvent) => {
      if (
        !this.dragState?.isDragging ||
        this.dragState.useMouseEvents
      )
        return;
      if (e.clientY === 0 && e.clientX === 0) return;
      this.updateDragPosition(e.clientX, e.clientY);
    };

    // --- Phase 4a: mouseup ends mouse-based drag ---
    const onMouseUp = () => {
      if (!this.dragState) return;
      if (
        this.dragState.isDragging &&
        this.dragState.useMouseEvents
      ) {
        this.endDrag();
      }
      if (!this.dragState?.isDragging) {
        this.dragState = null;
      }
    };

    // --- Phase 4b: dragend ends HTML5 drag ---
    const onDragEnd = () => {
      if (!this.dragState?.isDragging) return;
      this.endDrag();
    };

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    navContainer.addEventListener("dragstart", onDragStart);
    navContainer.addEventListener("drag", onDrag);
    navContainer.addEventListener("dragend", onDragEnd);
    document.addEventListener("dragstart", onDragStart, true);

    this.cleanupFns.push(
      () =>
        document.removeEventListener(
          "mousedown",
          onMouseDown,
          true
        ),
      () =>
        document.removeEventListener("mousemove", onMouseMove),
      () => document.removeEventListener("mouseup", onMouseUp),
      () =>
        navContainer.removeEventListener(
          "dragstart",
          onDragStart
        ),
      () => navContainer.removeEventListener("drag", onDrag),
      () =>
        navContainer.removeEventListener("dragend", onDragEnd),
      () =>
        document.removeEventListener(
          "dragstart",
          onDragStart,
          true
        )
    );

    console.log("Sidebarrer: drag-and-drop enabled");
  }

  disable(): void {
    if (this.dragState) {
      this.clearIndicators();
      document.body.classList.remove("sidebarrer-dragging");
      this.dragState = null;
    }
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
    this.navContainer = null;
  }

  private startDrag(): void {
    if (!this.dragState) return;
    console.log(
      "Sidebarrer: drag started for",
      this.dragState.path
    );
    document.body.classList.add("sidebarrer-dragging");
    this.collapseDraggedFolder(this.dragState.path);
  }

  private updateDragPosition(
    clientX: number,
    clientY: number
  ): void {
    if (!this.dragState || !this.navContainer) return;

    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      if (!this.dragState || !this.navContainer) return;

      const containerRect =
        this.navContainer.getBoundingClientRect();
      const isOutside =
        clientX < containerRect.left ||
        clientX > containerRect.right ||
        clientY < containerRect.top ||
        clientY > containerRect.bottom;

      if (isOutside) {
        this.clearIndicators();
        this.dragState.futureSibling = null;
        return;
      }

      const result = this.findDropTarget(
        clientY,
        this.dragState.path
      );
      this.dragState.futureSibling = result.futureSibling;
      this.dragState.dropPosition = result.dropPosition;
      this.updateIndicators(
        result.futureSibling?.el ?? null,
        result.dropPosition
      );
    });
  }

  private endDrag(): void {
    cancelAnimationFrame(this.rafId);
    this.clearIndicators();
    document.body.classList.remove("sidebarrer-dragging");

    if (!this.dragState) return;

    const { futureSibling, path, dropPosition } = this.dragState;
    this.dragState = null;

    if (!futureSibling) return;

    const siblingPath = futureSibling.file.path;
    if (siblingPath === path) return;

    const draggedParent =
      this.plugin.orderManager.getParentPath(path);
    const siblingParent =
      this.plugin.orderManager.getParentPath(siblingPath);

    if (draggedParent === siblingParent) {
      console.log(
        "Sidebarrer: moving",
        path,
        dropPosition,
        siblingPath
      );
      this.plugin.orderManager.moveItem(
        path,
        siblingPath,
        dropPosition
      );
      this.plugin.saveSettings();
      this.plugin.sortExplorer();
    }
  }

  /**
   * Find the nearest drop target using view.fileItems (API-based, not DOM-based).
   * This avoids issues with wrapper divs or unexpected DOM structures.
   */
  private findDropTarget(
    mouseY: number,
    draggedPath: string
  ): {
    futureSibling: FileTreeItem | null;
    dropPosition: "before" | "after";
  } {
    const view = this.plugin.getFileExplorerView();
    if (!view) {
      return { futureSibling: null, dropPosition: "before" };
    }

    const draggedParent =
      this.plugin.orderManager.getParentPath(draggedPath);

    // Find siblings (items in same folder) using Obsidian's API
    let bestItem: FileTreeItem | null = null;
    let bestPosition: "before" | "after" = "before";
    let bestDist = Infinity;

    for (const [itemPath, item] of Object.entries(
      view.fileItems
    )) {
      if (itemPath === draggedPath) continue;
      if (
        this.plugin.orderManager.getParentPath(itemPath) !==
        draggedParent
      )
        continue;
      if (!item.selfEl) continue;

      const rect = item.selfEl.getBoundingClientRect();
      // Skip items not visible (height 0 or off-screen)
      if (rect.height === 0) continue;

      const midY = rect.top + rect.height / 2;
      const dist = Math.abs(midY - mouseY);

      if (dist < bestDist) {
        bestDist = dist;
        bestItem = item;
        bestPosition = mouseY < midY ? "before" : "after";
      }
    }

    return { futureSibling: bestItem, dropPosition: bestPosition };
  }

  private updateIndicators(
    target: HTMLElement | null,
    position: "before" | "after"
  ): void {
    document
      .querySelectorAll("[data-sidebarrer-drop]")
      .forEach((el) => el.removeAttribute("data-sidebarrer-drop"));

    if (target) {
      target.dataset.sidebarrerDrop = position;
    }
  }

  private clearIndicators(): void {
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
