import type { DailyCall } from '@daily-co/daily-js';
import type { VideoCredentials } from '../multiplayer/MultiplayerClient';

interface ConversationCallbacks {
  onJoined: () => void;
  onLeft: () => void;
  onPeerLeft: () => void;
  onError: (message: string) => void;
}

export class DailyConversation {
  private frame?: DailyCall;
  private fallbackWindow?: Window | null;
  private disposing = false;

  async join(
    container: HTMLElement,
    credentials: VideoCredentials,
    callbacks: ConversationCallbacks,
  ): Promise<'embedded' | 'external-needed'> {
    await this.dispose();
    const { default: DailyIframe } = await import('@daily-co/daily-js');
    const supported = DailyIframe.supportedBrowser();
    if (!supported.supported) return 'external-needed';

    try {
      container.replaceChildren();
      this.disposing = false;
      const frame = DailyIframe.createFrame(container, {
        activeSpeakerMode: false,
        showLeaveButton: true,
        showParticipantsBar: false,
        showFullscreenButton: false,
        showUserNameChangeUI: false,
        startVideoOff: credentials.mode === 'audio',
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          background: '#120d07',
        },
      });
      this.frame = frame;
      frame.on('joined-meeting', callbacks.onJoined);
      frame.on('participant-left', callbacks.onPeerLeft);
      frame.on('left-meeting', () => { if (!this.disposing) callbacks.onLeft(); });
      frame.on('error', () => callbacks.onError('The video connection encountered an error.'));
      await frame.join({
        url: credentials.roomUrl,
        token: credentials.token,
        userName: undefined,
        startVideoOff: credentials.mode === 'audio',
      });
      return 'embedded';
    } catch {
      await this.dispose();
      return 'external-needed';
    }
  }

  openExternal(credentials: VideoCredentials, callbacks: ConversationCallbacks): boolean {
    const separator = credentials.roomUrl.includes('?') ? '&' : '?';
    const opened = window.open(`${credentials.roomUrl}${separator}t=${encodeURIComponent(credentials.token)}`, '_blank');
    if (!opened) {
      callbacks.onError('Allow pop-ups to open the secure video conversation.');
      return false;
    }
    opened.opener = null;
    this.fallbackWindow = opened;
    callbacks.onJoined();
    return true;
  }

  async dispose(): Promise<void> {
    this.disposing = true;
    const frame = this.frame;
    this.frame = undefined;
    if (frame) {
      try { await frame.setLocalVideo(false); } catch { /* best effort */ }
      try { await frame.setLocalAudio(false); } catch { /* best effort */ }
      try { await frame.leave(); } catch { /* best effort */ }
      try { await frame.destroy(); } catch { /* best effort */ }
    }
    if (this.fallbackWindow && !this.fallbackWindow.closed) this.fallbackWindow.close();
    this.fallbackWindow = undefined;
  }

}
