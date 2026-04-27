import { useState } from 'react';
import { HomeScreen } from '@/components/mini/screens/HomeScreen';
import { ChatScreen } from '@/components/mobile/ChatScreen';
import { useWindowStore } from '@/stores/windowStore';
import { ChevronLeft } from 'lucide-react';
import { MOBILE_MENUBAR_HEIGHT, MOBILE_APP_BAR_HEIGHT } from '@/lib/constants';

export function MobileDesktopBackground() {
  const [screen, setScreen] = useState<'home' | 'chat'>('home');
  const openWindow = useWindowStore((s) => s.openWindow);

  const handleNavigate = (target: string) => {
    if (target === 'chat') {
      setScreen('chat');
    } else {
      // Map other targets to window types
      const typeMap: Record<string, any> = {
        files: 'files',
        calendar: 'calendar',
        settings: 'settings',
        email: 'email',
        'app-registry': 'app-registry',
        memory: 'memory',
        'access-control': 'access-control',
        'audit-logs': 'auditlogs',
      };
      
      const windowType = typeMap[target];
      if (windowType) {
        openWindow(windowType);
      }
    }
  };

  return (
    <div 
      className="absolute inset-x-0 overflow-hidden flex flex-col"
      style={{
        top: MOBILE_MENUBAR_HEIGHT,
        bottom: MOBILE_APP_BAR_HEIGHT,
      }}
    >
      {screen === 'chat' && (
        <div className="flex items-center shrink-0 px-2 pt-1 pb-0.5 z-10 surface-toolbar border-b border-white/10">
          <button
            onClick={() => setScreen('home')}
            className="flex items-center gap-0.5 px-1.5 py-1.5 -ml-1 rounded-lg active:bg-white/5 transition-colors"
          >
            <ChevronLeft size={20} className="opacity-60" />
            <span className="text-[14px] font-medium opacity-60">Back</span>
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden relative">
        {screen === 'home' && <HomeScreen onNavigate={handleNavigate} />}
        {screen === 'chat' && <ChatScreen />}
      </div>
    </div>
  );
}
