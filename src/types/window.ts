export type WindowType =
  | 'browser'
  | 'terminal'
  | 'files'
  | 'editor'
  | 'document-viewer'
  | 'document-workbench'
  | 'settings'
  | 'about'
  | 'calendar'
  | 'auditlogs'
  | 'memory'
  | 'email'
  | 'access-control'
  | 'app-registry'
  | 'app';

/** Panel types that live in the MenuBar dropdown, not as standalone windows. */
export type MenuBarPanelType = 'chat' | 'tracker';

export type WindowState = 'normal' | 'minimized' | 'maximized';

export type WorkspacePlatform = 'desktop' | 'slack' | 'telegram' | 'email' | 'calendar';

/** A virtual desktop workspace. Windows belong to exactly one workspace. */
export interface Workspace {
  id: string;
  name: string;
  platform: WorkspacePlatform;
  /** The agent session/lane key that created this workspace (e.g. "slack_abc123"). */
  laneKey?: string;
  /** Accent color for the workspace indicator. */
  color?: string;
  /** Whether the agent is currently active on this workspace's lane. */
  active?: boolean;
}

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowBounds extends WindowPosition, WindowSize {}

export interface WindowConfig {
  id: string;
  type: WindowType;
  title: string;
  icon?: string;
  
  // Position and size
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Constraints
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  
  // Aspect ratio constraint for the content area (width / height).
  // Only enforced during resize when lockAspectRatio is true.
  aspectRatio?: number;
  // Height of window chrome (titlebar + toolbars) to subtract when computing
  // content area for aspect ratio enforcement.
  chromeHeight?: number;
  // When true, resizing maintains the aspectRatio for the content area.
  lockAspectRatio?: boolean;
  
  // State
  state: WindowState;
  zIndex: number;
  
  // Workspace this window belongs to (defaults to 'main')
  workspaceId: string;
  
  // Optional agent association
  agentId?: string;
  
  // Arbitrary per-window data (e.g. filePath for editor windows)
  metadata?: Record<string, unknown>;
  
  // For restoring from maximized/minimized
  previousBounds?: WindowBounds;
}

export type ResizeHandle = 
  | 'n' | 's' | 'e' | 'w' 
  | 'nw' | 'ne' | 'sw' | 'se';
