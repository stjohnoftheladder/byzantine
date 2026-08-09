import Phaser from 'phaser';

/**
 * LadderScene — placeholder for the full St. John of the Ladder mini-game.
 * Proves "games live on the map" with a scene transition from the Hub.
 * The full 30-rung climb will be wired in post-pilot.
 */
export class LadderScene extends Phaser.Scene {
  constructor() {
    super('Ladder');
  }

  create(): void {
    // Dark background matching the Byzantine aesthetic
    this.cameras.main.setBackgroundColor('#120d07');

    // Title
    this.add
      .text(240, 320, 'St. John of the Ladder', {
        fontFamily: 'Georgia, serif',
        fontSize: '22px',
        color: '#f3d276',
      })
      .setOrigin(0.5);

    this.add
      .text(240, 360, 'The 30-rung ascent', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#c4a46c',
      })
      .setOrigin(0.5);

    this.add
      .text(240, 420, 'Coming to the Hub soon.', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: '#a89878',
      })
      .setOrigin(0.5);

    // Return to Hub button
    const btn = this.add
      .text(240, 500, 'Return to Hub', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#120d07',
        backgroundColor: '#f3d276',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => {
      this.scene.start('Hub');
    });
    btn.on('pointerover', () => btn.setAlpha(0.85));
    btn.on('pointerout', () => btn.setAlpha(1));
  }
}
