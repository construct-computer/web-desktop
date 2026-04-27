# Mobile QA Checklist

Use this checklist before shipping changes that touch the mobile-optimized desktop, Mini App auth, app navigation, or shared app domain hooks.

## Telegram WebView
- Launch the bot Mini App on iOS and Android.
- Confirm auth states: loading, not linked, Google sign-in return, email OTP, and ready.
- Confirm native back closes nested screens before closing the Mini App.
- Confirm haptics are subtle and do not fire on passive refreshes.
- Confirm safe areas around the status bar and home indicator.

## Mobile Browser
- Test iPhone Safari and Android Chrome at narrow widths.
- Confirm authenticated users enter the desktop with mobile chrome after provisioning.
- Confirm blocked or legacy unsubscribed users still see the subscription path.
- Confirm pull-to-refresh on Home updates usage without fighting inner scroll.
- Confirm browser back works for nested mobile screens.

## PWA Standalone
- Install from mobile browser and launch standalone.
- Confirm the mobile theme follows light/dark setting.
- Confirm no desktop-only Mission Control or Stage Manager chrome appears.
- Confirm app shortcuts open the expected mobile-optimized desktop windows.

## Desktop And Tablet
- Test a normal desktop viewport.
- Test a tablet-width viewport around the 768px breakpoint.
- Confirm desktop dock, launchpad, Spotlight, and window behavior remain unchanged above the mobile breakpoint.

## Core Mobile Tasks
- Send a chat message and stop an active run.
- Open Files, Calendar, Email, App Store, Memory, Settings, Access Control, and Audit Logs.
- Verify loading, empty, error, retry, and success states on at least one poor-network pass.
