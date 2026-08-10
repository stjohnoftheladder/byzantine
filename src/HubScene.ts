import Phaser from 'phaser';
import {
  EVENT_CONVERSATION_PAUSE,
  EVENT_MULTIPLAYER_PRESENCE,
  EVENT_MULTIPLAYER_STATUS,
  EVENT_MULTIPLAYER_SYSTEM,
  EVENT_MULTIPLAYER_VIDEO,
  EVENT_MULTIPLAYER_VIDEO_ACTION,
  EVENT_SAVE,
  EVENT_POINTS_UPDATED,
  EVENT_SHOW_TOAST,
  gameEvents,
} from './events';
import { PEER_ANIMS, REQUIRED_SHEETS, type AnimDef } from './atlas';
import {
  MultiplayerClient,
  type PeerFacing,
  type PeerPresence,
  type VideoClientMessage,
} from './multiplayer/MultiplayerClient';
import type { ByzantineSave } from './types';
import { writeSave } from './save';

const WIDTH = 480;
const HEIGHT = 854;
const PLAYER_SPEED = 160;
const ASSET_BASE = import.meta.env.BASE_URL;

const ANGLE_BY_DIRECTION = {
  right: 'w_Angle1',
  down: 'w_Angle2',
  left: 'w_Angle3',
  up: 'w_Angle4',
} as const;

type Direction = keyof typeof ANGLE_BY_DIRECTION;

interface RemotePilgrim {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  facing: PeerFacing;
  moving: boolean;
}

export class HubScene extends Phaser.Scene {
  private save: ByzantineSave;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private facing: Direction = 'down';
  private pointerTarget?: Phaser.Math.Vector2;
  private multiplayer?: MultiplayerClient;
  private remotePilgrims = new Map<string, RemotePilgrim>();
  private conversationPaused = false;
  private saveAccumulator = 0;
  private selectedPeerId: string | null = null;

  constructor(save: ByzantineSave) {
    super('Hub');
    this.save = save;
  }

  preload(): void {
    // Load sprite sheets needed for player animation and UI
    for (const sheet of REQUIRED_SHEETS) {
      this.load.image(sheet, `${ASSET_BASE}images/${sheet}.png`);
    }
    this.load.image('cursor', `${ASSET_BASE}images/os_cursor-sheet0.png`);
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);

    // Register peer animations from the atlas
    this.registerAnimations();

    // Draw the courtyard background
    this.createCourtyard();

    // Create player sprite
    this.createPlayer();

    // Connect to multiplayer presence
    this.createMultiplayer();

    // Bind input
    this.bindInput();

    // Show welcome toast
    gameEvents.emit(EVENT_SHOW_TOAST, 'You are in the parish hub. Tap to move.');
  }

  // ---------------------------------------------------------------- courtyard

  private createCourtyard(): void {
    // Simple courtyard: tiled floor with warm Byzantine tones
    const graphics = this.add.graphics();
    graphics.setDepth(-10);

    // Floor
    graphics.fillStyle(0x3a2a1a, 1);
    graphics.fillRect(0, 0, WIDTH, HEIGHT);

    // Stone tile pattern
    graphics.fillStyle(0x4a3828, 0.4);
    for (let y = 0; y < HEIGHT; y += 64) {
      for (let x = (y % 128 === 0 ? 0 : 32); x < WIDTH; x += 64) {
        graphics.fillRect(x, y, 60, 60);
      }
    }

    // Wall border top
    graphics.fillStyle(0x5a4a3a, 0.6);
    graphics.fillRect(0, 0, WIDTH, 8);
    graphics.fillRect(0, HEIGHT - 8, WIDTH, 8);

    // Left/right columns
    graphics.fillStyle(0x5a4a3a, 0.3);
    graphics.fillRect(0, 0, 6, HEIGHT);
    graphics.fillRect(WIDTH - 6, 0, 6, HEIGHT);

    // Central feature: a simple fountain or cross marker
    graphics.fillStyle(0x6a4a2a, 0.5);
    graphics.fillCircle(WIDTH / 2, HEIGHT / 2, 40);
    graphics.fillStyle(0x8a6a4a, 0.3);
    graphics.fillCircle(WIDTH / 2, HEIGHT / 2, 30);

    // Title label
    this.add
      .text(WIDTH / 2, 24, 'Ss. George & Alexandria', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#c4a46c',
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Ladder doorway (bottom right) — Phase 6
    const doorGraphics = this.add.graphics();
    doorGraphics.fillStyle(0x8a6a3a, 0.7);
    doorGraphics.fillRect(WIDTH - 50, HEIGHT - 80, 44, 72);
    doorGraphics.fillStyle(0x3a2010, 0.9);
    doorGraphics.fillRect(WIDTH - 46, HEIGHT - 76, 36, 68);
    doorGraphics.setDepth(5);

    this.add
      .text(WIDTH - 28, HEIGHT - 44, 'Ladder', {
        fontFamily: 'Georgia, serif',
        fontSize: '9px',
        color: '#c4a46c',
      })
      .setOrigin(0.5)
      .setDepth(6);

    // Make door interactive zone
    const doorZone = this.add.zone(WIDTH - 28, HEIGHT - 44, 50, 80)
      .setInteractive({ useHandCursor: true })
      .setDepth(7);
    doorZone.on('pointerdown', () => {
      this.persistPosition();
      gameEvents.emit(EVENT_SHOW_TOAST, 'Entering the Ladder...');
      // Phase 6: transition to Ladder scene
      this.scene.start('Ladder', { save: this.save });
    });
  }

  // ---------------------------------------------------------------- player

  private createPlayer(): void {
    this.player = this.physics.add.sprite(
      this.save.playerX || WIDTH / 2,
      this.save.playerY || HEIGHT - 100,
      'os_peer-sheet0',
    );
    this.player.setScale(1.5).setDepth(20).setCollideWorldBounds(true);
    this.player.play(`peer-${ANGLE_BY_DIRECTION.down}`);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 18).setOffset(8, 32);

    this.playerLabel = this.add
      .text(this.player.x, this.player.y - 40, this.save.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: '#f3d276',
        stroke: '#1a1008',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(21);
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    this.input.on('pointerdown', this.handlePointerDown, this);
    gameEvents.on(EVENT_MULTIPLAYER_VIDEO_ACTION, this.sendMultiplayerVideo, this);
    gameEvents.on(EVENT_CONVERSATION_PAUSE, this.setConversationPaused, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handlePointerDown, this);
      gameEvents.off(EVENT_MULTIPLAYER_VIDEO_ACTION, this.sendMultiplayerVideo, this);
      gameEvents.off(EVENT_CONVERSATION_PAUSE, this.setConversationPaused, this);
      this.multiplayer?.destroy();
      this.clearRemotePilgrims();
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    // Check if we hit a remote pilgrim sprite
    const hitObjects = this.input.hitTestPointer(pointer);
    for (const obj of hitObjects) {
      if (obj.type === 'Sprite' && (obj as Phaser.GameObjects.Sprite).getData('peerId')) {
        const sprite = obj as Phaser.GameObjects.Sprite;
        const peerId = sprite.getData('peerId') as string;
        const peerName = sprite.getData('peerName') as string || 'Fellow parishioner';
        gameEvents.emit('show-player-card', peerId, peerName);
        return;
      }
    }
    // Otherwise, move there
    this.pointerTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    gameEvents.emit('hide-player-card');
  }

  // ---------------------------------------------------------------- animations

  private registerAnimations(): void {
    const register = (defs: AnimDef[]): void => {
      for (const def of defs) {
        if (this.anims.exists(def.key)) continue;
        const frames: { key: string; frame: string }[] = [];
        for (let i = 0; i < def.frames.length; i++) {
          const frame = def.frames[i];
          const texture = this.textures.get(frame.sheet);
          if (!texture) continue;
          const frameName = `${def.key}-${i}`;
          if (!texture.has(frameName)) {
            texture.add(frameName, 0, frame.x, frame.y, frame.w, frame.h);
          }
          frames.push({ key: frame.sheet, frame: frameName });
        }
        this.anims.create({ key: def.key, frames, frameRate: def.frameRate, repeat: def.repeat });
      }
    };
    register(PEER_ANIMS);
  }

  // ---------------------------------------------------------------- multiplayer

  private createMultiplayer(): void {
    const endpoint = import.meta.env.VITE_MULTIPLAYER_URL;
    if (!endpoint) {
      gameEvents.emit(EVENT_MULTIPLAYER_STATUS, 'offline');
      gameEvents.emit(EVENT_MULTIPLAYER_PRESENCE, []);
      gameEvents.emit(EVENT_SHOW_TOAST, 'Offline mode — other parishioners won\'t appear.');
      return;
    }

    this.multiplayer = new MultiplayerClient(
      endpoint,
      {
        name: this.save.name,
        x: this.player.x,
        y: this.player.y,
        facing: this.facing,
        moving: false,
      },
      {
        onPeer: (peer) => this.upsertRemotePilgrim(peer),
        onJoin: (peer) => {
          gameEvents.emit(EVENT_MULTIPLAYER_SYSTEM, `${peer.name} joined the hub.`);
          gameEvents.emit(EVENT_SHOW_TOAST, `${peer.name} arrived.`);
        },
        onLeave: (id, name) => {
          this.removeRemotePilgrim(id);
          if (name) {
            gameEvents.emit(EVENT_MULTIPLAYER_SYSTEM, `${name} left.`);
          }
        },
        onReset: () => this.clearRemotePilgrims(),
        onStatus: (status) => gameEvents.emit(EVENT_MULTIPLAYER_STATUS, status),
        onPresence: (peers) => gameEvents.emit(EVENT_MULTIPLAYER_PRESENCE, peers),
        onChat: () => {}, // Not used in hub
        onChatError: () => {},
        onVideo: (message) => gameEvents.emit(EVENT_MULTIPLAYER_VIDEO, message),
        onMessage: (type, data) => {
          if (type === 'points' && typeof data.points === 'number') {
            this.updatePoints(data.points);
          }
          if (type === 'system' && typeof data.message === 'string') {
            gameEvents.emit(EVENT_SHOW_TOAST, data.message);
          }
        },
      },
    );
    this.multiplayer.connect();
  }

  private sendMultiplayerVideo(message: VideoClientMessage): void {
    this.multiplayer?.sendVideo(message);
  }

  /** Send an arbitrary message to all peers through the multiplayer channel */
  sendMultiplayerMessage(message: Record<string, unknown>): void {
    this.multiplayer?.sendMessage(message);
  }

  private setConversationPaused(paused: boolean): void {
    this.conversationPaused = paused;
    this.pointerTarget = undefined;

    if (paused) {
      // Keep sending position (so others see us) but stop moving
      if (this.player?.body) {
        (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }
    }
  }

  // ---------------------------------------------------------------- remote pilgrims

  private upsertRemotePilgrim(peer: PeerPresence): void {
    // Guard: scene may not be fully initialized when WebSocket welcome fires
    if (!this.add || !this.scene.isActive()) return;

    let remote = this.remotePilgrims.get(peer.id);

    if (!remote) {
      const sprite = this.add.sprite(peer.x, peer.y, 'os_peer-sheet0');
      sprite.setScale(1.5).setDepth(15);
      sprite.setData('peerId', peer.id);
      sprite.setData('peerName', peer.name);
      sprite.setInteractive({ useHandCursor: true });

      const label = this.add
        .text(peer.x, peer.y - 40, peer.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '10px',
          color: '#d4c494',
          stroke: '#1a1008',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(16);

      remote = {
        sprite,
        label,
        targetX: peer.x,
        targetY: peer.y,
        facing: peer.facing,
        moving: peer.moving,
      };
      this.remotePilgrims.set(peer.id, remote);
    }

    remote.targetX = peer.x;
    remote.targetY = peer.y;
    remote.facing = peer.facing;
    remote.moving = peer.moving;

    // Play/pause animation based on whether peer is moving
    const animKey = `peer-${ANGLE_BY_DIRECTION[peer.facing]}`;
    if (peer.moving) {
      if (remote.sprite.anims.currentAnim?.key !== animKey) {
        remote.sprite.play(animKey, true);
      } else if (remote.sprite.anims.isPaused) {
        remote.sprite.anims.resume();
      }
    } else {
      remote.sprite.anims.pause();
      // Show the standing frame for the current direction
      if (remote.sprite.anims.currentAnim?.key !== animKey) {
        remote.sprite.play(animKey, true);
        remote.sprite.anims.pause();
        remote.sprite.anims.setProgress(0);
      }
    }
  }

  private removeRemotePilgrim(id: string): void {
    const remote = this.remotePilgrims.get(id);
    if (remote) {
      remote.sprite.destroy();
      remote.label.destroy();
      this.remotePilgrims.delete(id);
    }
    // Hide player card if it was showing this person
    if (this.selectedPeerId === id) {
      gameEvents.emit('hide-player-card');
    }
  }

  private clearRemotePilgrims(): void {
    for (const [id] of this.remotePilgrims) {
      this.removeRemotePilgrim(id);
    }
  }

  private updateRemotePilgrims(_delta: number): void {
    if (!this.add) return;
    for (const remote of this.remotePilgrims.values()) {
      const lerp = 0.12;
      const newX = remote.sprite.x + (remote.targetX - remote.sprite.x) * lerp;
      const newY = remote.sprite.y + (remote.targetY - remote.sprite.y) * lerp;
      remote.sprite.setPosition(newX, newY);
      remote.label.setPosition(newX, newY - 40);
    }
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    if (!this.player?.body) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    if (this.conversationPaused) {
      body.setVelocity(0, 0);
      this.updatePlayerAnimation(0, 0);
      this.multiplayer?.update({ x: this.player.x, y: this.player.y, facing: this.facing, moving: false });
      this.updateRemotePilgrims(delta);
      this.playerLabel.setPosition(this.player.x, this.player.y - 40);
      return;
    }

    if (this.pointerTarget) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.pointerTarget.x, this.pointerTarget.y,
      );
      if (distance > 8) {
        this.physics.moveTo(this.player, this.pointerTarget.x, this.pointerTarget.y, PLAYER_SPEED);
      } else {
        this.pointerTarget = undefined;
        body.setVelocity(0, 0);
      }
    } else {
      body.setVelocity(0, 0);
    }

    this.updatePlayerAnimation(body.velocity.x, body.velocity.y);
    this.multiplayer?.update({
      x: this.player.x,
      y: this.player.y,
      facing: this.facing,
      moving: body.velocity.lengthSq() > 1,
    });
    this.updateRemotePilgrims(delta);

    this.playerLabel.setPosition(this.player.x, this.player.y - 40);

    // Periodic save
    this.saveAccumulator += delta;
    if (this.saveAccumulator >= 2000) {
      this.saveAccumulator = 0;
      this.persistPosition();
    }
  }

  private updatePlayerAnimation(velocityX: number, velocityY: number): void {
    let direction: Direction | null = null;
    if (Math.abs(velocityY) >= Math.abs(velocityX) && velocityY < -1) direction = 'up';
    else if (Math.abs(velocityY) >= Math.abs(velocityX) && velocityY > 1) direction = 'down';
    else if (velocityX < -1) direction = 'left';
    else if (velocityX > 1) direction = 'right';

    if (!direction) {
      this.player.anims.pause();
      return;
    }
    if (this.facing !== direction || !this.player.anims.isPlaying) {
      this.facing = direction;
      this.player.play(`peer-${ANGLE_BY_DIRECTION[direction]}`, true);
    }
    this.player.anims.resume();
  }

  private persistPosition(): void {
    if (this.player?.active) {
      this.save.playerX = Math.round(this.player.x);
      this.save.playerY = Math.round(this.player.y);
    }
    writeSave(this.save);
    gameEvents.emit(EVENT_SAVE, { ...this.save });
  }

  // ---------------------------------------------------------------- public API

  /** Update points from server broadcast */
  updatePoints(points: number): void {
    this.save.points = points;
    gameEvents.emit(EVENT_POINTS_UPDATED, points);
  }

  /** Get the selected peer ID (for wave targeting from DOM) */
  getSelectedPeerId(): string | null {
    return this.selectedPeerId;
  }

  setSelectedPeerId(id: string | null): void {
    this.selectedPeerId = id;
  }
}
