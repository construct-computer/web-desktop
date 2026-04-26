import { useState, useEffect } from 'react';
import { CheckCircle, Mail } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore, getWallpaperBlurSrc } from '@/stores/settingsStore';
import { useSound } from '@/hooks/useSound';
import { detectActivePromoCode } from '@/lib/constants';
import circleAppearGif from '@/assets/construct/circle-appear.gif';

export function LoginScreen() {
  const {
    loginWithGoogle,
    sendMagicLink,
    verifyOtp,
    resetMagicLink,
    isLoading,
    error,
    clearError,
    magicLinkState,
    magicLinkEmail,
  } = useAuthStore();
  const { wallpaperId } = useSettingsStore();
  const wallpaperSrc = getWallpaperBlurSrc(wallpaperId);
  const { play } = useSound();

  const activePromoCode = detectActivePromoCode();
  const hasPromo = activePromoCode !== null;

  // ── Phases: power → hello → login ──
  const [poweredOn, setPoweredOn] = useState(false);
  const [powerFading, setPowerFading] = useState(false);
  const [helloIn, setHelloIn] = useState(false);
  const [helloOut, setHelloOut] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const handlePowerOn = () => {
    if (poweredOn) return;
    setPowerFading(true);
    const sound = Math.random() < 1 / 20 ? 'hello' : 'startup';
    setTimeout(() => play(sound, 0.69), 1100);
    setTimeout(() => {
      setPoweredOn(true);
    }, 600);
  };

  // Animation sequence after power-on
  useEffect(() => {
    if (!poweredOn) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)); };

    // Phase 1: "hello" appears
    t(() => setHelloIn(true), 200);

    // Phase 2: "hello" fades out, login fades in
    t(() => setHelloOut(true), 2200);
    t(() => setShowLogin(true), 2600);

    return () => timers.forEach(clearTimeout);
  }, [poweredOn]);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');

  const handleGoogleLogin = () => {
    clearError();
    play('click');
    loginWithGoogle();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    play('click');
    await sendMagicLink(email.trim());
  };

  const handleShowEmail = () => {
    play('click');
    clearError();
    setShowEmailForm(true);
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) return;
    play('click');
    await verifyOtp(otp.trim());
  };

  const handleBackToMain = () => {
    play('click');
    clearError();
    resetMagicLink();
    setShowEmailForm(false);
    setEmail('');
    setOtp('');
  };

  // Real-time clock for the login screen
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';

  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden">
      {/* Wallpaper */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${wallpaperSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(16px) saturate(1.2)',
          transform: 'scale(1.02)'
        }}
      />

      {/* Dark scrim — stronger during hello/power phase, lighter when login shows */}
      <div
        className="absolute inset-0 transition-all duration-1000"
        style={{
          background: showLogin
            ? 'rgba(0,0,0,0.3)'
            : 'rgba(0,0,0,0.7)',
        }}
      />
      <div className="absolute inset-0 backdrop-blur-md" />

      {/* ── Phase 0: Power button (centered) ── */}
      {!poweredOn && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20 select-none"
          style={{
            opacity: powerFading ? 0 : 1,
            transform: powerFading ? 'scale(0.95)' : 'scale(1)',
            transition: `opacity 0.5s ${ease}, transform 0.5s ${ease}`,
          }}
        >
          <div className="flex flex-col items-center gap-4">
            <button
              className="group flex items-center justify-center w-16 h-16 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl hover:bg-white/10 hover:border-white/20 transition-all duration-300"
              onClick={handlePowerOn}
            >
              <svg className="w-6 h-6 text-white/50 group-hover:text-white/90 transition-colors duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
            </button>
            <span className="text-[11px] font-medium text-white/30 tracking-widest uppercase mt-2">Power on</span>
            {hasPromo && (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] font-semibold tracking-widest uppercase px-4 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
                <span className="text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">{activePromoCode}</span>
                <span className="text-white/80">promo applied</span>
                <span className="text-white/40">·</span>
                <span className="text-white/80">1 month pro</span>
                <span className="text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">FREE</span>
                <span className="text-white/40">·</span>
                <span className="text-white/50 line-through decoration-white/40">$299</span>
                <span className="text-white/40">/</span>
                <span className="text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">$0</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Phase 1: "hello" text (absolutely centered on screen) ── */}
      {poweredOn && !showLogin && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <h1
            className="hello-cursive select-none"
          style={{
            fontSize: 'clamp(5rem, 15vw, 13rem)',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            padding: '0.15em 0.1em',
            background: 'linear-gradient(90deg, #EF4444 0%, #FB923C 20%, #EF4444 38%, #FB923C 48%, #C4A030 55%, #39FF14 65%, #00FF66 75%, #39FF14 88%, #00FF66 100%)',
            backgroundSize: '250% 100%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            ...(helloIn ? {
              WebkitMaskImage: 'linear-gradient(to right, black calc(var(--hello-reveal) - 6%), transparent var(--hello-reveal))',
              maskImage: 'linear-gradient(to right, black calc(var(--hello-reveal) - 6%), transparent var(--hello-reveal))',
            } : {}),
            animation: helloIn
              ? 'hello-gradient 7s ease-out forwards, hello-write 1.8s cubic-bezier(0.4, 0, 0.2, 1) forwards'
              : 'none',
            opacity: helloOut ? 0 : helloIn ? 1 : 0,
            transform: helloOut ? 'translateY(-24px)' : 'none',
            transition: helloOut
              ? `opacity 0.5s ease-in, transform 0.5s ${ease}`
              : 'opacity 0.15s ease-out',
          }}
          >
            hello
          </h1>
        </div>
      )}

      {/* ── Login content (fades in after hello) ── */}
      {/* macOS layout: clock pinned to top ~18%, avatar+sign-in at bottom ~58% */}
      <div
        className="absolute inset-0 z-10 flex flex-col items-center"
        style={{
          opacity: showLogin ? 1 : 0,
          transform: showLogin ? 'translateY(0)' : 'translateY(10px)',
          transition: `opacity 0.8s ${ease}, transform 0.8s ${ease}`,
          pointerEvents: showLogin ? 'auto' : 'none',
        }}
      >
        {/* Clock — pinned to top */}
        <div className="flex flex-col items-center text-white select-none pointer-events-none" style={{ marginTop: '14vh' }}>
          <h2 className="text-[22px] font-medium tracking-wide mb-1 opacity-90">{dateStr}</h2>
          <h1 className="text-[88px] font-bold tracking-tight leading-none">{timeStr}</h1>
        </div>

        {/* Spacer pushes login card to lower portion */}
        <div className="flex-1" />

        {/* Login card — in the lower-center area */}
        <div className="flex flex-col items-center w-full max-w-[280px] mb-[22vh]">
          {/* Welcome text */}
          <p className="text-[13px] font-medium text-white/50 tracking-wide mb-4">Welcome to Construct</p>
          {/* Profile Avatar — remounts when login appears so the GIF plays
              from frame 0 rather than mid-loop. */}
          <img
            key={showLogin ? 'on' : 'off'}
            src={circleAppearGif}
            className="w-24 h-24 mb-5"
            draggable={false}
            alt=""
          />

          {/* Error message */}
          {error && (
            <div className="w-full mb-6 p-2.5 text-sm rounded-xl font-medium text-center
                            bg-red-500/10 dark:bg-red-500/20 backdrop-blur-xl
                            text-red-700 dark:text-red-100 border border-red-500/20 dark:border-red-500/30 shadow-lg">
              {error}
            </div>
          )}

          {/* Form Container */}
          <div className="w-full flex-col gap-3">
            {magicLinkState === 'sent' || magicLinkState === 'verifying' ? (
              <div className="flex flex-col items-center text-center gap-3 w-full bg-white/40 dark:bg-black/20 backdrop-blur-xl p-4 rounded-3xl border border-black/10 dark:border-white/10 shadow-xl transition-colors duration-500">
                <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-[15px] font-medium text-black/90 dark:text-white mb-1">
                    Enter sign-in code
                  </p>
                  <p className="text-[12px] text-black/60 dark:text-white/60">
                    Sent to <span className="font-medium text-black/90 dark:text-white/90">{magicLinkEmail}</span>
                  </p>
                </div>
                {error && (
                  <p className="text-[12px] font-medium text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
                <form onSubmit={handleOtpSubmit} className="w-full flex flex-col items-center gap-2 mt-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    className="w-[180px] py-2.5 text-center text-[22px] font-bold tracking-[8px] rounded-xl
                               bg-white/50 dark:bg-black/30 backdrop-blur-2xl
                               border border-black/10 dark:border-white/15
                               text-black/90 dark:text-white
                               placeholder-black/20 dark:placeholder-white/20
                               focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/40
                               transition-all"
                  />
                  <button
                    type="submit"
                    disabled={magicLinkState === 'verifying' || otp.length !== 6}
                    className="w-[180px] py-2 text-[13px] font-semibold rounded-full
                               bg-black/80 dark:bg-white/90 text-white dark:text-black
                               hover:bg-black dark:hover:bg-white
                               disabled:opacity-50
                               transition-colors duration-150"
                  >
                    {magicLinkState === 'verifying' ? 'Verifying...' : 'Continue'}
                  </button>
                </form>
                <p className="text-[11px] text-black/40 dark:text-white/40 mt-1">
                  Or click the link in the email
                </p>
                <button
                  onClick={handleBackToMain}
                  className="text-xs font-semibold text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80 transition-colors"
                >
                  Go Back
                </button>
              </div>
            ) : showEmailForm ? (
              /* Email input form */
              <div className="w-full flex flex-col gap-3">
                <form onSubmit={handleEmailSubmit} className="relative w-full">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter Email Address"
                    autoFocus
                    required
                    className="w-full py-2.5 px-4 text-[13px] font-medium rounded-full
                               bg-white/50 dark:bg-black/30 backdrop-blur-2xl
                               border border-black/10 dark:border-white/15
                               text-black/90 dark:text-white shadow-inner
                               placeholder-black/40 dark:placeholder-white/40
                               focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/40
                               transition-all"
                  />
                  <button
                    type="submit"
                    disabled={magicLinkState === 'sending' || !email.trim()}
                    className="absolute right-1 top-1 bottom-1 px-4
                               text-xs font-semibold rounded-full
                               bg-black/80 dark:bg-white/90 text-white dark:text-black
                               hover:bg-black dark:hover:bg-white
                               disabled:opacity-50
                               transition-colors duration-150"
                  >
                    {magicLinkState === 'sending' ? '...' : '→'}
                  </button>
                </form>
                <button
                  onClick={handleBackToMain}
                  className="text-xs font-semibold text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80 mt-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* Main sign-in options */
              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 py-2.5 px-4
                             text-[14px] font-medium rounded-full
                             bg-white/50 dark:bg-white/10 backdrop-blur-2xl
                             border border-black/10 dark:border-white/15 shadow-lg
                             text-black/90 dark:text-white
                             hover:bg-white/70 dark:hover:bg-white/25
                             disabled:opacity-50
                             transition-all duration-200"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" className="flex-shrink-0">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {isLoading ? 'Authenticating...' : 'Sign in with Google'}
                </button>

                <button
                  onClick={handleShowEmail}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4
                             text-[13px] font-medium rounded-full
                             bg-transparent border border-transparent
                             text-black/60 dark:text-white/60
                             hover:text-black/90 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5
                             disabled:opacity-50
                             transition-colors duration-200"
                >
                  <Mail className="w-4 h-4" />
                  Sign in with Email
                </button>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* Version */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center z-10 pointer-events-none transition-colors duration-500"
        style={{
          opacity: showLogin ? 1 : 0,
          transition: `opacity 1s ${ease}`,
        }}
      >
        <p className="text-xs font-medium text-white/30">
          construct.computer v0.1.0
        </p>
      </div>
    </div>
  );
}
