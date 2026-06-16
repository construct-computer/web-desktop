import { useState, useCallback } from 'react';
import { FileText, Image as ImageIcon, Download, Loader2 } from 'lucide-react';
import { AuthConnectCard } from '@/components/ui/AuthConnectCard';
import { EmailSetupCard } from '@/components/ui/EmailSetupCard';
import { parseAuthMarker } from '@/components/ui/authConnectMarker';
import { parseEmailSetupMarker } from '@/components/ui/emailSetupMarker';
import { AskUserCard } from '@/components/ui/AskUserCard';
import { ReasoningBlock } from '@/components/ui/ReasoningBlock';
import { MarkdownRenderer } from '@/components/ui';
import { downloadContainerFile } from '@/services/api';
import { log } from '@/lib/logger';
import { useComputerStore } from '@/stores/agentStore';
import constructStatic from '@/assets/construct/loader-static.png';
import { ChatEventRow } from './ChatEventRow';
import type { ChatMessage } from '@/stores/agentStore';
import { fileNameFromWorkspacePath, isImageWorkspacePath, workspaceDisplayPath } from '@/lib/workspacePaths';
import { StepLimitCard } from './StepLimitCard';
import { agentDisplayContent } from '@/lib/clippyAgentPreview';

const logger = log('AgentMessage');

export function AgentMessage({ msg, replySlot }: { msg: ChatMessage; replySlot?: React.ReactNode }) {
  const isError = msg.isError;

  if (msg.iterationLimit) {
    return <StepLimitCard msg={msg} />;
  }

  if (msg.role === 'notice' || isError) {
    return <ChatEventRow msg={msg} />;
  }

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

  const displayContent = agentDisplayContent(msg.content);
  if (!displayContent.trim() && !msg.askUser && !(msg.attachments?.length)) {
    return null;
  }

  const emailSetup = parseEmailSetupMarker(displayContent);
  if (emailSetup) {
    return (
      <>
        <div className="flex items-start gap-2.5 sm:gap-3 px-3 sm:px-6 py-2" style={{ animation: 'spt-in 150ms ease-out' }}>
          <img src={constructStatic} alt="" className="w-6 h-6 shrink-0 mt-0.5 drop-shadow-sm" />
          <div className="min-w-0 max-w-full sm:max-w-[90%]">
            <EmailSetupCard payload={emailSetup.payload} />
            {!emailSetup.rest && replySlot}
          </div>
        </div>
        {emailSetup.rest && (
          <div className="flex items-start gap-2.5 sm:gap-3 px-3 sm:px-6 py-1.5" style={{ animation: 'spt-in 150ms ease-out' }}>
            <img src={constructStatic} alt="" className="w-6 h-6 shrink-0 mt-0.5 drop-shadow-sm opacity-0" />
            <div className="min-w-0 max-w-full sm:max-w-[90%] text-[13px] text-[var(--color-text-muted)]/80">
              <MarkdownRenderer content={emailSetup.rest} />
              {replySlot}
            </div>
          </div>
        )}
      </>
    );
  }

  const auth = parseAuthMarker(displayContent);
  if (auth) {
    return (
      <>
        <div className="flex items-start gap-2.5 sm:gap-3 px-3 sm:px-6 py-2" style={{ animation: 'spt-in 150ms ease-out' }}>
          <img src={constructStatic} alt="" className="w-6 h-6 shrink-0 mt-0.5 drop-shadow-sm" />
          <div className="min-w-0 max-w-full sm:max-w-[90%]">
            <AuthConnectCard payload={auth.payload} />
            {!auth.rest && replySlot}
          </div>
        </div>
        {auth.rest && (
          <div className="flex items-start gap-2.5 sm:gap-3 px-3 sm:px-6 py-1.5" style={{ animation: 'spt-in 150ms ease-out' }}>
            <img src={constructStatic} alt="" className="w-6 h-6 shrink-0 mt-0.5 drop-shadow-sm opacity-0" />
            <div className="flex min-w-0 max-w-full sm:max-w-[90%] flex-col items-start gap-0.5">
              <div className="w-full text-[15px] leading-relaxed text-[var(--color-text)] selection:!bg-white/90 selection:!text-[var(--color-accent)]">
                <MarkdownRenderer content={auth.rest} />
              </div>
              {replySlot}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex items-start gap-2.5 sm:gap-3 px-3 sm:px-6 py-2" style={{ animation: 'spt-in 150ms ease-out' }}>
      <img src={constructStatic} alt="" className="w-6 h-6 shrink-0 mt-0.5 drop-shadow-sm" />
      <div className="flex min-w-0 max-w-full sm:max-w-[90%] flex-col items-start gap-0.5">
        <div className={`w-full text-[15px] leading-relaxed selection:!bg-white/90 selection:!text-[var(--color-accent)] ${isError ? '' : 'text-[var(--color-text)]'}`}>
          {!isError && msg.reasoning && <ReasoningBlock reasoning={msg.reasoning} />}
          {(() => {
            if (msg.askUser) return <AskUserCard data={msg.askUser} />;
            return <MarkdownRenderer content={displayContent} />;
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
    </div>
  );
}

function AttachmentChip({ filePath }: { filePath: string }) {
  const instanceId = useComputerStore(s => s.instanceId);
  const fileName = fileNameFromWorkspacePath(filePath);
  const isImage = isImageWorkspacePath(filePath);
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
      logger.error('Download failed', { error: err, filePath });
    } finally {
      setDownloading(false);
    }
  }, [instanceId, filePath, fileName, downloading]);

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      title={workspaceDisplayPath(filePath)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
    >
      {isImage ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
      <span className="truncate max-w-[140px]">{fileName}</span>
      {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 opacity-50" />}
    </button>
  );
}
