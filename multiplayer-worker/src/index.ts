import { DurableObject } from 'cloudflare:workers';

const WORLD_WIDTH = 480;
const WORLD_HEIGHT = 854;
const MAX_NAME_LENGTH = 16;
const MAX_CHAT_LENGTH = 280;
const MIN_UPDATE_INTERVAL_MS = 65;
const MIN_CHAT_INTERVAL_MS = 750;
const MIN_INVITE_INTERVAL_MS = 10_000;
const MAX_ROOM_SIZE = 50;
const CHAT_HISTORY_LIMIT = 50;
const CHAT_STORAGE_LIMIT = 100;
const STALE_AFTER_MS = 30_000;
const INVITE_LIFETIME_MS = 30_000;
const JOIN_LIFETIME_MS = 45_000;
const CALL_LENGTH_MS = 90_000;
const DECLINE_COOLDOWN_MS = 30_000;
const CALL_COOLDOWN_MS = 5 * 60_000;
const REPORT_RETENTION_MS = 30 * 24 * 60 * 60_000;
const ALLOWED_ORIGINS = new Set(['https://stjohnoftheladder.github.io', 'https://byzantine-2yy.pages.dev', 'http://127.0.0.1:5173', 'http://localhost:5173']);

interface WorkerEnv extends Env {
  DAILY_API_KEY?: string;
  DAILY_SUBDOMAIN?: string;
  // Optional custom-domain origin (added via dashboard var or `wrangler secret put`), no code change needed
  ALLOWED_ORIGIN_EXTRA?: string;
}

type Facing = 'up' | 'down' | 'left' | 'right';
type VideoMode = 'video' | 'audio';

interface PilgrimState {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  updatedAt: number;
  lastMessageAt: number;
  lastChatAt: number;
  lastInviteAt: number;
  ready: boolean;
  videoAllowed: boolean;
  videoInviteId: string | null;
  videoCallId: string | null;
}

interface ClientMessage {
  type: string;
  name?: unknown;
  x?: unknown;
  y?: unknown;
  facing?: unknown;
  moving?: unknown;
  body?: unknown;
  peerId?: unknown;
  inviteId?: unknown;
  callId?: unknown;
  mode?: unknown;
  accept?: unknown;
  reason?: unknown;
}

type PublicPilgrim = Pick<PilgrimState, 'id' | 'name' | 'x' | 'y' | 'facing' | 'moving' | 'updatedAt'> & {
  videoAvailable: boolean;
  videoBusy: boolean;
};

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: number;
}

interface InviteRow {
  [key: string]: SqlStorageValue;
  id: string;
  inviter_id: string;
  invitee_id: string;
  inviter_name: string;
  invitee_name: string;
  mode: VideoMode;
  status: string;
  expires_at: number;
}

interface CallRow {
  [key: string]: SqlStorageValue;
  id: string;
  room_name: string;
  inviter_id: string;
  invitee_id: string;
  inviter_name: string;
  invitee_name: string;
  mode: VideoMode;
  status: string;
  join_deadline: number;
  inviter_joined: number;
  invitee_joined: number;
  started_at: number | null;
  ends_at: number | null;
}

const json = (value: unknown, init?: ResponseInit): Response => Response.json(value, {
  ...init,
  headers: { 'cache-control': 'no-store', ...init?.headers },
});

const isAllowedOrigin = (request: Request, env: Env): boolean => {
  const origin = request.headers.get('Origin');
  if (origin === null) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    // Allow any Cloudflare Pages deployment subdomain for byzantine
    if (url.hostname.endsWith('.byzantine-2yy.pages.dev')) return true;
    // Mid-term: a custom domain is added as a Worker variable (no code change),
    // e.g. `wrangler secret put ALLOWED_ORIGIN_EXTRA` → "https://fellowshipgo.org"
    if (env.ALLOWED_ORIGIN_EXTRA && origin === env.ALLOWED_ORIGIN_EXTRA) return true;
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'phaser4-multiplayer',
        videoConfigured: Boolean(env.DAILY_API_KEY && cleanSubdomain(env.DAILY_SUBDOMAIN)),
        versionId: env.CF_VERSION_METADATA.id,
        versionTag: env.CF_VERSION_METADATA.tag,
        versionTimestamp: env.CF_VERSION_METADATA.timestamp,
      });
    }
    if (url.pathname !== '/ws') return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    if (!isAllowedOrigin(request, env)) return new Response('Origin not allowed', { status: 403 });
    return env.PILGRIM_ROOMS.getByName('byzantine-hub-v1').fetch(request);
  },
} satisfies ExportedHandler<WorkerEnv>;

export class PilgrimRoom extends DurableObject<WorkerEnv> {
  private schemaReady = false;
  private hostId: string | null = null;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
  }

  private ensureSchema(): void {
    if (this.schemaReady) return;
    const schema = [
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, sender_name TEXT NOT NULL,
        body TEXT NOT NULL, sent_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS chat_messages_sent_at ON chat_messages (sent_at)`,
      `CREATE TABLE IF NOT EXISTS video_invites (
        id TEXT PRIMARY KEY, inviter_id TEXT NOT NULL, invitee_id TEXT NOT NULL,
        inviter_name TEXT NOT NULL, invitee_name TEXT NOT NULL, mode TEXT NOT NULL,
        status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS video_invites_expiry ON video_invites (status, expires_at)`,
      `CREATE TABLE IF NOT EXISTS video_calls (
        id TEXT PRIMARY KEY, invite_id TEXT NOT NULL UNIQUE, room_name TEXT NOT NULL,
        inviter_id TEXT NOT NULL, invitee_id TEXT NOT NULL,
        inviter_name TEXT NOT NULL, invitee_name TEXT NOT NULL, mode TEXT NOT NULL,
        status TEXT NOT NULL, created_at INTEGER NOT NULL, join_deadline INTEGER NOT NULL,
        inviter_joined INTEGER NOT NULL DEFAULT 0, invitee_joined INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER, ends_at INTEGER, ended_reason TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS video_calls_deadlines ON video_calls (status, join_deadline, ends_at)`,
      `CREATE TABLE IF NOT EXISTS video_blocks (
        blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id)
      )`,
      `CREATE TABLE IF NOT EXISTS video_pair_cooldowns (
        pair_key TEXT PRIMARY KEY, until_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS video_reports (
        id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, reported_id TEXT NOT NULL,
        reporter_name TEXT NOT NULL, reported_name TEXT NOT NULL, call_id TEXT,
        reason TEXT NOT NULL, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS point_events (
        id TEXT PRIMARY KEY, player_id TEXT NOT NULL, kind TEXT NOT NULL,
        counterparty_id TEXT, points INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS point_events_player ON point_events (player_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS met_pairs (
        player_a TEXT NOT NULL, player_b TEXT NOT NULL, first_met_at INTEGER NOT NULL,
        PRIMARY KEY (player_a, player_b)
      )`,
    ];
    for (const statement of schema) this.ctx.storage.sql.exec(statement);
    this.schemaReady = true;
  }

  async fetch(): Promise<Response> {
    this.ensureSchema();
    if (this.ctx.getWebSockets().length >= MAX_ROOM_SIZE) {
      return new Response('Pilgrimage room is full', { status: 503 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const state: PilgrimState = {
      id: crypto.randomUUID(), name: 'Pilgrim', x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT - 580, facing: 'down', moving: false,
      updatedAt: Date.now(), lastMessageAt: 0, lastChatAt: 0, lastInviteAt: 0,
      ready: false, videoAllowed: true, videoInviteId: null, videoCallId: null,
    };
    server.serializeAttachment(state);
    this.ctx.acceptWebSocket(server);
    await this.ctx.storage.setAlarm(Date.now() + STALE_AFTER_MS);
    server.send(JSON.stringify({
      type: 'welcome', selfId: state.id, peers: this.currentPeers(server),
      messages: this.currentMessages(), videoEnabled: this.videoConfigured(),
      points: 0, // Points initialized on first join; queried by client after
    }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.ensureSchema();
    if (typeof message !== 'string' || message.length > 4_096) return;
    let input: ClientMessage;
    try { input = JSON.parse(message) as ClientMessage; } catch { return; }
    const state = socket.deserializeAttachment() as PilgrimState | null;
    if (!state) return;
    const now = Date.now();

    if (input.type === 'chat') {
      this.handleChat(socket, state, input.body, now);
      return;
    }
    if (input.type === 'hello' || input.type === 'move') {
      this.handlePresence(socket, state, input, now);
      return;
    }
    if (input.type === 'heartbeat') {
      if (!state.ready) return;
      state.updatedAt = now;
      socket.serializeAttachment(state);
      return;
    }
    if (input.type === 'grant_parish_meet_points' && state.ready && state.id === this.hostId) {
      state.updatedAt = now;
      socket.serializeAttachment(state);
      await this.grantParishMeetPoints(socket, state, now);
      return;
    }
    if (!state.ready || !input.type.startsWith('video-')) return;
    state.updatedAt = now;
    socket.serializeAttachment(state);
    if (!this.videoConfigured()) {
      this.send(socket, { type: 'video-error', code: 'unavailable', message: 'Video conversations are not configured yet.' });
      return;
    }

    switch (input.type) {
      case 'video-invite':
        await this.createInvite(socket, state, cleanId(input.peerId), input.mode === 'audio' ? 'audio' : 'video', now);
        break;
      case 'video-respond':
        await this.respondToInvite(socket, state, cleanId(input.inviteId), input.accept === true, now);
        break;
      case 'video-cancel':
        await this.cancelInvite(state, cleanId(input.inviteId), now);
        break;
      case 'video-joined':
        await this.markJoined(state, cleanId(input.callId), now);
        break;
      case 'video-leave':
        await this.leaveCall(state, cleanId(input.callId), 'left early');
        break;
      case 'video-block':
        await this.blockPeer(state, cleanId(input.peerId), now);
        break;
      case 'video-report':
        await this.reportPeer(state, cleanId(input.peerId), cleanId(input.callId), cleanReason(input.reason), now);
        break;
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> { this.ensureSchema(); await this.remove(socket); }
  async webSocketError(socket: WebSocket): Promise<void> { this.ensureSchema(); await this.remove(socket); }

  async alarm(): Promise<void> {
    this.ensureSchema();
    const now = Date.now();
    for (const invite of this.ctx.storage.sql.exec<InviteRow>(
      `SELECT * FROM video_invites WHERE status = 'pending' AND expires_at <= ?`, now,
    ).toArray()) await this.resolveInvite(invite, 'expired', 'The invitation expired.', DECLINE_COOLDOWN_MS);

    for (const call of this.ctx.storage.sql.exec<CallRow>(
      `SELECT * FROM video_calls WHERE status IN ('provisioning', 'ready') AND join_deadline <= ?`, now,
    ).toArray()) await this.endCall(call, 'join timeout', 'The conversation did not start in time.', DECLINE_COOLDOWN_MS);

    for (const call of this.ctx.storage.sql.exec<CallRow>(
      `SELECT * FROM video_calls WHERE status = 'active' AND ends_at <= ?`, now,
    ).toArray()) await this.endCall(call, 'time complete', 'The 90-second conversation is complete.', CALL_COOLDOWN_MS);

    for (const socket of this.ctx.getWebSockets()) {
      const state = socket.deserializeAttachment() as PilgrimState | null;
      if (state && now - state.updatedAt > STALE_AFTER_MS) {
        const call = state.videoCallId ? this.call(state.videoCallId) : undefined;
        const callStillValid = call?.status === 'active'
          ? call.ends_at !== null && call.ends_at > now
          : (call?.status === 'provisioning' || call?.status === 'ready') && call.join_deadline > now;
        if (callStillValid) continue;
        await this.remove(socket);
        socket.close(1001, 'presence timed out');
      }
    }
    this.ctx.storage.sql.exec(`DELETE FROM video_pair_cooldowns WHERE until_at <= ?`, now);
    this.ctx.storage.sql.exec(`DELETE FROM video_reports WHERE created_at < ?`, now - REPORT_RETENTION_MS);
    await this.scheduleNextAlarm();
  }

  private handlePresence(socket: WebSocket, state: PilgrimState, input: ClientMessage, now: number): void {
    if (input.type === 'move' && now - state.lastMessageAt < MIN_UPDATE_INTERVAL_MS) return;
    state.x = boundedNumber(input.x, 0, WORLD_WIDTH, state.x);
    state.y = boundedNumber(input.y, 0, WORLD_HEIGHT, state.y);
    state.facing = isFacing(input.facing) ? input.facing : state.facing;
    state.moving = typeof input.moving === 'boolean' ? input.moving : state.moving;
    state.updatedAt = now;
    state.lastMessageAt = now;
    if (input.type === 'hello') {
      state.name = cleanName(input.name);
      state.ready = true;
      if (!this.hostId) this.hostId = state.id;
    } else if (!state.ready) return;
    socket.serializeAttachment(state);
    this.broadcast({ type: 'peer', peer: this.publicState(state) }, socket);
  }

  private handleChat(socket: WebSocket, state: PilgrimState, value: unknown, now: number): void {
    if (!state.ready) return;
    if (now - state.lastChatAt < MIN_CHAT_INTERVAL_MS) {
      this.send(socket, { type: 'chat-error', code: 'rate-limited', message: 'Please wait a moment before sending another message.' });
      return;
    }
    const body = cleanChat(value);
    if (!body) return;
    state.lastChatAt = now;
    state.updatedAt = now;
    socket.serializeAttachment(state);
    const chat: ChatMessage = { id: crypto.randomUUID(), senderId: state.id, senderName: state.name, body, sentAt: now };
    this.storeMessage(chat);
    this.broadcast({ type: 'chat', message: chat });
  }

  private async createInvite(socket: WebSocket, state: PilgrimState, peerId: string, mode: VideoMode, now: number): Promise<void> {
    const targetSocket = this.socketFor(peerId);
    const target = targetSocket?.deserializeAttachment() as PilgrimState | null;
    if (!peerId || peerId === state.id || !targetSocket || !target?.ready) return this.videoError(socket, 'not-found', 'That pilgrim is no longer available.');
    if (now - state.lastInviteAt < MIN_INVITE_INTERVAL_MS) return this.videoError(socket, 'rate-limited', 'Please wait before sending another invitation.');
    if (!state.videoAllowed || !target.videoAllowed || state.videoInviteId || target.videoInviteId || state.videoCallId || target.videoCallId) {
      return this.videoError(socket, 'busy', 'One of you is already considering or having a conversation.');
    }
    if (this.isBlocked(state.id, target.id)) return this.videoError(socket, 'blocked', 'This conversation is unavailable.');
    const cooldown = this.ctx.storage.sql.exec<{ until_at: number }>(
      `SELECT until_at FROM video_pair_cooldowns WHERE pair_key = ? AND until_at > ?`, pairKey(state.id, target.id), now,
    ).toArray()[0];
    if (cooldown) return this.videoError(socket, 'cooldown', 'Please give this pilgrim a little time before inviting them again.');

    const id = crypto.randomUUID();
    const expiresAt = now + INVITE_LIFETIME_MS;
    this.ctx.storage.sql.exec(
      `INSERT INTO video_invites VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      id, state.id, target.id, state.name, target.name, mode, now, expiresAt,
    );
    state.lastInviteAt = now;
    state.videoInviteId = id;
    target.videoInviteId = id;
    socket.serializeAttachment(state);
    targetSocket.serializeAttachment(target);
    this.send(targetSocket, { type: 'video-invite', invite: { id, fromId: state.id, fromName: state.name, mode, expiresAt } });
    this.send(socket, { type: 'video-invite-sent', inviteId: id, peerId: target.id, peerName: target.name, mode, expiresAt });
    this.announce(state);
    this.announce(target);
    await this.scheduleNextAlarm();
  }

  private async respondToInvite(socket: WebSocket, state: PilgrimState, inviteId: string, accepted: boolean, now: number): Promise<void> {
    const invite = this.invite(inviteId);
    if (!invite || invite.status !== 'pending' || invite.invitee_id !== state.id) return this.videoError(socket, 'invalid-invite', 'That invitation is no longer active.');
    if (invite.expires_at <= now) {
      await this.resolveInvite(invite, 'expired', 'The invitation expired.', DECLINE_COOLDOWN_MS);
      return;
    }
    if (!accepted) {
      await this.resolveInvite(invite, 'declined', 'The invitation was declined.', DECLINE_COOLDOWN_MS);
      return;
    }
    const inviterSocket = this.socketFor(invite.inviter_id);
    const inviter = inviterSocket?.deserializeAttachment() as PilgrimState | null;
    if (!inviterSocket || !inviter?.ready) {
      await this.resolveInvite(invite, 'cancelled', 'The other pilgrim is no longer connected.', DECLINE_COOLDOWN_MS);
      return;
    }

    const callId = crypto.randomUUID();
    const roomName = `phaser4-${callId.replaceAll('-', '')}`;
    const joinDeadline = now + JOIN_LIFETIME_MS;
    this.ctx.storage.sql.exec(`UPDATE video_invites SET status = 'accepted' WHERE id = ?`, invite.id);
    this.ctx.storage.sql.exec(
      `INSERT INTO video_calls (id, invite_id, room_name, inviter_id, invitee_id, inviter_name, invitee_name, mode, status, created_at, join_deadline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'provisioning', ?, ?)`,
      callId, invite.id, roomName, invite.inviter_id, invite.invitee_id,
      invite.inviter_name, invite.invitee_name, invite.mode, now, joinDeadline,
    );
    inviter.videoInviteId = null;
    state.videoInviteId = null;
    inviter.videoCallId = callId;
    state.videoCallId = callId;
    inviterSocket.serializeAttachment(inviter);
    socket.serializeAttachment(state);
    const acceptedMessage = { type: 'video-invite-resolved', inviteId, outcome: 'accepted', message: 'Invitation accepted. Both pilgrims must choose Join.' };
    this.send(inviterSocket, acceptedMessage);
    this.send(socket, acceptedMessage);
    this.announce(inviter);
    this.announce(state);

    // Award "met" point if this pair hasn't met before
    this.awardMetPoints(invite.inviter_id, invite.invitee_id, invite.inviter_name, invite.invitee_name, now);

    try {
      const credentials = await this.provisionDaily(callId, roomName, invite, joinDeadline);
      this.ctx.storage.sql.exec(`UPDATE video_calls SET status = 'ready' WHERE id = ?`, callId);
      this.send(inviterSocket, { type: 'video-ready', credentials: { ...credentials.base, peerId: state.id, peerName: state.name, token: credentials.inviterToken } });
      this.send(socket, { type: 'video-ready', credentials: { ...credentials.base, peerId: inviter.id, peerName: inviter.name, token: credentials.inviteeToken } });
    } catch {
      const call = this.call(callId);
      if (call) await this.endCall(call, 'provisioning failed', 'The private video room could not be prepared. Please try again later.', DECLINE_COOLDOWN_MS);
    }
    await this.scheduleNextAlarm();
  }

  private async cancelInvite(state: PilgrimState, inviteId: string, _now: number): Promise<void> {
    const invite = this.invite(inviteId);
    if (invite?.status === 'pending' && invite.inviter_id === state.id) {
      await this.resolveInvite(invite, 'cancelled', 'The invitation was cancelled.', DECLINE_COOLDOWN_MS);
    }
  }

  private async markJoined(state: PilgrimState, callId: string, now: number): Promise<void> {
    const call = this.call(callId);
    if (!call || !['ready', 'active'].includes(call.status) || !this.isCallParticipant(call, state.id)) return;
    const field = state.id === call.inviter_id ? 'inviter_joined' : 'invitee_joined';
    this.ctx.storage.sql.exec(`UPDATE video_calls SET ${field} = 1 WHERE id = ?`, call.id);
    const updated = this.call(call.id);
    if (!updated || updated.status === 'active' || !updated.inviter_joined || !updated.invitee_joined) return;
    const endsAt = now + CALL_LENGTH_MS;
    this.ctx.storage.sql.exec(`UPDATE video_calls SET status = 'active', started_at = ?, ends_at = ? WHERE id = ?`, now, endsAt, call.id);
    const message = { type: 'video-start', callId: call.id, startedAt: now, endsAt };
    this.sendTo(call.inviter_id, message);
    this.sendTo(call.invitee_id, message);
    this.ctx.waitUntil(this.setDailyRoomExpiry(call.room_name, endsAt));
    await this.scheduleNextAlarm();
  }

  private async leaveCall(state: PilgrimState, callId: string, reason: string): Promise<void> {
    const call = this.call(callId);
    if (call && this.isCallParticipant(call, state.id) && call.status !== 'ended') {
      await this.endCall(call, reason, `${state.name} left the conversation.`, CALL_COOLDOWN_MS);
    }
  }

  private async blockPeer(state: PilgrimState, peerId: string, now: number): Promise<void> {
    if (!peerId || peerId === state.id) return;
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO video_blocks VALUES (?, ?, ?)`, state.id, peerId, now);
    const pending = this.ctx.storage.sql.exec<InviteRow>(
      `SELECT * FROM video_invites WHERE status = 'pending' AND ((inviter_id = ? AND invitee_id = ?) OR (inviter_id = ? AND invitee_id = ?)) LIMIT 1`,
      state.id, peerId, peerId, state.id,
    ).toArray()[0];
    if (pending) await this.resolveInvite(pending, 'blocked', 'The invitation was closed.', DECLINE_COOLDOWN_MS);
    this.sendTo(state.id, { type: 'video-report-received', message: 'This pilgrim is blocked for your current game session.' });
  }

  private async reportPeer(state: PilgrimState, peerId: string, callId: string, reason: string, now: number): Promise<void> {
    if (!peerId || peerId === state.id) return;
    const peer = this.stateFor(peerId);
    const call = callId ? this.call(callId) : undefined;
    const reportedName = peer?.name ?? (call?.inviter_id === peerId ? call.inviter_name : call?.invitee_name) ?? 'Unknown pilgrim';
    this.ctx.storage.sql.exec(
      `INSERT INTO video_reports VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), state.id, peerId, state.name, reportedName, callId || null, reason, now,
    );
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO video_blocks VALUES (?, ?, ?)`, state.id, peerId, now);
    if (call && call.status !== 'ended') await this.endCall(call, 'reported', 'The conversation ended.', CALL_COOLDOWN_MS);
    this.sendTo(state.id, { type: 'video-report-received', message: 'Report received. No audio or video was recorded; this pilgrim is also blocked for this session.' });
  }

  private async resolveInvite(invite: InviteRow, outcome: 'declined' | 'cancelled' | 'expired' | 'blocked', message: string, cooldownMs: number): Promise<void> {
    this.ctx.storage.sql.exec(`UPDATE video_invites SET status = ? WHERE id = ? AND status = 'pending'`, outcome, invite.id);
    this.setCooldown(invite.inviter_id, invite.invitee_id, cooldownMs);
    this.clearInviteAttachment(invite.inviter_id, invite.id);
    this.clearInviteAttachment(invite.invitee_id, invite.id);
    const payload = { type: 'video-invite-resolved', inviteId: invite.id, outcome, message };
    this.sendTo(invite.inviter_id, payload);
    this.sendTo(invite.invitee_id, payload);
    await this.scheduleNextAlarm();
  }

  private async endCall(call: CallRow, reason: string, message: string, cooldownMs: number): Promise<void> {
    this.ctx.storage.sql.exec(`UPDATE video_calls SET status = 'ended', ended_reason = ? WHERE id = ? AND status != 'ended'`, reason, call.id);

    // Award "spoke" point if the conversation lasted ≥20 seconds
    if (call.started_at != null && call.ends_at != null) {
      const durationSec = (call.ends_at - call.started_at) / 1000;
      if (durationSec >= 20) {
        this.awardSpokePoints(call.inviter_id, call.invitee_id, call.inviter_name, call.invitee_name, Date.now());
      }
    }

    this.setCooldown(call.inviter_id, call.invitee_id, cooldownMs);
    this.clearCallAttachment(call.inviter_id, call.id);
    this.clearCallAttachment(call.invitee_id, call.id);
    const payload = { type: 'video-ended', callId: call.id, reason, message };
    this.sendTo(call.inviter_id, payload);
    this.sendTo(call.invitee_id, payload);
    this.ctx.waitUntil(this.setDailyRoomExpiry(call.room_name, Date.now() - 1));
    await this.scheduleNextAlarm();
  }

  private async remove(socket: WebSocket): Promise<void> {
    const state = socket.deserializeAttachment() as PilgrimState | null;
    if (!state?.ready) return;
    if (state.videoInviteId) {
      const invite = this.invite(state.videoInviteId);
      if (invite?.status === 'pending') await this.resolveInvite(invite, 'cancelled', 'The other pilgrim disconnected.', DECLINE_COOLDOWN_MS);
    }
    if (state.videoCallId) {
      const call = this.call(state.videoCallId);
      if (call && call.status !== 'ended') await this.endCall(call, 'disconnected', `${state.name} disconnected.`, CALL_COOLDOWN_MS);
    }
    state.ready = false;
    socket.serializeAttachment(state);
    this.ctx.storage.sql.exec(`DELETE FROM video_blocks WHERE blocker_id = ? OR blocked_id = ?`, state.id, state.id);
    if (state.id === this.hostId) this.hostId = null;
    this.broadcast({ type: 'leave', id: state.id }, socket);
  }

  private async provisionDaily(callId: string, roomName: string, invite: InviteRow, joinDeadline: number) {
    const expiresAt = Math.floor((Date.now() + 5 * 60_000) / 1000);
    await this.dailyRequest('/rooms', {
      name: roomName,
      privacy: 'private',
      properties: {
        exp: expiresAt, eject_at_room_exp: true, max_participants: 2,
        enable_people_ui: false, enable_chat: false, enable_prejoin_ui: true,
        start_video_off: invite.mode === 'audio', start_audio_off: false,
        enforce_unique_user_ids: true,
      },
    });
    const permissions = { hasPresence: true, canSend: invite.mode === 'audio' ? ['audio'] : ['audio', 'video'], canReceive: { base: true }, canAdmin: false };
    const [inviter, invitee] = await Promise.all([
      this.dailyRequest('/meeting-tokens', { properties: { room_name: roomName, user_name: invite.inviter_name, user_id: invite.inviter_id, exp: expiresAt, enable_prejoin_ui: true, enable_screenshare: false, start_video_off: invite.mode === 'audio', permissions } }),
      this.dailyRequest('/meeting-tokens', { properties: { room_name: roomName, user_name: invite.invitee_name, user_id: invite.invitee_id, exp: expiresAt, enable_prejoin_ui: true, enable_screenshare: false, start_video_off: invite.mode === 'audio', permissions } }),
    ]);
    if (typeof inviter.token !== 'string' || typeof invitee.token !== 'string') throw new Error('Daily token response missing token');
    const subdomain = cleanSubdomain(this.env.DAILY_SUBDOMAIN);
    return {
      base: { callId, mode: invite.mode, roomUrl: `https://${subdomain}.daily.co/${roomName}`, joinDeadline },
      inviterToken: inviter.token,
      inviteeToken: invitee.token,
    };
  }

  private async setDailyRoomExpiry(roomName: string, endsAt: number): Promise<void> {
    if (!this.videoConfigured()) return;
    try {
      await this.dailyRequest(`/rooms/${encodeURIComponent(roomName)}`, {
        properties: { exp: Math.max(1, Math.floor(endsAt / 1000)), eject_at_room_exp: true },
      });
    } catch {
      // Clients still receive the authoritative end event; the original five-minute room expiry is the backstop.
    }
  }

  private async dailyRequest(path: string, body: unknown): Promise<Record<string, unknown>> {
    if (!this.env.DAILY_API_KEY) throw new Error('Daily is not configured');
    const response = await fetch(`https://api.daily.co/v1${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.env.DAILY_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (!response.ok || text.length > 65_536) throw new Error(`Daily request failed (${response.status})`);
    return JSON.parse(text) as Record<string, unknown>;
  }

  private videoConfigured(): boolean { return Boolean(this.env.DAILY_API_KEY && cleanSubdomain(this.env.DAILY_SUBDOMAIN)); }
  private publicState(state: PilgrimState): PublicPilgrim {
    const busy = Boolean(state.videoInviteId || state.videoCallId);
    return { id: state.id, name: state.name, x: state.x, y: state.y, facing: state.facing, moving: state.moving, updatedAt: state.updatedAt, videoAvailable: this.videoConfigured() && state.videoAllowed && !busy, videoBusy: busy };
  }
  private currentPeers(except: WebSocket): PublicPilgrim[] {
    return this.ctx.getWebSockets().flatMap((socket) => {
      if (socket === except) return [];
      const state = socket.deserializeAttachment() as PilgrimState | null;
      return state?.ready ? [this.publicState(state)] : [];
    });
  }
  private currentMessages(): ChatMessage[] {
    return this.ctx.storage.sql.exec<{ id: string; sender_id: string; sender_name: string; body: string; sent_at: number }>(
      `SELECT id, sender_id, sender_name, body, sent_at FROM chat_messages ORDER BY sent_at DESC LIMIT ?`, CHAT_HISTORY_LIMIT,
    ).toArray().reverse().map((row) => ({ id: row.id, senderId: row.sender_id, senderName: row.sender_name, body: row.body, sentAt: row.sent_at }));
  }
  private storeMessage(message: ChatMessage): void {
    this.ctx.storage.sql.exec(`INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?)`, message.id, message.senderId, message.senderName, message.body, message.sentAt);
    this.ctx.storage.sql.exec(`DELETE FROM chat_messages WHERE id NOT IN (SELECT id FROM chat_messages ORDER BY sent_at DESC LIMIT ?)`, CHAT_STORAGE_LIMIT);
  }
  private invite(id: string): InviteRow | undefined { return id ? this.ctx.storage.sql.exec<InviteRow>(`SELECT * FROM video_invites WHERE id = ?`, id).toArray()[0] : undefined; }
  private call(id: string): CallRow | undefined { return id ? this.ctx.storage.sql.exec<CallRow>(`SELECT * FROM video_calls WHERE id = ?`, id).toArray()[0] : undefined; }
  private isCallParticipant(call: CallRow, id: string): boolean { return call.inviter_id === id || call.invitee_id === id; }
  private isBlocked(a: string, b: string): boolean {
    return this.ctx.storage.sql.exec(`SELECT 1 FROM video_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`, a, b, b, a).toArray().length > 0;
  }
  private setCooldown(a: string, b: string, duration: number): void {
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO video_pair_cooldowns VALUES (?, ?)`, pairKey(a, b), Date.now() + duration);
  }
  private socketFor(id: string): WebSocket | undefined {
    return this.ctx.getWebSockets().find((socket) => (socket.deserializeAttachment() as PilgrimState | null)?.id === id);
  }
  private stateFor(id: string): PilgrimState | undefined { return this.socketFor(id)?.deserializeAttachment() as PilgrimState | undefined; }
  private sendTo(id: string, message: unknown): void { const socket = this.socketFor(id); if (socket) this.send(socket, message); }
  private send(socket: WebSocket, message: unknown): void { try { socket.send(JSON.stringify(message)); } catch { /* close event cleans up */ } }
  private broadcast(message: unknown, except?: WebSocket): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) if (socket !== except) try { socket.send(encoded); } catch { /* close event cleans up */ }
  }
  private announce(state: PilgrimState): void { if (state.ready) this.broadcast({ type: 'peer', peer: this.publicState(state) }); }
  private clearInviteAttachment(id: string, inviteId: string): void {
    const socket = this.socketFor(id); const state = socket?.deserializeAttachment() as PilgrimState | null;
    if (socket && state?.videoInviteId === inviteId) { state.videoInviteId = null; socket.serializeAttachment(state); this.announce(state); }
  }
  private clearCallAttachment(id: string, callId: string): void {
    const socket = this.socketFor(id); const state = socket?.deserializeAttachment() as PilgrimState | null;
    if (socket && state?.videoCallId === callId) {
      state.videoCallId = null;
      state.updatedAt = Date.now();
      socket.serializeAttachment(state);
      this.announce(state);
    }
  }
  private videoError(socket: WebSocket, code: string, message: string): void { this.send(socket, { type: 'video-error', code, message }); }

  // ---- Fellowship points ----

  private awardMetPoints(playerA: string, playerB: string, nameA: string, nameB: string, now: number): void {
    const pair = pairKey(playerA, playerB);
    const existing = this.ctx.storage.sql.exec(
      `SELECT 1 FROM met_pairs WHERE player_a = ? AND player_b = ? LIMIT 1`, ...pair.split(':'),
    ).toArray();
    if (existing.length > 0) return; // Already met

    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO met_pairs VALUES (?, ?, ?)`, ...pair.split(':'), now,
    );
    this.awardPoints(playerA, 'met', playerB, 1, now);
    this.awardPoints(playerB, 'met', playerA, 1, now);

    this.broadcast({ type: 'system', message: `${nameA} and ${nameB} just met! +1 point each.` });
  }

  private awardSpokePoints(playerA: string, playerB: string, nameA: string, nameB: string, now: number): void {
    // Rate-limit: once per pair per day
    const dayAgo = now - 24 * 60 * 60_000;
    const existing = this.ctx.storage.sql.exec(
      `SELECT 1 FROM point_events WHERE kind = 'spoke' AND
       ((player_id = ? AND counterparty_id = ?) OR (player_id = ? AND counterparty_id = ?))
       AND created_at > ? LIMIT 1`,
      playerA, playerB, playerB, playerA, dayAgo,
    ).toArray();
    if (existing.length > 0) return;

    this.awardPoints(playerA, 'spoke', playerB, 1, now);
    this.awardPoints(playerB, 'spoke', playerA, 1, now);

    this.sendTo(playerA, { type: 'system', message: 'You truly spoke with someone. +1 point.' });
    this.sendTo(playerB, { type: 'system', message: 'You truly spoke with someone. +1 point.' });
  }

  private awardPoints(playerId: string, kind: string, counterpartyId: string, points: number, now: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO point_events VALUES (?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), playerId, kind, counterpartyId, points, now,
    );
    const total = this.getPoints(playerId);
    this.sendTo(playerId, { type: 'points', points: total });
  }

  private getPoints(playerId: string): number {
    const row = this.ctx.storage.sql.exec<{ total: number }>(
      `SELECT COALESCE(SUM(points), 0) AS total FROM point_events WHERE player_id = ?`, playerId,
    ).one();
    return row?.total ?? 0;
  }

  private async grantParishMeetPoints(socket: WebSocket, state: PilgrimState, now: number): Promise<void> {
    // Host-only: grant +1 to all currently online players who haven't received
    // a parish_meet point today
    const dayAgo = now - 24 * 60 * 60_000;
    let awarded = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const peer = ws.deserializeAttachment() as PilgrimState | null;
      if (!peer?.ready) continue;
      const already = this.ctx.storage.sql.exec(
        `SELECT 1 FROM point_events WHERE player_id = ? AND kind = 'parish_meet' AND created_at > ? LIMIT 1`,
        peer.id, dayAgo,
      ).toArray();
      if (already.length > 0) continue;
      this.awardPoints(peer.id, 'parish_meet', '', 1, now);
      awarded += 1;
    }
    this.send(socket, { type: 'system', message: `Parish Meet points granted to ${awarded} parishioner${awarded === 1 ? '' : 's'}.` });
  }

  // Points per player, sent in welcome
  private async scheduleNextAlarm(): Promise<void> {
    const now = Date.now();
    let next = this.ctx.getWebSockets().length ? now + STALE_AFTER_MS : Number.POSITIVE_INFINITY;
    const invite = this.ctx.storage.sql.exec<{ deadline: number | null }>(`SELECT MIN(expires_at) AS deadline FROM video_invites WHERE status = 'pending'`).one();
    const joining = this.ctx.storage.sql.exec<{ deadline: number | null }>(`SELECT MIN(join_deadline) AS deadline FROM video_calls WHERE status IN ('provisioning', 'ready')`).one();
    const active = this.ctx.storage.sql.exec<{ deadline: number | null }>(`SELECT MIN(ends_at) AS deadline FROM video_calls WHERE status = 'active'`).one();
    for (const row of [invite, joining, active]) if (row?.deadline) next = Math.min(next, row.deadline);
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(Math.max(now + 250, next));
  }
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function isFacing(value: unknown): value is Facing { return value === 'up' || value === 'down' || value === 'left' || value === 'right'; }
function cleanName(value: unknown): string {
  if (typeof value !== 'string') return 'Pilgrim';
  return value.replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH) || 'Pilgrim';
}
function cleanChat(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH) : '';
}
function cleanId(value: unknown): string { return typeof value === 'string' && /^[a-f0-9-]{0,64}$/i.test(value) ? value : ''; }
function cleanReason(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Unsafe or unwanted behavior' : 'Unsafe or unwanted behavior';
}
function cleanSubdomain(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value.trim()) ? value.trim().toLowerCase() : '';
}
function pairKey(a: string, b: string): string { return [a, b].sort().join(':'); }
