# Deckstop

A light idle game about crabbing in the Arctic, built to sit in a corner of your
screen while you work. Built with three.js from the Deckstop MVP draft; the look is
heavily inspired by Bad North. Every model, shader and sound is generated in code,
so the project ships no third-party art.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5183. Chrome or Edge is recommended: only they can pop the
small and taskbar modes out into a real always-on-top window.

```bash
npm test
```

## Controls

| Input | Action |
| --- | --- |
| W / S | Shift gear up / down (W also sets sail from port) |
| A / D | Turn the wheel. It stays where you leave it |
| X | Centre the wheel |
| Space | Neutral and brake |
| E | Drop cage |
| F | Haul a cage by hand (minigame) |
| C | Let the deckhand haul |
| P | Dock / open the harbour |
| R | Radar heatmap |
| M | Chart: cage management, waypoint, chained orders (large window) |
| G / H | Return to chain / sail home (needs a captain) |
| T | Call the tow ship when out of fuel |
| V | Voyage plan |
| Esc | Close the top panel, or pause |
| 1 / 2 / 3 | Taskbar / small / large window |
| Right-drag, wheel | Rotate camera, zoom |

## Layout

- `src/config.js`: every balance number.
- `src/sim/`: the rules (world, navigation, game). No three.js or DOM, tested from Node.
- `src/render/`: the scene (terrain, town, voxel light, water shader, ships, portraits, particles, camera, post effect).
- `src/ui/`: menus and harbour (hud), bridge console (dash), chart, minigame, taskbar strip, screen modes.

## Look

The techniques come from Oskar Stålberg's talk [Developing The Bad North Look](https://www.youtube.com/watch?v=6JcFbivo8dQ) (Konsoll 2018):

- **Voxel light:** the whole world is copied to a low-res voxel grid, swept top-down so each voxel averages the ones above it, and stored in a 3D texture that everything samples for soft AO. There are no cast shadows.
- **Voxel normals:** trees borrow the volume's normals, so a stand of trees lights as one mass.
- **Inverted hull:** models are drawn again inside out, one pixel larger, in a darker tone of their own colour.
- **ddy shadow:** a one-pixel shadow under the crisp snow edge, in a single shader pass.
- **Mirrored meshes:** reflections are the real geometry, flipped, near uniform in colour, and rippled by the water shader.
- **Borders, not textures:** flat areas stay calm; the detail sits at the shoreline and the snow line.

## Choices the design draft left open

- **Minigame:** the "rotating bar" candidate. Six pulls, stop the needle in the band.
- **Taskbar mode:** a browser cannot enter the real OS taskbar, so this is a thin
  always-on-top strip. A desktop wrapper such as Tauri would be needed for the real one.
- **Autopilot safety:** the captain heads to port unprompted when fuel gets too low to
  get home or the tank is full, and calls the tow if ever stranded.
- **Debt:** fuel and rations can be bought down to -$150, so a broke player is never
  stuck in port.
- **Starting radar:** a short-range radar is fitted from the start; upgrades extend it.
- **Closing the tab pauses the game.** Hidden tabs keep running; only closing stops time.
