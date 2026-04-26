import { useComputerStore } from '@/stores/agentStore';

function Divider() {
  return (
    <div
      className="h-[1px] my-2"
      style={{
        backgroundColor: 'rgba(128,128,128,0.2)',
      }}
    />
  );
}

export function TodoListWidget() {
  const todoList = useComputerStore((s) => s.todoList);

  if (!todoList || todoList.items.length === 0) return null;

  const done = todoList.items.filter(
    (i) => i.status === 'done' || i.status === 'skipped',
  ).length;
  const total = todoList.items.length;

  return (
    <div
      className="w-[240px] select-none pointer-events-auto font-mono text-[11px] leading-[1.7] mt-3
                 bg-white/70 dark:bg-black/70 backdrop-blur-2xl rounded-[20px] p-4 shadow-[var(--shadow-window)]
                 border border-black/10 dark:border-white/10"
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[10px] text-black/60 dark:text-white/60 font-extrabold uppercase tracking-[0.15em]">
          Tasks
        </span>
        <span className="text-[10px] text-black/40 dark:text-white/40 font-bold tabular-nums tracking-wide">
          {done}/{total}
        </span>
      </div>

      <Divider />

      {/* Goal */}
      <div className="text-black/90 dark:text-white/90 text-[11px] font-bold mb-2 leading-snug truncate" title={todoList.goal}>
        {todoList.goal}
      </div>

      {/* Progress bar */}
      <div
        className="h-[5px] rounded-full overflow-hidden mb-3"
        style={{
          backgroundColor: 'rgba(128,128,128,0.2)'
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${total > 0 ? (done / total) * 100 : 0}%`,
            backgroundColor:
              done === total
                ? 'rgba(74, 222, 128, 0.9)'
                : 'rgba(96, 165, 250, 0.9)',
          }}
        />
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1.5">
        {todoList.items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2"
            style={{
              opacity:
                item.status === 'done' || item.status === 'skipped'
                  ? 0.55
                  : 1,
            }}
          >
            <span className="flex-shrink-0 w-[14px] text-center text-[10px] leading-[1.7] font-bold">
              {item.status === 'done' ? <span className="text-emerald-500 dark:text-emerald-400">&#10003;</span>
               : item.status === 'skipped' ? <span className="text-black/40 dark:text-white/40">&mdash;</span>
               : item.status === 'in_progress' ? <span className="inline-block text-blue-500 dark:text-blue-400" style={{ animation: 'pulse 2s ease-in-out infinite' }}>&#9654;</span>
               : <span className="text-black/30 dark:text-white/30">&#9675;</span>}
            </span>
            <span
              className={`text-[11px] leading-[1.7] font-medium truncate ${
                item.status === 'done'
                  ? 'line-through text-black/60 dark:text-white/60'
                  : item.status === 'skipped'
                    ? 'line-through text-black/50 dark:text-white/50'
                    : item.status === 'in_progress'
                      ? 'text-blue-600 dark:text-blue-300 font-bold'
                      : 'text-black/80 dark:text-white/90'
              }`}
              title={item.text}
            >
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
