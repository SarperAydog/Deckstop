// Haul the cage: a needle sweeps round the winch dial; stop it inside the tension
// band to bring the rope in. Six pulls, 10 to 20 seconds, one key or the mouse.
const PULLS = 6;
const TAU = Math.PI * 2;

export class Minigame {
  constructor({ container, game, audio, onClose }) {
    this.container = container;
    this.game = game;
    this.audio = audio;
    this.onClose = onClose;
    this.active = false;
    this.lastT = 0;
  }

  start() {
    this.active = true;
    this.pull = 0;
    this.scores = [];
    this.needle = -Math.PI / 2;
    this.flash = 0;
    this.flashGood = false;
    this.flashPerfect = false;
    this.done = false;
    this.lastT = performance.now();
    this.nextTarget();
    this.render();
  }

  nextTarget() {
    this.center = this.needle + Math.PI * (0.65 + Math.random() * 0.9);
    this.halfGood = 0.46 - this.pull * 0.045;
    this.halfPerfect = this.halfGood * 0.36;
    this.speed = (3.4 + this.pull * 0.42) * (Math.random() < 0.5 ? 1 : -1);
    this.swept = 0;
  }

  render() {
    const hasDeckhand = this.game.s.crew.deckhand;
    this.container.innerHTML = `
      <div class="dialog-wrap">
        <div class="paper panel mg" data-mg>
          <h2>Haul the Cage</h2>
          <canvas width="500" height="500" data-mg-hit></canvas>
          <div class="hint">Space or click inside the band</div>
          <div class="acts">
            ${hasDeckhand ? '<button class="btn" data-mg-crew>Leave it to the deckhand</button>' : ''}
            <button class="btn" data-mg-cancel>Leave the cage</button>
          </div>
        </div>
      </div>`;
    this.canvas = this.container.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.press();
    });
    this.container.querySelector('[data-mg-cancel]').addEventListener('click', () => this.cancel());
    this.container.querySelector('[data-mg-crew]')?.addEventListener('click', () => {
      this.cancel();
      this.game.collectByCrew();
    });
  }

  press() {
    if (!this.active || this.done) return;
    const off = Math.abs(Math.atan2(Math.sin(this.needle - this.center), Math.cos(this.needle - this.center)));
    let score = 0;
    if (off <= this.halfPerfect) score = 1;
    else if (off <= this.halfGood) score = 0.6;
    this.register(score);
  }

  register(score) {
    this.scores.push(score);
    this.flash = 1;
    this.flashGood = score > 0;
    this.flashPerfect = score === 1;
    if (score > 0) this.audio.hit(score === 1);
    else this.audio.miss();
    this.pull += 1;
    if (this.pull >= PULLS) this.finish();
    else this.nextTarget();
  }

  finish() {
    this.done = true;
    const quality = this.scores.reduce((a, b) => a + b, 0) / PULLS;
    this.resultCrabs = this.game.finishMinigame(quality);
    this.resultQuality = quality;
    this.endAt = performance.now() + 1300;
  }

  cancel() {
    this.game.cancelMinigame();
    this.close();
  }

  close() {
    this.active = false;
    this.container.innerHTML = '';
    this.onClose?.();
  }

  frame() {
    if (!this.active) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    if (this.done) {
      if (now > this.endAt) {
        this.close();
        return;
      }
    } else {
      this.needle += this.speed * dt;
      this.swept += Math.abs(this.speed) * dt;
      // Two full sweeps without a press counts as a miss, so a pull always ends.
      if (this.swept > TAU * 2) this.register(0);
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.draw();
  }

  draw() {
    const c = this.ctx;
    if (!c) return;
    const S = 500;
    const cx = S / 2;
    const cy = S / 2;
    const R = 205;
    c.clearRect(0, 0, S, S);

    c.lineWidth = 38;
    c.strokeStyle = '#cfc8b9';
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.stroke();

    if (!this.done) {
      c.strokeStyle = '#7fae86';
      c.beginPath();
      c.arc(cx, cy, R, this.center - this.halfGood, this.center + this.halfGood);
      c.stroke();
      c.strokeStyle = '#3f8f63';
      c.beginPath();
      c.arc(cx, cy, R, this.center - this.halfPerfect, this.center + this.halfPerfect);
      c.stroke();

      c.strokeStyle = '#3b3a40';
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(cx + Math.cos(this.needle) * (R - 42), cy + Math.sin(this.needle) * (R - 42));
      c.lineTo(cx + Math.cos(this.needle) * (R + 28), cy + Math.sin(this.needle) * (R + 28));
      c.stroke();
    }

    // Centre: the cage rising through the water as the pulls land.
    const earned = this.scores.reduce((a, b) => a + (b > 0 ? 1 : 0.35), 0) / PULLS;
    const wr = 148;
    c.save();
    c.beginPath();
    c.arc(cx, cy, wr, 0, TAU);
    c.clip();
    c.fillStyle = '#6d9aa5';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#4e7a86';
    c.fillRect(0, cy + 20, S, S);
    c.fillStyle = '#c6dfdb';
    c.fillRect(0, cy - wr, S, 26);
    const cageY = cy + wr - 55 - earned * (wr * 2 - 120);
    c.strokeStyle = '#f4f1e8';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx, cy - wr);
    c.lineTo(cx, cageY);
    c.stroke();
    c.fillStyle = '#40464e';
    c.fillRect(cx - 38, cageY, 76, 44);
    c.strokeStyle = '#d6c8ab';
    c.lineWidth = 4;
    c.strokeRect(cx - 38, cageY, 76, 44);
    c.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(cx - 38 + i * 19, cageY);
      c.lineTo(cx - 38 + i * 19, cageY + 44);
      c.stroke();
    }
    c.restore();

    if (this.flash > 0) {
      c.globalAlpha = this.flash;
      c.fillStyle = this.flashGood ? (this.flashPerfect ? '#2f7f55' : '#3b3a40') : '#b5473f';
      c.font = '700 50px Alegreya, Georgia, serif';
      c.textAlign = 'center';
      c.fillText(this.flashGood ? (this.flashPerfect ? 'Perfect' : 'Good') : 'Slack!', cx, cy - 8);
      c.globalAlpha = 1;
    }

    if (this.done) {
      c.fillStyle = '#fbf8ef';
      c.font = '700 66px Alegreya, Georgia, serif';
      c.textAlign = 'center';
      c.fillText(`+${this.resultCrabs ?? 0}`, cx, cy + 12);
      c.font = '30px Alegreya, Georgia, serif';
      c.fillText('crabs', cx, cy + 50);
    }

    for (let i = 0; i < PULLS; i++) {
      const a = -Math.PI / 2 + ((i - (PULLS - 1) / 2) * 0.18);
      const x = cx + Math.cos(a) * 240;
      const y = cy + Math.sin(a) * 240;
      c.beginPath();
      c.arc(x, y, 7, 0, TAU);
      const s = this.scores[i];
      c.fillStyle = s === undefined ? '#cfc8b9' : s === 1 ? '#2f7f55' : s > 0 ? '#7fae86' : '#b5473f';
      c.fill();
    }
  }
}
