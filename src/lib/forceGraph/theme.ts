export function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export function edgeColor(isHighlighted: boolean, isDark = isDarkMode()): string {
  if (isHighlighted) {
    return isDark ? 'rgba(167,139,250,0.6)' : 'rgba(99,102,241,0.5)';
  }
  return isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
}

/** Higher-contrast edges for the desktop agent graph on wallpaper backgrounds. */
export function agentGraphEdgeColor(active: boolean, isDark = isDarkMode()): string {
  if (active) {
    return isDark ? 'rgba(96,165,250,0.55)' : 'rgba(37,99,235,0.45)';
  }
  return isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.28)';
}

/** Animated flow dashes — bright on a dark halo so they read on any wallpaper. */
export function agentGraphFlowDashStyle(isDark = isDarkMode()): {
  halo: string;
  dash: string;
  dashWidth: number;
  haloWidth: number;
  pattern: [number, number];
} {
  return {
    halo: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)',
    dash: isDark ? '#bae6fd' : '#ffffff',
    dashWidth: 2.25,
    haloWidth: 4,
    pattern: [7, 6],
  };
}

export function edgeLabelColor(isDark = isDarkMode()): string {
  return isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
}

export function nodeLabelColor(dimmed: boolean, isDark = isDarkMode()): string {
  if (dimmed) {
    return isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  }
  return isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
}

export function dimmedNodeFill(isDark = isDarkMode()): string {
  return isDark ? 'rgba(100,100,120,0.3)' : 'rgba(200,200,210,0.5)';
}

export function nodeStrokeColor(isDark = isDarkMode()): string {
  return isDark ? '#fff' : '#000';
}

/** Wallpaper overlay labels — higher contrast on arbitrary backgrounds. */
export function wallpaperLabelColor(dimmed: boolean): string {
  if (dimmed) return 'rgba(255,255,255,0.2)';
  return 'rgba(255,255,255,0.9)';
}

export function wallpaperLabelMuted(dimmed: boolean): string {
  if (dimmed) return 'rgba(255,255,255,0.12)';
  return 'rgba(255,255,255,0.55)';
}
