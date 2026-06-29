import { useEffect, useRef, useState } from 'react';
import { Image, Volume2, Check, Upload, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { useSettingsStore, WALLPAPERS, getBuiltinWallpaperSrc } from '@/stores/settingsStore';
import { useWallpaperStore } from '@/stores/wallpaperStore';
import { useWallpaperUrl } from '@/hooks/useWallpaperUrl';
import { displayWallpaperName, toCustomWallpaperId } from '@/lib/wallpapers';
import { ConfirmDialog } from '@/components/ui';
import { SectionPanel, SettingsCard, SettingsRow, Toggle } from './SettingsPrimitives';

function CustomWallpaperTile({
  path,
  isActive,
  onSelect,
  onDelete,
  deleting,
}: {
  path: string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const wallpaperId = toCustomWallpaperId(path);
  const { url, loading } = useWallpaperUrl(wallpaperId);

  return (
    <div
      className={`relative rounded-[10px] overflow-hidden transition-all duration-150 ring-2 ${
        isActive
          ? 'ring-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)]'
          : 'ring-transparent hover:ring-black/10 dark:hover:ring-white/10'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full focus:outline-none"
      >
        <div
          className="w-full aspect-[16/10] bg-black/10"
          style={{
            backgroundImage: loading ? undefined : `url(${url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {loading && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-white/50" />
            </div>
          )}
        </div>
        <div
          className="absolute inset-x-0 bottom-0 px-2 py-1 pr-14 text-[10px] font-medium truncate text-left"
          style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', color: 'rgba(255,255,255,0.9)' }}
        >
          {displayWallpaperName(path)}
        </div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="absolute bottom-1 right-1 z-10 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium opacity-80 hover:opacity-100 disabled:opacity-40"
        style={{ color: 'rgba(255,255,255,0.9)' }}
        aria-label="Delete wallpaper"
      >
        {deleting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
        Delete
      </button>
      {isActive && (
        <div className="absolute top-1.5 right-1.5 w-[18px] h-[18px] rounded-full bg-[var(--color-accent)] flex items-center justify-center shadow pointer-events-none">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

function AddWallpaperTile({ onUpload, uploading }: { onUpload: (file: File) => void; uploading: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className="relative rounded-[10px] overflow-hidden transition-all duration-150 focus:outline-none ring-2 ring-transparent hover:ring-black/10 dark:hover:ring-white/10 disabled:opacity-60"
    >
      <div className="w-full aspect-[16/10] flex flex-col items-center justify-center gap-1.5 bg-white/5 border border-dashed border-white/20">
        {uploading ? (
          <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
        ) : (
          <Upload className="w-5 h-5 text-white/30" />
        )}
        <span className="text-[10px] text-white/40 font-medium">Add wallpaper</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </button>
  );
}

function AppearanceInner() {
  const {
    wallpaperId,
    setWallpaper,
    soundEnabled,
    toggleSound,
    voiceAutoSend,
    setVoiceAutoSend,
    voiceEnabled,
    setVoiceEnabled,
  } = useSettingsStore();

  const {
    customWallpapers,
    loading,
    error,
    invalidatedNotice,
    fetchCustomWallpapers,
    uploadWallpaper,
    deleteWallpaper,
    runLegacyMigrationIfNeeded,
    clearInvalidatedNotice,
  } = useWallpaperStore();

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);

  useEffect(() => {
    void runLegacyMigrationIfNeeded().then(() => fetchCustomWallpapers());

    const onFocus = () => void fetchCustomWallpapers();
    const onVisibility = () => {
      if (!document.hidden) void fetchCustomWallpapers();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchCustomWallpapers, runLegacyMigrationIfNeeded]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    const result = await uploadWallpaper(file);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error || 'Upload failed');
    }
  };

  const executeDelete = async () => {
    if (!confirmDeletePath) return;
    const path = confirmDeletePath;
    setConfirmDeletePath(null);
    setDeletingPath(path);
    await deleteWallpaper(path);
    setDeletingPath(null);
  };

  return (
    <>
    <SectionPanel title="Appearance" subtitle="Desktop look, sound, and voice.">
      <div className="mt-5">
        <div className="flex items-center gap-2 mb-3">
          <Image className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="text-[13px] font-medium">Wallpaper</span>
        </div>

        {(uploadError || error || invalidatedNotice) && (
          <div className="mb-3 space-y-2">
            {uploadError && (
              <div className="flex items-center gap-2 text-[12px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {uploadError}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-[12px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
            {invalidatedNotice && (
              <div className="flex items-center justify-between gap-2 text-[12px] text-amber-600 dark:text-amber-400 bg-amber-500/8 border border-amber-500/15 rounded-[10px] px-3 py-2">
                <span>{invalidatedNotice}</span>
                <button type="button" onClick={clearInvalidatedNotice} className="text-[11px] underline shrink-0">
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}

        <div className="settings-wallpaper-grid grid gap-2.5">
          {WALLPAPERS.map((wp) => {
            const isActive = wallpaperId === wp.id;
            return (
              <button
                key={wp.id}
                type="button"
                onClick={() => setWallpaper(wp.id)}
                className={`relative rounded-[10px] overflow-hidden transition-all duration-150 focus:outline-none ring-2 ${
                  isActive
                    ? 'ring-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)]'
                    : 'ring-transparent hover:ring-black/10 dark:hover:ring-white/10'
                }`}
              >
                <div
                  className="w-full aspect-[16/10]"
                  style={{
                    backgroundImage: `url(${getBuiltinWallpaperSrc(wp.id)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-medium truncate"
                  style={{
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                >
                  {wp.name}
                </div>
                {isActive && (
                  <div className="absolute top-1.5 right-1.5 w-[18px] h-[18px] rounded-full bg-[var(--color-accent)] flex items-center justify-center shadow">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}

          {loading && customWallpapers.length === 0 && (
            <div className="flex aspect-[16/10] items-center justify-center rounded-[10px] bg-white/5">
              <Loader2 className="w-4 h-4 animate-spin text-white/40" />
            </div>
          )}

          {customWallpapers.map((entry) => (
            <CustomWallpaperTile
              key={entry.path}
              path={entry.path}
              isActive={wallpaperId === toCustomWallpaperId(entry.path)}
              onSelect={() => setWallpaper(toCustomWallpaperId(entry.path))}
              onDelete={() => setConfirmDeletePath(entry.path)}
              deleting={deletingPath === entry.path}
            />
          ))}

          <AddWallpaperTile onUpload={(file) => void handleUpload(file)} uploading={uploading} />
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-black/6 dark:border-white/6">
        <div className="flex items-center gap-2 mb-3">
          <Volume2 className="w-4 h-4 text-text-muted" />
          <span className="text-[13px] font-medium">Sound</span>
        </div>
        <SettingsCard>
          <SettingsRow label="Voice input" description="Enable voice transcription in chat.">
            <Toggle checked={voiceEnabled} onChange={setVoiceEnabled} />
          </SettingsRow>
          <SettingsRow label="UI Sounds" description="Play sounds for clicks, notifications, and other actions.">
            <Toggle checked={soundEnabled} onChange={toggleSound} />
          </SettingsRow>
          <SettingsRow
            label="Voice Auto-Send"
            info="When this is on, spoken messages are sent as soon as transcription finishes."
            description="Automatically send transcribed voice messages instead of placing them in the input for review."
          >
            <Toggle checked={voiceAutoSend} onChange={setVoiceAutoSend} />
          </SettingsRow>
        </SettingsCard>
      </div>
    </SectionPanel>
    <ConfirmDialog
      open={!!confirmDeletePath}
      title="Delete Wallpaper"
      message={
        confirmDeletePath
          ? `Are you sure you want to delete "${displayWallpaperName(confirmDeletePath)}"? This action cannot be undone.`
          : ''
      }
      confirmLabel="Delete"
      destructive
      onConfirm={() => void executeDelete()}
      onCancel={() => setConfirmDeletePath(null)}
    />
    </>
  );
}

export function AppearanceSection() {
  return <AppearanceInner />;
}
