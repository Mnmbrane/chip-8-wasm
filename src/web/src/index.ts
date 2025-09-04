import { Chip8 } from '../../../pkg';
import * as wasm from '../../../pkg/chip8_emulator_bg.wasm';
import '../style/main.css';

// Global emulator instance for WASM callback
let globalEmulatorInstance: Chip8Emulator | null = null;

// Export update_canvas function for WASM to call
(window as any).update_canvas = function () {
  if (globalEmulatorInstance) {
    globalEmulatorInstance.updateDisplay();
  }
};


class Chip8Emulator {
  // Static properties for dimensions - initialized once
  private static WIDTH: number;
  private static HEIGHT: number;
  private static readonly SCALE = 15;

  private chip8: Chip8;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pixels: Uint8Array;
  private lastTime = 0;
  private timerCycleTime = 1000 / 60; // 60Hz timers
  private lastTimerUpdate = 0;

  static initializeDimensions(chip8: Chip8) {
    if (!Chip8Emulator.WIDTH || !Chip8Emulator.HEIGHT) {
      Chip8Emulator.WIDTH = chip8.get_width();
      Chip8Emulator.HEIGHT = chip8.get_height();

      // Set CSS custom properties
      const aspectRatio = Chip8Emulator.WIDTH / Chip8Emulator.HEIGHT;
      document.documentElement.style.setProperty('--chip8-width', Chip8Emulator.WIDTH.toString());
      document.documentElement.style.setProperty('--chip8-height', Chip8Emulator.HEIGHT.toString());
      document.documentElement.style.setProperty('--chip8-aspect-ratio', aspectRatio.toString());
    }
  }

  constructor(chip8: Chip8) {
    // Initialize static dimensions if not already done
    Chip8Emulator.initializeDimensions(chip8);

    // Set global instance for WASM callback
    globalEmulatorInstance = this;

    const screenContainer = document.querySelector('.screen-container');

    // Clear any existing canvases
    if (screenContainer) {
      const existingCanvases = screenContainer.querySelectorAll('canvas');
      existingCanvases.forEach(canvas => canvas.remove());
    }

    this.chip8 = chip8;
    this.canvas = this.createCanvas();
    this.ctx = this.canvas.getContext('2d')!;

    // Initialize pixels array once
    const screenDataPtr = this.chip8.get_screen();
    this.pixels = new Uint8Array(wasm.memory.buffer, screenDataPtr, Chip8Emulator.WIDTH * Chip8Emulator.HEIGHT);

    if (screenContainer) screenContainer.appendChild(this.canvas);
    this.setupKeyboardHandling();
    this.startGameLoop();
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');

    canvas.width = Chip8Emulator.WIDTH * Chip8Emulator.SCALE;
    canvas.height = Chip8Emulator.HEIGHT * Chip8Emulator.SCALE;
    console.log(`Canvas created: ${canvas.width}×${canvas.height} (${Chip8Emulator.WIDTH}×${Chip8Emulator.HEIGHT} logical pixels)`);
    return canvas;
  }

  private setupDisplay() {
    const screenContainer = document.querySelector('.screen-container');
    if (screenContainer) {
      screenContainer.appendChild(this.canvas);
    } else {
      document.body.appendChild(this.canvas);
    }
  }

  public updateDisplay() {
    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = '#ffffff'; // White pixels

    for (let row = 0; row < Chip8Emulator.HEIGHT; row++) {
      for (let col = 0; col < Chip8Emulator.WIDTH; col++) {
        const idx = row * Chip8Emulator.WIDTH + col;
        if (this.pixels[idx] === 1) {
          this.ctx.fillRect(col * Chip8Emulator.SCALE, row * Chip8Emulator.SCALE, Chip8Emulator.SCALE, Chip8Emulator.SCALE);
        }
      }
    }
  }

  private gameLoop = (currentTime: number) => {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // CPU runs at browser refresh rate (usually 60Hz)
    this.chip8.tick();

    // Timer updates (60Hz) - only decrement timers at 60Hz even if running faster
    if (currentTime - this.lastTimerUpdate >= this.timerCycleTime) {
      // Timer decrements happen in chip8.tick()
      this.lastTimerUpdate = currentTime;
    }

    // Display updates are now handled by WASM callback (update_canvas)
    // this.updateDisplay(); // Removed - now called via WASM

    requestAnimationFrame(this.gameLoop);
  }

  private startGameLoop() {
    this.lastTime = performance.now();
    this.lastTimerUpdate = this.lastTime;
    requestAnimationFrame(this.gameLoop);
  }

  private setupKeyboardHandling() {
    // CHIP-8 keypad mapping to keyboard keys
    // Original CHIP-8 keypad:
    // 1 2 3 C    ->    1 2 3 4
    // 4 5 6 D    ->    Q W E R
    // 7 8 9 E    ->    A S D F
    // A 0 B F    ->    Z X C V

    const keyMap: { [key: string]: number } = {
      '1': 0x1, '2': 0x2, '3': 0x3, '4': 0xC,
      'q': 0x4, 'w': 0x5, 'e': 0x6, 'r': 0xD,
      'a': 0x7, 's': 0x8, 'd': 0x9, 'f': 0xE,
      'z': 0xA, 'x': 0x0, 'c': 0xB, 'v': 0xF
    };

    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (keyMap.hasOwnProperty(key)) {
        event.preventDefault();
        this.chip8.set_key_pressed(keyMap[key]);
      }
    });

    document.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (keyMap.hasOwnProperty(key)) {
        event.preventDefault();
        this.chip8.set_key_unpressed(keyMap[key]);
      }
    });
  }
}

let emulatorInstance: Chip8Emulator | null = null;

function main() {
  // Prevent multiple instances
  if (emulatorInstance) {
    console.log('Emulator already running');
    return;
  }

  const chip8 = Chip8.new();

  // Create emulator instance first
  emulatorInstance = new Chip8Emulator(chip8);

  // Test simple draw opcode
  console.log("Testing draw opcode...");

  // Clear screen first
  chip8.handle_opcode(0x00E0);  // CLS - Clear screen

  // Set position (10, 10)
  chip8.handle_opcode(0x600A);  // Set V0 = 10 (x position)
  chip8.handle_opcode(0x610A);  // Set V1 = 10 (y position)

  // Set I to point to font data (which should be loaded at 0x55 for digit "1")
  chip8.handle_opcode(0xA055);  // Set I = 0x055

  // Draw 5-byte sprite at (V0, V1)
  chip8.handle_opcode(0xD015);  // Draw sprite: D=draw, 0=V0, 1=V1, 5=5 bytes

  console.log("Draw opcode executed");
}

main();
