import { useAuthStore } from '@/stores/authStore';
import { useDraggableWidget } from '@/hooks/useDraggableWidget';
import { MENUBAR_HEIGHT, Z_INDEX } from '@/lib/constants';

export function GreetingWidget() {
  const { containerStyle, containerProps } = useDraggableWidget('greeting', 'tl');
  const user = useAuthStore((s) => s.user);
  const nameToUse = user?.displayName || user?.username || '';
  const userName = nameToUse.split(' ')[0] || 'there';

  return (
    <div
      style={{
        ...containerStyle,
        // Override default top/left from useDraggableWidget if we want it to be nicely padded
        // It defaults to 8px padding from the corner.
      }}
      {...containerProps}
      className="flex flex-col select-none cursor-default"
    >
      <div className="px-5 py-4">
        <h1 className="text-4xl font-semibold leading-tight text-black/80 dark:text-white/90 drop-shadow-md">
          Hi <span className="text-[var(--color-accent)]">{userName}</span><br />
          Welcome
        </h1>
      </div>
    </div>
  );
}