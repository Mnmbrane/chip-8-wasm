import { Chip8 } from './pkg';
import * as wasm from './pkg/chip8_emulator_bg.wasm';

class Chip8Emulator {
  private chip8: Chip8;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastTime = 0;
  private timerCycleTime = 1000 / 60; // 60Hz timers
  private lastTimerUpdate = 0;

  constructor(chip8: Chip8) {
    this.chip8 = chip8;
    this.canvas = this.createCanvas();
    this.ctx = this.canvas.getContext('2d')!;
    this.setupDisplay();
    this.setupKeyboardHandling();
    this.startGameLoop();
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 960; // 64 * 15 pixel scale (640 * 1.5)
    canvas.height = 480; // 32 * 15 pixel scale (320 * 1.5)
    canvas.style.backgroundColor = '#000';
    canvas.style.imageRendering = 'pixelated';
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

  private updateDisplay() {
    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Get screen data pointer and create Uint8Array view
    const screenDataPtr = this.chip8.get_screen();
    const pixels = new Uint8Array(wasm.memory.buffer, screenDataPtr, 64 * 32);

    this.ctx.fillStyle = '#ffffff'; // White pixels

    for (let row = 0; row < 32; row++) {
      for (let col = 0; col < 64; col++) {
        const idx = row * 64 + col;
        if (pixels[idx] === 1) {
          this.ctx.fillRect(col * 15, row * 15, 15, 15);
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

    // Update display
    this.updateDisplay();

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

function main() {
  const chip8 = Chip8.new();

  // Create checkerboard pattern
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      chip8.xor_pixel(x, y, (x + y) % 2);
    }
  }

  new Chip8Emulator(chip8);
}

main();
