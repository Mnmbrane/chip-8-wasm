import { Chip8 } from '../../../pkg';
import * as wasm from '../../../pkg/chip8_emulator_bg.wasm';
import '../style/main.css';

// Global emulator instance for WASM callback
let globalEmulatorInstance: Chip8Emulator | null = null;
let instanceCounter = 0;
const regResetValue: number = -1;

// Export update_canvas function for WASM to call
(window as any).update_canvas = function() {
  if (globalEmulatorInstance) {
    globalEmulatorInstance.updateDisplay();
  }
};

// Export stop_main_loop function for WASM to call
(window as any).wait_for_key_press = function(reg: number) {
  if (globalEmulatorInstance) {
    globalEmulatorInstance.stopMainLoop();
    globalEmulatorInstance.saveToReg = reg;
  }
};

// Export play_sound function for WASM to call
(window as any).play_sound = function() {
  if (globalEmulatorInstance) {
    globalEmulatorInstance.playSound();
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
  private memory: Uint8Array;
  private reg: Uint8Array;
  private keys: Uint8Array;
  private lastTime = 0;
  private timerCycleTime = 1000 / 60; // 60Hz timers
  private lastTimerUpdate = 0;
  private isMainLoopRunning = false;
  public saveToReg = regResetValue;
  private instanceId: number;
  private animationFrameId: number | null = null;

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

    this.instanceId = ++instanceCounter;

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
    const memoryPtr = this.chip8.get_memory();
    this.memory = new Uint8Array(wasm.memory.buffer, memoryPtr, 0x1000);
    const regPtr = this.chip8.get_registers();
    this.reg = new Uint8Array(wasm.memory.buffer, regPtr, 16);
    const keyPtr = this.chip8.get_keys();
    this.keys = new Uint8Array(wasm.memory.buffer, keyPtr, 16);

    if (screenContainer) screenContainer.appendChild(this.canvas);
    this.setupKeyboardHandling();
    this.setupRomLoader();
    // Don't start main loop until ROM is loaded
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');

    canvas.width = Chip8Emulator.WIDTH * Chip8Emulator.SCALE;
    canvas.height = Chip8Emulator.HEIGHT * Chip8Emulator.SCALE;
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

  private mainLoop = (currentTime: number) => {
    if (this.isMainLoopRunning) {
      const deltaTime = currentTime - this.lastTime;
      this.lastTime = currentTime;

      // CPU runs at browser refresh rate (usually 60Hz)
      this.chip8.tick();

      // Timer updates (60Hz) - only decrement timers at 60Hz even if running faster
      if (currentTime - this.lastTimerUpdate >= this.timerCycleTime) {
        // Timer decrements happen in chip8.tick()
        this.lastTimerUpdate = currentTime;
      }
      this.animationFrameId = requestAnimationFrame(this.mainLoop);
    }
  }

  private startMainLoop() {
    if (this.isMainLoopRunning) {
      return;
    }
    this.lastTime = performance.now();
    this.lastTimerUpdate = this.lastTime;
    this.isMainLoopRunning = true;
    this.animationFrameId = requestAnimationFrame(this.mainLoop);
  }

  public playSound() {
    // play a sound
  }

  public stopMainLoop() {
    this.isMainLoopRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private setupRomLoader() {
    const romInput = document.getElementById('rom-file') as HTMLInputElement;
    if (!romInput) {
      console.error('ROM file input not found');
      return;
    }

    romInput.addEventListener('change', async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const romData = new Uint8Array(arrayBuffer);

        console.log(`Loading ROM: ${file.name} (${romData.length} bytes)`);

        // Stop execution and reset the emulator first
        this.stopMainLoop();
        this.chip8.reset();

        // Load ROM into memory starting at 0x200
        const ROM_START = 0x200;
        const maxRomSize = 0x1000 - ROM_START; // Available memory for ROM

        if (romData.length > maxRomSize) {
          console.warn(`ROM too large (${romData.length} bytes). Truncating to ${maxRomSize} bytes.`);
        }

        // Copy ROM data directly into WASM memory
        const bytesToCopy = Math.min(romData.length, maxRomSize);
        for (let i = 0; i < bytesToCopy; i++) {
          this.memory[ROM_START + i] = romData[i];
        }

        console.log(`ROM loaded successfully: ${bytesToCopy} bytes at 0x${ROM_START.toString(16)}`);

        // Clear the screen and update display
        this.updateDisplay();

        // Start the main loop now that ROM is loaded
        this.startMainLoop();

      } catch (error) {
        console.error('Error loading ROM:', error);
        alert('Failed to load ROM file');
      } finally {
        // Clear the input so the same file can be loaded again
        romInput.value = '';
      }
    });
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

        // save to the register 
        if (!this.isMainLoopRunning) {
          this.reg[this.saveToReg] = keyMap[key];
          this.keys[keyMap[key]] = 1;
          this.saveToReg = regResetValue;
          this.startMainLoop();
        }
      }
      // test key to halt
      else if (key === 'b') {
        this.stopMainLoop();
      }
    });

    document.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (keyMap.hasOwnProperty(key)) {
        event.preventDefault();
        this.keys[keyMap[key]] = 0;
      }
    });
  }
}

function main() {
  // Prevent multiple runs of main using a global window property
  if ((window as any).chip8MainHasRun) {
    return;
  }
  (window as any).chip8MainHasRun = true;

  // Prevent multiple instances
  if (globalEmulatorInstance) {
    return;
  }

  const chip8 = Chip8.new();
  const emulator = new Chip8Emulator(chip8);
}

main();
