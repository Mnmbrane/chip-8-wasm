import { Chip8 } from '../../../pkg';
import * as wasm from '../../../pkg/chip8_emulator_bg.wasm';
import '../style/main.css';

// Global emulator instance for WASM callback
let globalEmulatorInstance: Chip8Emulator | null = null;
let instanceCounter = 0;

// Export update_canvas function for WASM to call
(window as any).update_canvas = function() {
  if (globalEmulatorInstance) {
    globalEmulatorInstance.updateDisplay();
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
  private imageData: ImageData;
  private bufferCanvas: HTMLCanvasElement;
  private bufferCtx: CanvasRenderingContext2D;
  private lastTime = 0;
  private timerCycleTime = 1000 / 60; // 60Hz timers
  private lastTimerUpdate = 0;
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

    // Create buffer canvas for pixel-level operations
    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = Chip8Emulator.WIDTH;
    this.bufferCanvas.height = Chip8Emulator.HEIGHT;
    this.bufferCtx = this.bufferCanvas.getContext('2d')!;

    // Create ImageData for fast pixel manipulation
    this.imageData = this.bufferCtx.createImageData(Chip8Emulator.WIDTH, Chip8Emulator.HEIGHT);

    // Initialize pixels array once
    const screenDataPtr = this.chip8.get_screen();
    this.pixels = new Uint8Array(wasm.memory.buffer, screenDataPtr, Chip8Emulator.WIDTH * Chip8Emulator.HEIGHT);

    if (screenContainer) screenContainer.appendChild(this.canvas);
    this.setupKeyboardHandling();
    this.setupRomLoader();
    this.setupTestRomButton();
    this.setupResetButton();
    // Don't start main loop until ROM is loaded
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');

    canvas.width = Chip8Emulator.WIDTH * Chip8Emulator.SCALE;
    canvas.height = Chip8Emulator.HEIGHT * Chip8Emulator.SCALE;
    return canvas;
  }

  public updateDisplay() {
    // Update ImageData directly from pixel buffer
    for (let i = 0; i < this.pixels.length; i++) {
      const pixelIndex = i * 4;
      const color = this.pixels[i] ? 255 : 0; // 255 = white, 0 = black

      this.imageData.data[pixelIndex] = color;     // Red
      this.imageData.data[pixelIndex + 1] = color; // Green  
      this.imageData.data[pixelIndex + 2] = color; // Blue
      this.imageData.data[pixelIndex + 3] = 255;   // Alpha (always opaque)
    }

    // Put image data on the small buffer canvas
    this.bufferCtx.putImageData(this.imageData, 0, 0);

    // Clear main canvas and scale up the buffer canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false; // Keep pixels crisp when scaling
    this.ctx.drawImage(
      this.bufferCanvas,
      0, 0, Chip8Emulator.WIDTH, Chip8Emulator.HEIGHT,
      0, 0, this.canvas.width, this.canvas.height
    );
  }

  private mainLoop = (currentTime: number) => {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // CPU runs at browser refresh rate (usually 60Hz)
    for (let i = 0; i < 10; i++) {
      this.chip8.tick();
    }

    // Timer updates (60Hz) - only decrement timers at 60Hz even if running faster
    if (currentTime - this.lastTimerUpdate >= this.timerCycleTime) {
      // Timer decrements happen in chip8.tick()
      this.lastTimerUpdate = currentTime;
    }
    this.animationFrameId = requestAnimationFrame(this.mainLoop);
  }

  private startMainLoop() {
    this.lastTime = performance.now();
    this.lastTimerUpdate = this.lastTime;
    this.animationFrameId = requestAnimationFrame(this.mainLoop);
  }

  public playSound() {
    // play a sound
  }

  public stopMainLoop() {
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

        this.chip8.load_rom(romData);

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

  private setupTestRomButton() {
    const testRomSelect = document.getElementById('test-rom-select') as HTMLSelectElement;
    if (!testRomSelect) {
      console.error('Test ROM select not found');
      return;
    }

    testRomSelect.addEventListener('change', async (event) => {
      const selectedRom = (event.target as HTMLSelectElement).value;
      if (!selectedRom) return;

      try {
        const response = await fetch(`./test_roms/${selectedRom}`);
        if (!response.ok) {
          throw new Error(`Failed to load test ROM: ${selectedRom}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const romData = new Uint8Array(arrayBuffer);

        // Stop execution and reset the emulator first
        this.stopMainLoop();
        this.chip8.reset();

        this.chip8.load_rom(romData);

        // Clear the screen and update display
        this.updateDisplay();

        // Start the main loop now that ROM is loaded
        this.startMainLoop();

      } catch (error) {
        console.error('Error loading test ROM:', error);
        alert(`Failed to load test ROM: ${selectedRom}`);
      } finally {
        // Reset the dropdown to default
        testRomSelect.value = '';
      }
    });
  }

  private setupResetButton() {
    const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    if (!resetBtn) {
      console.error('Reset button not found');
      return;
    }

    resetBtn.addEventListener('click', () => {
      // Stop the main loop
      this.stopMainLoop();

      // Reset the emulator state
      this.chip8.reset();

      // Clear and update display
      this.updateDisplay();

      console.log('Emulator reset');
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
      if (keyMap.hasOwnProperty(key) && !event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.chip8.set_key(keyMap[key]);
        console.log(`Setting key ${key}`)
      }
    });

    document.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (keyMap.hasOwnProperty(key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.chip8.unset_key(keyMap[key])
        console.log(`Un-setting key ${key}`)
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
