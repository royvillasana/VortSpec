import type { InspectorBridge } from "@vortspec/ui/useInspectorBridge";

/**
 * A stub `InspectorBridge` for component tests — the guest `<webview>` and its real
 * geometry don't exist in CT, so bridge state (placeholder, insert target, …) is
 * injected directly and command methods are no-ops (or recorders) via `overrides`.
 */
export function makeBridge(overrides: Partial<InspectorBridge> = {}): InspectorBridge {
  const noop = (): void => {};
  return {
    attach: noop,
    ready: true,
    error: null,
    tree: null,
    readout: null,
    selectedId: null,
    hoveredId: null,
    rects: {},
    runtimeError: null,
    clearRuntimeError: noop,
    textEdited: null,
    clearTextEdited: noop,
    contextMenu: null,
    clearContextMenu: noop,
    selectionLost: false,
    clearSelectionLost: noop,
    setText: noop,
    setClass: noop,
    select: noop,
    hover: noop,
    setMode: noop,
    commentTarget: null,
    clearCommentTarget: noop,
    insertTarget: null,
    placeholder: null,
    placeholderLost: null,
    clearPlaceholderLost: noop,
    resizePlaceholder: noop,
    dismissPlaceholder: noop,
    setPlaceholderSpec: noop,
    previewOption: noop,
    structure: null,
    requestStructure: noop,
    drag: null,
    dragDrop: null,
    clearDragDrop: noop,
    dragMessage: null,
    clearDragMessage: noop,
    cancelDrag: noop,
    anchorRects: {},
    watchAnchors: noop,
    scrollToAnchor: noop,
    captureThumbnail: async () => "",
    applyOverride: noop,
    clearOverride: noop,
    refreshReadout: noop,
    requestTree: noop,
    reload: noop,
    ...overrides,
  };
}
