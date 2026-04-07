/**
 * MemoryScreen — Browse, search, and manage agent memories in the Telegram Mini App.
 * Desktop parity with entity type colors, relations, timestamps, and semantic search.
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Brain, RefreshCw, ArrowRight } from 'lucide-react';
import {
  MiniHeader, Card, Badge, ConfirmDialog, useToast, haptic,
  SkeletonList, EmptyState, SectionLabel, IconBtn,
  api, bg2, textColor, accent, formatRelativeTime,
} from '../ui';

// ── Types ──

interface Memory {
  id: string;
  memory: string;
  hash?: string;
  created_at?: string;
  updated_at?: string;
  categories?: string[];
}

interface Relation {
  source: string;
  source_type: string;
  relationship: string;
  target: string;
  target_type: string;
  score?: number;
}

// ── Entity type colors (matches desktop exactly) ──

const TYPE_COLORS: Record<string, string> = {
  person: '#6366f1',
  concept: '#8b5cf6',
  tool: '#3b82f6',
  project: '#10b981',
  location: '#f59e0b',
  event: '#ef4444',
  organization: '#ec4899',
  technology: '#06b6d4',
  file: '#84cc16',
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type?.toLowerCase()] || '#94a3b8';
}

// ── Helpers ──

function guessEntityType(memory: Memory): string | null {
  if (!memory.categories || memory.categories.length === 0) return null;
  const cat = memory.categories[0].toLowerCase();
  if (TYPE_COLORS[cat]) return cat;
  return null;
}

function borderColorForMemory(memory: Memory): string {
  const type = guessEntityType(memory);
  return type ? getTypeColor(type) : 'rgba(255,255,255,0.08)';
}

// ── Component ──

export function MemoryScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const toast = useToast();

  // ── Fetch all memories + relations ──

  const fetchMemories = useCallback(async () => {
    try {
      const res = await api('/mem0/memories');
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
        setRelations(data.relations || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  // ── Semantic search ──

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setLoading(true);
      await fetchMemories();
      return;
    }
    setSearching(true);
    try {
      const res = await api('/mem0/memories/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || data.results || []);
      }
    } catch { /* ignore */ }
    setSearching(false);
  };

  // ── Delete ──

  const handleDelete = async (mem: Memory) => {
    setDeletingId(mem.id);
    setDeleteTarget(null);
    try {
      const res = await api(`/mem0/memories/${mem.id}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories(prev => prev.filter(m => m.id !== mem.id));
        haptic('success');
        toast.show('Memory deleted', 'success');
      } else {
        haptic('error');
        toast.show('Failed to delete memory', 'error');
      }
    } catch {
      haptic('error');
      toast.show('Failed to delete memory', 'error');
    }
    setDeletingId(null);
  };

  // ── Refresh ──

  const handleRefresh = async () => {
    haptic('light');
    setSearchQuery('');
    setLoading(true);
    await fetchMemories();
  };

  return (
    <div className="flex flex-col h-full">
      <MiniHeader
        title="Memory"
        actions={
          <IconBtn onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={`opacity-50 ${loading ? 'animate-spin' : ''}`} />
          </IconBtn>
        }
      />

      {/* Search bar */}
      <div className="px-4 pb-3 pt-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search memories..."
              className="w-full text-[13px] pl-8 pr-3 py-2.5 rounded-xl outline-none"
              style={{ backgroundColor: bg2(), color: textColor() }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2 rounded-xl text-[12px] font-medium active:opacity-80 flex items-center gap-1.5"
            style={{ backgroundColor: accent(), color: '#fff' }}
          >
            {searching ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Search size={13} />
            )}
            Search
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {loading ? (
          <SkeletonList count={5} />
        ) : memories.length === 0 ? (
          <EmptyState
            icon={Brain}
            message={searchQuery ? 'No results found' : 'No memories yet'}
          />
        ) : (
          <>
            {/* Memory count */}
            <SectionLabel>
              {memories.length} memor{memories.length === 1 ? 'y' : 'ies'}
            </SectionLabel>

            {/* Memory cards */}
            <div className="space-y-2">
              {memories.map(mem => (
                <div
                  key={mem.id}
                  className="rounded-xl p-3 relative overflow-hidden"
                  style={{
                    backgroundColor: bg2(),
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    borderLeft: `3px solid ${borderColorForMemory(mem)}`,
                  }}
                >
                  {/* Memory text */}
                  <p className="text-[13px] leading-relaxed opacity-80 pr-8" style={{ color: textColor() }}>
                    {mem.memory}
                  </p>

                  {/* Category badges */}
                  {mem.categories && mem.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {mem.categories.map(cat => (
                        <Badge key={cat} color={getTypeColor(cat)}>
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Timestamps + metadata */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {mem.created_at && (
                      <span className="text-[10px] opacity-25">
                        Created {formatRelativeTime(mem.created_at)}
                      </span>
                    )}
                    {mem.updated_at && mem.updated_at !== mem.created_at && (
                      <span className="text-[10px] opacity-25">
                        Updated {formatRelativeTime(mem.updated_at)}
                      </span>
                    )}
                    <span className="text-[10px] font-mono opacity-15">{mem.id.slice(0, 12)}</span>
                    {mem.hash && <span className="text-[10px] font-mono opacity-15">#{mem.hash.slice(0, 8)}</span>}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => setDeleteTarget(mem)}
                    disabled={deletingId === mem.id}
                    className="absolute top-3 right-3 p-1.5 rounded-lg active:bg-white/5 opacity-25"
                  >
                    {deletingId === mem.id ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Relations section */}
            {relations.length > 0 && (
              <div className="pt-2">
                <SectionLabel>
                  {relations.length} relation{relations.length === 1 ? '' : 's'}
                </SectionLabel>
                <div className="space-y-1.5">
                  {relations.map((rel, i) => (
                    <Card key={i} className="!p-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                        <Badge color={getTypeColor(rel.source_type)}>
                          {rel.source_type}
                        </Badge>
                        <span className="font-medium opacity-80" style={{ color: textColor() }}>
                          {rel.source}
                        </span>
                        <ArrowRight size={10} className="opacity-30 shrink-0" />
                        <span className="text-[11px] opacity-40 italic">
                          {rel.relationship}
                        </span>
                        <ArrowRight size={10} className="opacity-30 shrink-0" />
                        <Badge color={getTypeColor(rel.target_type)}>
                          {rel.target_type}
                        </Badge>
                        <span className="font-medium opacity-80" style={{ color: textColor() }}>
                          {rel.target}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Memory"
          message="This memory will be permanently removed. This action cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
