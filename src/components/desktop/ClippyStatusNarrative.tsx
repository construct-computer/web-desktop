export function ClippyStatusNarrative({
  text,
  isMobile,
  showDivider = true,
}: {
  text: string;
  isMobile?: boolean;
  showDivider?: boolean;
}) {
  if (!text.trim()) return null;

  return (
    <div
      className={showDivider ? 'border-b border-white/12 pb-2 mb-2' : ''}
      style={{
        borderLeft: '2px solid rgba(255,255,255,0.35)',
        paddingLeft: 8,
      }}
    >
      <p
        className="line-clamp-2 break-words"
        style={{
          color: 'rgba(255,255,255,0.94)',
          fontSize: isMobile ? 12 : 13,
          fontWeight: 500,
          lineHeight: 1.45,
          textShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      >
        {text}
      </p>
    </div>
  );
}
