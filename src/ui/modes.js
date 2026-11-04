// The three screen modes. Small and taskbar pop out into an always-on-top Document
// Picture-in-Picture window where the browser offers one (Chrome, Edge); elsewhere
// they dock inside the page. A browser tab cannot enter the real OS taskbar.
export const PRESETS = {
  S: { width: 320, height: 210 },
  M: { width: 440, height: 290 },
  L: { width: 600, height: 400 },
};
const STRIP = { width: 620, height: 60 };

export class WindowModes {
  constructor({ app, onChange }) {
    this.app = app;
    this.onChange = onChange;
    this.mode = 'large';
    this.preset = 'M';
    this.pip = null;
    this.homeParent = app.parentElement;
    this.homeNext = app.nextSibling;
    this.supportsPip = 'documentPictureInPicture' in window;
  }

  get win() {
    return this.pip ?? window;
  }

  async set(mode) {
    const was = this.mode;
    if (mode === was) return;

    if (mode === 'large') {
      this.mode = 'large';
      if (this.pip) this.pip.close(); // pagehide restores the element
      this.applyClasses();
      window.focus();
      this.onChange();
      return;
    }

    this.mode = mode;
    const size = mode === 'small' ? PRESETS[this.preset] : STRIP;
    if (this.pip) {
      try {
        this.pip.resizeTo(size.width + (this.pip.outerWidth - this.pip.innerWidth), size.height + (this.pip.outerHeight - this.pip.innerHeight));
      } catch {
        /* Some browsers only allow this with a fresh gesture; the layout still adapts. */
      }
    } else if (this.supportsPip) {
      await this.openPip(size);
    }
    this.applyClasses();
    this.onChange();
  }

  setPreset(key) {
    this.preset = key;
    const size = PRESETS[key];
    if (this.pip) {
      try {
        this.pip.resizeTo(size.width + (this.pip.outerWidth - this.pip.innerWidth), size.height + (this.pip.outerHeight - this.pip.innerHeight));
      } catch {
        /* See set(). */
      }
    }
    this.applyClasses();
    this.onChange();
  }

  async openPip(size) {
    let pip;
    try {
      pip = await window.documentPictureInPicture.requestWindow({ width: size.width, height: size.height });
    } catch {
      return false; // Refused or unavailable: the in-page corner window takes over.
    }
    for (const sheet of document.styleSheets) {
      const node = sheet.ownerNode?.cloneNode(true);
      if (!node) continue;
      if (node.tagName === 'LINK') node.href = sheet.href;
      pip.document.head.appendChild(node);
    }
    pip.document.title = 'Deckstop';
    pip.document.body.appendChild(this.app);
    this.pip = pip;
    pip.addEventListener('pagehide', () => {
      this.homeParent.insertBefore(this.app, this.homeNext);
      this.pip = null;
      // Closing the floating window returns the game to the full view.
      this.mode = 'large';
      this.applyClasses();
      this.onChange();
    });
    return true;
  }

  // Classes go on #app itself so they travel with it into the floating window.
  applyClasses() {
    const { app } = this;
    app.classList.toggle('mode-large', this.mode === 'large');
    app.classList.toggle('mode-small', this.mode === 'small');
    app.classList.toggle('mode-taskbar', this.mode === 'taskbar');
    const away = this.mode !== 'large';
    document.body.classList.toggle('m-away', away);
    app.classList.toggle('docked-small', this.mode === 'small' && !this.pip);
    app.classList.toggle('docked-taskbar', this.mode === 'taskbar' && !this.pip);
    if (this.mode === 'small' && !this.pip) {
      const size = PRESETS[this.preset];
      app.style.width = `${size.width}px`;
      app.style.height = `${size.height}px`;
    } else {
      app.style.width = '';
      app.style.height = '';
    }
  }
}
