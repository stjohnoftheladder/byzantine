export type PeerFacing = 'up' | 'down' | 'left' | 'right';

export interface PeerPresence {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: PeerFacing;
  moving: boolean;
  updatedAt: number;
  videoAvailable: boolean;
  videoBusy: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: number;
}

export type VideoMode = 'video' | 'audio';

export interface VideoInvite {
  id: string;
  fromId: string;
  fromName: string;
  mode: VideoMode;
  expiresAt: number;
}

export interface VideoCredentials {
  callId: string;
  peerId: string;
  peerName: string;
  mode: VideoMode;
  roomUrl: string;
  token: string;
  joinDeadline: number;
}

export type VideoServerMessage =
  | { type: 'video-invite'; invite: VideoInvite }
  | { type: 'video-invite-sent'; inviteId: string; peerId: string; peerName: string; mode: VideoMode; expiresAt: number }
  | { type: 'video-invite-resolved'; inviteId: string; outcome: 'accepted' | 'declined' | 'cancelled' | 'expired' | 'blocked'; message: string }
  | { type: 'video-ready'; credentials: VideoCredentials }
  | { type: 'video-start'; callId: string; startedAt: number; endsAt: number }
  | { type: 'video-ended'; callId?: string; reason: string; message: string }
  | { type: 'video-error'; code: string; message: string }
  | { type: 'video-report-received'; message: string };

export type VideoClientMessage =
  | { type: 'video-invite'; peerId: string; mode: VideoMode }
  | { type: 'video-respond'; inviteId: string; accept: boolean }
  | { type: 'video-cancel'; inviteId: string }
  | { type: 'video-joined'; callId: string }
  | { type: 'video-leave'; callId: string }
  | { type: 'video-block'; peerId: string }
  | { type: 'video-report'; peerId: string; callId?: string; reason: string };

export type MultiplayerStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface MultiplayerHandlers {
  onPeer: (peer: PeerPresence) => void;
  onJoin: (peer: PeerPresence) => void;
  onLeave: (id: string, name?: string) => void;
  onReset: () => void;
  onStatus: (status: MultiplayerStatus) => void;
  onPresence: (peers: PeerPresence[]) => void;
  onChat: (message: ChatMessage, own: boolean, historical: boolean) => void;
  onChatError: (message: string) => void;
  onVideo: (message: VideoServerMessage) => void;
  onMessage?: (type: string, data: Record<string, unknown>) => void;
}

interface WelcomeMessage {
  type: 'welcome';
  selfId: string;
  peers: PeerPresence[];
  messages?: ChatMessage[];
  videoEnabled?: boolean;
}

interface PeerMessage {
  type: 'peer';
  peer: PeerPresence;
}

interface LeaveMessage {
  type: 'leave';
  id: string;
}

interface ChatServerMessage {
  type: 'chat';
  message: ChatMessage;
}

interface ChatErrorMessage {
  type: 'chat-error';
  code: string;
  message: string;
}

type ServerMessage = WelcomeMessage | PeerMessage | LeaveMessage | ChatServerMessage | ChatErrorMessage | VideoServerMessage;

interface LocalPresence {
  name: string;
  x: number;
  y: number;
  facing: PeerFacing;
  moving: boolean;
}

const SEND_INTERVAL_MS = 100;
const HEARTBEAT_INTERVAL_MS = 10_000;
const RECONNECT_MAX_MS = 15_000;

export class MultiplayerClient {
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private heartbeatTimer?: number;
  private reconnectDelay = 1_000;
  private stopped = false;
  private selfId?: string;
  private lastSentAt = 0;
  private latest: LocalPresence;
  private peers = new Map<string, PeerPresence>();
  private hasConnected = false;

  constructor(
    private readonly endpoint: string,
    initial: LocalPresence,
    private readonly handlers: MultiplayerHandlers,
  ) {
    this.latest = initial;
  }

  connect(): void {
    if (!this.endpoint || this.stopped) return;
    this.handlers.onStatus(this.hasConnected ? 'reconnecting' : 'connecting');

    try {
      this.socket = new WebSocket(this.endpoint);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener('open', () => {
      this.reconnectDelay = 1_000;
      this.hasConnected = true;
      this.send({ type: 'hello', ...this.latest });
      this.startHeartbeat();
    });
    this.socket.addEventListener('message', (event) => this.receive(event.data));
    this.socket.addEventListener('close', () => {
      this.stopHeartbeat();
      this.socket = undefined;
      this.selfId = undefined;
      this.peers.clear();
      this.handlers.onReset();
      this.handlers.onPresence([]);
      this.handlers.onStatus(this.stopped ? 'offline' : 'reconnecting');
      this.scheduleReconnect();
    });
    this.socket.addEventListener('error', () => this.socket?.close());
  }

  update(presence: Omit<LocalPresence, 'name'>): void {
    this.latest = { ...this.latest, ...presence };
    const now = performance.now();
    if (now - this.lastSentAt < SEND_INTERVAL_MS) return;
    this.lastSentAt = now;
    this.send({ type: 'move', ...presence });
  }

  sendChat(body: string): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.selfId) return false;
    this.send({ type: 'chat', body });
    return true;
  }

  sendVideo(message: VideoClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.selfId) return false;
    this.send(message);
    return true;
  }

  sendMessage(message: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.selfId) return false;
    this.send(message);
    return true;
  }

  destroy(): void {
    this.stopped = true;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.socket?.close(1000, 'scene closed');
    this.socket = undefined;
    this.handlers.onStatus('offline');
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    if (message.type === 'welcome') {
      this.selfId = message.selfId;
      this.handlers.onStatus('connected');
      this.peers.clear();
      for (const peer of message.peers) {
        this.peers.set(peer.id, peer);
        this.handlers.onPeer(peer);
      }
      this.handlers.onPresence([...this.peers.values()]);
      for (const chat of message.messages ?? []) this.handlers.onChat(chat, false, true);
    } else if (message.type === 'peer') {
      if (message.peer.id !== this.selfId) {
        const joined = !this.peers.has(message.peer.id);
        this.peers.set(message.peer.id, message.peer);
        this.handlers.onPeer(message.peer);
        if (joined) this.handlers.onJoin(message.peer);
        this.handlers.onPresence([...this.peers.values()]);
      }
    } else if (message.type === 'leave') {
      const peer = this.peers.get(message.id);
      this.peers.delete(message.id);
      this.handlers.onLeave(message.id, peer?.name);
      this.handlers.onPresence([...this.peers.values()]);
    } else if (message.type === 'chat') {
      this.handlers.onChat(message.message, message.message.senderId === this.selfId, false);
    } else if (message.type === 'chat-error') {
      this.handlers.onChatError(message.message);
    } else if (message.type.startsWith('video-')) {
      this.handlers.onVideo(message as VideoServerMessage);
    } else {
      this.handlers.onMessage?.(message.type, message as Record<string, unknown>);
    }
  }

  private send(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => this.send({ type: 'heartbeat' }), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === undefined) return;
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== undefined) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(RECONNECT_MAX_MS, this.reconnectDelay * 2);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }
}
