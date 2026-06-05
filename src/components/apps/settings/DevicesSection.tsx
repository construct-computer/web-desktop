import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw, LogOut, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  listAuthSessions, removeLoggedOutAuthSession, revokeAuthSession, revokeOtherAuthSessions,
  type AuthSessionRecord,
} from '@/services/api';
import { SectionPanel, SettingsCard } from './SettingsPrimitives';

function formatRelativeTime(value: number): string {
  const diffMs = Date.now() - value;
  if (diffMs < 10_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function surfaceLabel(surface: string): string {
  if (surface === 'mobile_app') return 'Mobile app';
  if (surface === 'desktop_app') return 'Desktop app';
  if (surface === 'telegram_mini') return 'Telegram Mini App';
  return 'Web';
}

type DeviceIconKind = 'apple' | 'windows' | 'linux' | 'ios' | 'android' | 'chrome' | 'safari' | 'firefox' | 'unknown';

type DeviceIconDef = {
  viewBox: string;
  paths: string[];
};

const DEVICE_ICON_DEFS: Record<DeviceIconKind, DeviceIconDef> = {
  apple: {
    viewBox: '0 0 24 24',
    paths: ['M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701'],
  },
  windows: {
    viewBox: '0 0 220.4763 197.90555',
    paths: [
      'm 26.439608,86.768124 c 26.14961,-11.999037 53.400287,-10.05119 81.569812,3.53553 L 129.98024,12.521917 C 103.73744,-0.59035099 76.825923,-6.346661 47.905348,9.996537 l -21.46574,76.771587 z',
      'm 136.87567,14.440933 c 37.12442,16.941206 63.60564,10.953386 83.60063,5.494562 l -21.41497,74.560029 c -38.65877,18.804756 -61.76395,6.732886 -84.40902,-1.76777 l 22.22336,-78.286821 z',
      'm 112.88454,99.798824 c 24.84913,10.473786 50.99998,17.042406 83.84266,3.535526 l -26.5165,84.85282 c -31.32181,15.69984 -55.19162,10.42629 -81.822356,-2.02031 L 112.88454,99.798824 z',
      'm 0,180.61102 c 26.467815,-13.7934 53.756651,-10.75585 81.569818,3.03046 L 106.06601,97.020904 C 94.779504,91.864744 68.843056,77.704254 23.738585,96.010754 L 0,180.61102 z',
    ],
  },
  linux: {
    viewBox: '0 0 24 24',
    paths: ['M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z'],
  },
  ios: {
    viewBox: '0 0 24 24',
    paths: ['M1.1 6.05C.486 6.05 0 6.53 0 7.13A1.08 1.08 0 0 0 1.1 8.21C1.72 8.21 2.21 7.73 2.21 7.13C2.21 6.53 1.72 6.05 1.1 6.05M8.71 6.07C5.35 6.07 3.25 8.36 3.25 12C3.25 15.67 5.35 17.95 8.71 17.95C12.05 17.95 14.16 15.67 14.16 12C14.16 8.36 12.05 6.07 8.71 6.07M19.55 6.07C17.05 6.07 15.27 7.45 15.27 9.5C15.27 11.13 16.28 12.15 18.4 12.64L19.89 13C21.34 13.33 21.93 13.81 21.93 14.64C21.93 15.6 20.96 16.28 19.58 16.28C18.17 16.28 17.11 15.59 17 14.53H15C15.08 16.65 16.82 17.95 19.46 17.95C22.25 17.95 24 16.58 24 14.4C24 12.69 23 11.72 20.68 11.19L19.35 10.89C17.94 10.55 17.36 10.1 17.36 9.34C17.36 8.38 18.24 7.74 19.54 7.74C20.85 7.74 21.75 8.39 21.85 9.46H23.81C23.76 7.44 22.09 6.07 19.55 6.07M8.71 7.82C10.75 7.82 12.06 9.45 12.06 12C12.06 14.57 10.75 16.2 8.71 16.2C6.65 16.2 5.35 14.57 5.35 12C5.35 9.45 6.65 7.82 8.71 7.82M.111 9.31V17.76H2.1V9.31H.11Z'],
  },
  android: {
    viewBox: '0 0 24 24',
    paths: ['M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z'],
  },
  chrome: {
    viewBox: '0 0 24 24',
    paths: ['M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z'],
  },
  safari: {
    viewBox: '0 0 24 24',
    paths: ['M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm8.439 4.81c.038 0 .071.02.092.075a.112.112 0 0 1-.023.117l-7.606 8.08c-3.084 2.024-6.149 4.04-9.222 6.05-.078.051-.17.082-.211-.028a.112.112 0 0 1 .023-.118l7.594-8.08c3.084-2.023 6.161-4.039 9.234-6.049a.247.247 0 0 1 .12-.046zm-9.377 6.854 1.095 1.31c-2.027 1.33-4.047 2.652-6.066 3.976z'],
  },
  firefox: {
    viewBox: '0 0 24 24',
    paths: ['M8.824 7.287c.008 0 .004 0 0 0zm-2.8-1.4c.006 0 .003 0 0 0zm16.754 2.161c-.505-1.215-1.53-2.528-2.333-2.943.654 1.283 1.033 2.57 1.177 3.53l.002.02c-1.314-3.278-3.544-4.6-5.366-7.477-.091-.147-.184-.292-.273-.446a3.545 3.545 0 01-.13-.24 2.118 2.118 0 01-.172-.46.03.03 0 00-.027-.03.038.038 0 00-.021 0l-.006.001a.037.037 0 00-.01.005L15.624 0c-2.585 1.515-3.657 4.168-3.932 5.856a6.197 6.197 0 00-2.305.587.297.297 0 00-.147.37c.057.162.24.24.396.17a5.622 5.622 0 012.008-.523l.067-.005a5.847 5.847 0 011.957.222l.095.03a5.816 5.816 0 01.616.228c.08.036.16.073.238.112l.107.055a5.835 5.835 0 01.368.211 5.953 5.953 0 012.034 2.104c-.62-.437-1.733-.868-2.803-.681 4.183 2.09 3.06 9.292-2.737 9.02a5.164 5.164 0 01-1.513-.292 4.42 4.42 0 01-.538-.232c-1.42-.735-2.593-2.121-2.74-3.806 0 0 .537-2 3.845-2 .357 0 1.38-.998 1.398-1.287-.005-.095-2.029-.9-2.817-1.677-.422-.416-.622-.616-.8-.767a3.47 3.47 0 00-.301-.227 5.388 5.388 0 01-.032-2.842c-1.195.544-2.124 1.403-2.8 2.163h-.006c-.46-.584-.428-2.51-.402-2.913-.006-.025-.343.176-.389.206-.406.29-.787.616-1.136.974-.397.403-.76.839-1.085 1.303a9.816 9.816 0 00-1.562 3.52c-.003.013-.11.487-.19 1.073-.013.09-.026.181-.037.272a7.8 7.8 0 00-.069.667l-.002.034-.023.387-.001.06C.386 18.795 5.593 24 12.016 24c5.752 0 10.527-4.176 11.463-9.661.02-.149.035-.298.052-.448.232-1.994-.025-4.09-.753-5.844z'],
  },
  unknown: {
    viewBox: '0 0 24 24',
    paths: ['M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm0 3.2a8.8 8.8 0 0 1 8.7 7.6h-3.3a14.5 14.5 0 0 0-1.7-5.2A8.8 8.8 0 0 0 12 3.2zm0 0c1 .9 1.9 3.1 2.2 7.6H9.8C10.1 6.3 11 4.1 12 3.2zM3.3 13.2h4.2c.1 2.1.4 3.9.9 5.3a8.8 8.8 0 0 1-5.1-5.3zm4.2-2.4H3.3a8.8 8.8 0 0 1 5.1-5.3 17.7 17.7 0 0 0-.9 5.3zm2.4 2.4h4.2c-.3 4.5-1.1 6.7-2.1 7.6-1-.9-1.8-3.1-2.1-7.6zm6.6 0h4.2a8.8 8.8 0 0 1-5.1 5.3c.5-1.4.8-3.2.9-5.3z'],
  },
};

function sessionIconKind(session: AuthSessionRecord): DeviceIconKind {
  const os = (session.os || '').toLowerCase();
  const browser = (session.browser || '').toLowerCase();
  if (session.surface === 'web') {
    if (browser.includes('chrome')) return 'chrome';
    if (browser.includes('safari')) return 'safari';
    if (browser.includes('firefox')) return 'firefox';
  }
  if (os.includes('ios') || os.includes('iphone') || os.includes('ipad')) return 'ios';
  if (os.includes('android')) return 'android';
  if (os.includes('mac')) return 'apple';
  if (os.includes('windows')) return 'windows';
  if (os.includes('linux')) return 'linux';
  return 'unknown';
}

function DeviceSessionIcon({ session, className }: { session: AuthSessionRecord; className?: string }) {
  const icon = DEVICE_ICON_DEFS[sessionIconKind(session)];
  return (
    <svg viewBox={icon.viewBox} className={className} fill="currentColor" aria-hidden="true">
      {icon.paths.map((path, index) => <path key={index} d={path} />)}
    </svg>
  );
}

type DisplayAuthSession = AuthSessionRecord & {
  sessionIds: string[];
  activeSessionIds: string[];
  revokedSessionIds: string[];
  duplicateCount: number;
};

function deviceGroupKey(session: AuthSessionRecord): string {
  if (session.deviceId) return `device:${session.deviceId}`;
  return [
    'fingerprint',
    session.surface || '',
    session.deviceType || '',
    session.browser || '',
    session.os || '',
    session.ipAddress || '',
    session.location || '',
    session.timezone || '',
  ].join('|').toLowerCase();
}

function compareSessionsForDisplay(a: AuthSessionRecord, b: AuthSessionRecord): number {
  if (a.current !== b.current) return a.current ? -1 : 1;
  const aRevoked = Boolean(a.revokedAt);
  const bRevoked = Boolean(b.revokedAt);
  if (aRevoked !== bRevoked) return aRevoked ? 1 : -1;
  if (a.online !== b.online) return a.online ? -1 : 1;
  return (b.lastSeenAt || 0) - (a.lastSeenAt || 0) || (b.updatedAt || 0) - (a.updatedAt || 0);
}

function dedupeAuthSessions(sessions: AuthSessionRecord[]): DisplayAuthSession[] {
  const groups = new Map<string, AuthSessionRecord[]>();
  for (const session of sessions) {
    const key = deviceGroupKey(session);
    groups.set(key, [...(groups.get(key) || []), session]);
  }

  return Array.from(groups.values())
    .map((group) => {
      const sorted = [...group].sort(compareSessionsForDisplay);
      const representative = sorted[0];
      return {
        ...representative,
        sessionIds: sorted.map((session) => session.id),
        activeSessionIds: sorted.filter((session) => !session.revokedAt && !session.current).map((session) => session.id),
        revokedSessionIds: sorted.filter((session) => session.revokedAt).map((session) => session.id),
        duplicateCount: sorted.length,
      };
    })
    .sort(compareSessionsForDisplay);
}

export function DevicesSection() {
  const [sessions, setSessions] = useState<AuthSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listAuthSessions();
    if (result.success) {
      setSessions(result.data.sessions);
      setError(null);
    } else {
      setError(result.error || 'Failed to load devices');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const revokeOne = async (session: DisplayAuthSession) => {
    setBusy(`revoke:${session.id}`);
    const ids = session.activeSessionIds.length > 0 ? session.activeSessionIds : [session.id];
    for (const id of ids) {
      const result = await revokeAuthSession(id);
      if (!result.success) {
        setError(result.error || 'Failed to log out device');
        break;
      }
    }
    await refresh();
    setBusy(null);
  };

  const removeLoggedOut = async (session: DisplayAuthSession) => {
    setBusy(`remove:${session.id}`);
    for (const id of session.revokedSessionIds) {
      const result = await removeLoggedOutAuthSession(id);
      if (!result.success) {
        setError(result.error || 'Failed to remove logged out device');
        break;
      }
    }
    await refresh();
    setBusy(null);
  };

  const revokeOthers = async () => {
    setBusy('others');
    const result = await revokeOtherAuthSessions();
    if (!result.success) setError(result.error || 'Failed to log out other devices');
    await refresh();
    setBusy(null);
  };

  const activeSessions = sessions.filter((session) => !session.revokedAt);
  const otherActiveCount = activeSessions.filter((session) => !session.current).length;
  const displaySessions = dedupeAuthSessions(sessions);

  return (
    <SectionPanel
      title="Devices"
      subtitle="See where your account is signed in and log out devices you do not recognize."
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant="destructive" onClick={revokeOthers} disabled={!otherActiveCount || busy === 'others'}>
            {busy === 'others' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Log out others
          </Button>
        </div>
      }
    >
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-red-500 bg-red-500/8 border border-red-500/15 rounded-[10px] px-3.5 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <SettingsCard>
        {loading && sessions.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[13px] text-[var(--color-text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading devices...
          </div>
        ) : displaySessions.length === 0 ? (
          <div className="px-4 py-5 text-[13px] text-[var(--color-text-muted)]">No devices found.</div>
        ) : (
          displaySessions.map((session) => {
            const revoked = Boolean(session.revokedAt);
            const title = session.deviceLabel || [session.browser, session.os].filter(Boolean).join(' on ') || 'Unknown device';
            const revokeBusy = busy === `revoke:${session.id}`;
            const removeBusy = busy === `remove:${session.id}`;
            const privateLocation = [session.ipAddress, session.location].filter(Boolean).join(' · ');
            return (
              <div
                key={session.id}
                className="settings-device-row group/device-row flex items-start gap-3 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0"
              >
                <div className={`relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-[var(--color-text-muted)] ${revoked ? 'opacity-55' : ''}`}>
                  <DeviceSessionIcon session={session} className="h-[21px] w-[21px]" />
                  <span className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)] ${
                    revoked ? 'bg-zinc-500' : session.online ? 'bg-emerald-500' : 'bg-zinc-400'
                  }`} />
                </div>
                <div className="settings-device-main">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-medium truncate">{title}</p>
                    {session.current && (
                      <span className="rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                        Current
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      revoked
                        ? 'bg-zinc-500/12 text-zinc-500'
                        : session.online
                          ? 'bg-emerald-500/12 text-emerald-500'
                          : 'bg-zinc-500/12 text-zinc-500'
                    }`}>
                      {revoked ? 'Logged out' : session.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <p className="mt-1 flex min-h-[18px] max-w-full items-center gap-1 overflow-hidden text-[12px] text-[var(--color-text-muted)]">
                    <span className="shrink-0">{surfaceLabel(session.surface)}</span>
                    {privateLocation && (
                      <>
                        <span className="shrink-0 text-[var(--color-text-muted)]/60">·</span>
                        <span className="min-w-0 truncate opacity-0 transition-opacity duration-150 group-hover/device-row:opacity-100 group-focus-within/device-row:opacity-100">
                          {privateLocation}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                    Last active {formatRelativeTime(session.lastSeenAt)}
                    {session.timezone ? ` · ${session.timezone}` : ''}
                  </p>
                </div>
                <div className="settings-device-action flex justify-end">
                  {!revoked && session.activeSessionIds.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => void revokeOne(session)} disabled={revokeBusy}>
                      {revokeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : session.current ? 'Log out others' : 'Log out'}
                    </Button>
                  )}
                  {revoked && session.revokedSessionIds.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => void removeLoggedOut(session)} disabled={removeBusy}>
                      {removeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </SettingsCard>
    </SectionPanel>
  );
}
