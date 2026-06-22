import { useNotificationStore } from '@/stores/notificationStore';
import { getSlackStatus } from '@/services/api';

/**
 * Handle OAuth redirect query params (calendar, drive, slack, composio).
 * Lifted from Desktop so callbacks work before desktop mounts.
 */
export function handleOAuthCallbackParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  const calendarResult = params.get('calendar');
  const driveResult = params.get('drive');
  const slackResult = params.get('slack');
  const composioConnected = params.get('composio_connected');
  const composioError = params.get('composio_error');
  if (!calendarResult && !driveResult && !slackResult && !composioConnected && !composioError) {
    return false;
  }

  window.history.replaceState({}, '', window.location.pathname);
  const addNotification = useNotificationStore.getState().addNotification;

  if (calendarResult === 'connected') {
    addNotification({
      title: 'Google Calendar connected',
      body: 'Your Calendar is now linked',
      source: 'Google Calendar',
      variant: 'success',
    });
  } else if (calendarResult === 'denied' || calendarResult === 'error') {
    addNotification({
      title: 'Google Calendar connection failed',
      body: calendarResult === 'denied' ? 'Access was denied' : 'An error occurred',
      source: 'Google Calendar',
      variant: 'error',
    });
  }

  if (driveResult === 'connected') {
    addNotification({
      title: 'Google Drive connected',
      body: 'Your Drive is now linked',
      source: 'Google Drive',
      variant: 'success',
    });
  } else if (driveResult === 'denied' || driveResult === 'error') {
    addNotification({
      title: 'Google Drive connection failed',
      body: driveResult === 'denied' ? 'Access was denied' : 'An error occurred',
      source: 'Google Drive',
      variant: 'error',
    });
  }

  if (slackResult === 'connected') {
    void getSlackStatus().then((result) => {
      const teamName = result.success ? result.data.teamName : undefined;
      addNotification({
        title: 'Slack connected',
        body: teamName ? `Added to ${teamName}` : 'Your Slack workspace is now linked',
        source: 'Slack',
        variant: 'success',
      });
    });
  } else if (slackResult === 'denied' || slackResult === 'error') {
    const slackError = params.get('slack_error');
    let body = slackResult === 'denied' ? 'Access was denied' : 'An error occurred';
    if (slackError) {
      const friendlyErrors: Record<string, string> = {
        bad_redirect_uri: 'Redirect URI mismatch — check SLACK_REDIRECT_URI matches the Slack app settings',
        invalid_code: 'Authorization code expired — please try again',
        access_denied: 'Access was denied by the user',
        workspace_already_linked: 'This Slack workspace is already connected to another account',
      };
      body = friendlyErrors[slackError] || slackError.replace(/_/g, ' ');
    }
    addNotification({
      title: 'Slack connection failed',
      body,
      source: 'Slack',
      variant: 'error',
    });
  }

  if (composioConnected) {
    const toolkitNames: Record<string, string> = {
      googlecalendar: 'Google Calendar',
      googledrive: 'Google Drive',
    };
    const name = toolkitNames[composioConnected] || composioConnected;
    addNotification({
      title: `${name} connected`,
      body: `Your ${name} account is now linked.`,
      source: name,
      variant: 'success',
    });
  }

  if (composioError) {
    const toolkitNames: Record<string, string> = {
      googlecalendar: 'Google Calendar',
      googledrive: 'Google Drive',
    };
    const name = toolkitNames[composioError] || composioError;
    addNotification({
      title: `${name} connection failed`,
      body: 'An error occurred during authorization.',
      source: name,
      variant: 'error',
    });
  }

  return true;
}
