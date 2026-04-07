import { useState, useCallback } from 'react';
import { AlertCircle, FileText, Image as ImageIcon, Download, Loader2, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { AuthConnectCard, parseAuthMarker } from '@/components/ui/AuthConnectCard';
import { AskUserCard } from '@/components/ui/AskUserCard';
import { MarkdownRenderer } from '@/components/ui';
import { downloadContainerFile } from '@/services/api';
import { useComputerStore } from '@/stores/agentStore';
import constructVideo from '@/assets/construct/loader.webm';
import type { ChatMessage } from '@/stores/agentStore';

const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg)$/i;

/** Parse an error string, extracting a human-readable message and structured details. */
function parseError(content: string): { title: string; detail?: string; code?: number; provider?: string; raw?: string } {
  // Try to parse as "Error: {json}"
  const jsonMatch = content.match(/^Error:\s*(\{[\s\S]*\})$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const err = parsed.error || parsed;
      const message = err.message || err.raw || content;
      const code = err.code;
      const provider = err.metadata?.provider_name;
      // Extract a clean message from raw if it's nested JSON
      let cleanMessage = message;
      if (err.metadata?.raw) {
        try {
          const rawParsed = JSON.parse(err.metadata.raw);
          cleanMessage = rawParsed.error?.message || cleanMessage;
        } catch { /* use as-is */ }
      }
      return { title: cleanMessage, code, provider, raw: jsonMatch[1] };
    } catch { /* not valid JSON */ }
  }

  // Try just "Error: message"
  const simpleMatch = content.match(/^Error:\s*(.+)/);
  if (simpleMatch) {
    return { title: simpleMatch[1] };
  }

  return { title: content };
}

function ErrorCard({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { title, code, provider, raw } = parseError(content);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(raw || content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [raw, content]);

  return (
    <div className="rounded-xl bg-red-500/[0.06] border border-red-500/15 overflow-hidden max-w-[480px]">
      {/* Header */}
      <div className="flex items-start gap-2.5 px-3.5 py-2.5">
        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-red-300 leading-relaxed">{title}</p>
          {(code || provider) && (
            <div className="flex items-center gap-2 mt-1.5">
              {code && (
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/70">{code}</span>
              )}
              {provider && (
                <span className="text-[10px] text-red-400/50">{provider}</span>
              )}
            </div>
          )}
        </div>
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="p-1 rounded-md hover:bg-red-500/10 text-red-400/40 hover:text-red-400/70 transition-colors flex-shrink-0"
          title="Copy error details"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expandable raw details */}
      {raw && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-1.5 px-3.5 py-1.5 text-[10px] font-medium text-red-400/40 hover:text-red-400/60 border-t border-red-500/10 hover:bg-red-500/[0.03] transition-colors"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Raw details
          </button>
          {expanded && (
            <pre className="px-3.5 pb-3 text-[10px] font-mono text-red-400/50 leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
              {JSON.stringify(JSON.parse(raw), null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

export function AgentMessage({ msg, replySlot }: { msg: ChatMessage; replySlot?: React.ReactNode }) {
  const isError = msg.isError;

  // Stopped message — centered divider
  if (msg.isStopped) {
    return (
      <div className="flex items-center gap-3 px-6 py-1">
        <div className="flex-1 h-px bg-[var(--color-border)]/15" />
        <span className="text-[10px] text-[var(--color-text-muted)]/30 italic">{msg.content}</span>
        <div className="flex-1 h-px bg-[var(--color-border)]/15" />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-6 py-2" style={{ animation: 'spt-in 150ms ease-out' }}>
      {isError ? (
        <div className="w-6 h-6 shrink-0 rounded-full bg-red-500/10 flex items-center justify-center mt-0.5 text-red-500 font-bold border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400" />
        </div>
      ) : (
        <video src={constructVideo} muted playsInline className="w-6 h-6 shrink-0 mt-0.5 drop-shadow-sm" />
      )}
      <div className={`min-w-0 max-w-[90%] text-[15px] leading-relaxed selection:!bg-white/90 selection:!text-[var(--color-accent)] ${isError ? '' : 'text-[var(--color-text)]'}`}>
        {(() => {
          if (msg.askUser) return <AskUserCard data={msg.askUser} />;
          if (isError) return <ErrorCard content={msg.content} />;
          const auth = parseAuthMarker(msg.content);
          if (auth) return <><AuthConnectCard payload={auth.payload} />{auth.rest && <MarkdownRenderer content={auth.rest} />}</>;
          return <MarkdownRenderer content={msg.content} />;
        })()}

        {/* File attachments */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {msg.attachments.map((filePath, i) => (
              <AttachmentChip key={i} filePath={filePath} />
            ))}
          </div>
        )}
      </div>
      {replySlot}
    </div>
  );
}

function AttachmentChip({ filePath }: { filePath: string }) {
  const instanceId = useComputerStore(s => s.instanceId);
  const fileName = filePath.split('/').pop() || filePath;
  const isImage = IMAGE_EXT.test(fileName);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!instanceId || downloading) return;
    setDownloading(true);
    try {
      const res = await downloadContainerFile(instanceId, filePath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  }, [instanceId, filePath, fileName, downloading]);

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
    >
      {isImage ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
      <span className="truncate max-w-[140px]">{fileName}</span>
      {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 opacity-50" />}
    </button>
  );
}
