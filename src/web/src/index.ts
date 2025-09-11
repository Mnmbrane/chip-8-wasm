import { Chip8 } from '../../../pkg';
import * as wasm from '../../../pkg/chip8_emulator_bg.wasm';
import '../style/main.css';

// Export update_canvas function for WASM to call
(window as any).update_canvas = function () {
  updateDisplay();
};

// Export play_sound function for WASM to call
(window as any).play_beep = function () {
  playBeep();
};

const WIDTH: number = 64;
const HEIGHT: number = 32;
const SCALE = 15;

const chip8 = Chip8.new();
const canvas: HTMLCanvasElement = createCanvas();
const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
var pixels: Uint8Array;
const bufferCanvas: HTMLCanvasElement = document.createElement('canvas');
const bufferCtx: CanvasRenderingContext2D = bufferCanvas.getContext('2d')!;;
const imageData: ImageData = bufferCtx.createImageData(WIDTH, HEIGHT);;
var lastTime = 0;
const timerCycleTime = 1000 / 60; // 60Hz timers
var lastTimerUpdate = 0;
var animationFrameId: number | null = null;
var audioContext: AudioContext | null = null;

// Initialize pixels array once
const screenDataPtr = chip8.get_screen();
pixels = new Uint8Array(wasm.memory.buffer, screenDataPtr, WIDTH * HEIGHT);

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

  canvas.width = WIDTH * SCALE;
  canvas.height = HEIGHT * SCALE;
  return canvas;
}

// Create buffer canvas for pixel-level operations
bufferCanvas.width = WIDTH;
bufferCanvas.height = HEIGHT;



function updateDisplay() {
  // Update ImageData directly from pixel buffer
  for (let i = 0; i < pixels.length; i++) {
    const pixelIndex = i * 4;
    const color = pixels[i] ? 255 : 0; // 255 = white, 0 = black

    imageData.data[pixelIndex] = color;     // Red
    imageData.data[pixelIndex + 1] = color; // Green  
    imageData.data[pixelIndex + 2] = color; // Blue
    imageData.data[pixelIndex + 3] = 255;   // Alpha (always opaque)
  }

  // Put image data on the small buffer canvas
  bufferCtx.putImageData(imageData, 0, 0);

  // Clear main canvas and scale up the buffer canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false; // Keep pixels crisp when scaling
  ctx.drawImage(
    bufferCanvas,
    0, 0, WIDTH, HEIGHT,
    0, 0, canvas.width, canvas.height
  );
}

function mainLoop(currentTime: number) {
  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;

  // CPU runs at browser refresh rate (usually 60Hz)
  for (let i = 0; i < 7; i++) {
    chip8.tick();
  }

  // Timer updates (60Hz) - only decrement timers at 60Hz even if running faster
  if (currentTime - lastTimerUpdate >= timerCycleTime) {
    // Timer decrements happen in chip8.tick()
    lastTimerUpdate = currentTime;
  }
  animationFrameId = requestAnimationFrame(mainLoop);
}

function startMainLoop() {
  lastTime = performance.now();
  lastTimerUpdate = lastTime;
  animationFrameId = requestAnimationFrame(mainLoop);
}

function stopMainLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function restartEmulatorWithRom(romData: Uint8Array) {

  // Stop execution and reset the emulator first
  stopMainLoop();
  chip8.reset();

  chip8.load_rom(romData);

  // Clear the screen and update display
  updateDisplay();

  // Start the main loop now that ROM is loaded
  startMainLoop();
}

function setupRomButtons() {
  const romInput = document.getElementById('rom-file') as HTMLInputElement;
  const testRomSelect = document.getElementById('test-rom-select') as HTMLSelectElement;

  romInput.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const romData = new Uint8Array(arrayBuffer);
      console.log(`Loading ROM: ${file.name} (${romData.length} bytes)`);

      restartEmulatorWithRom(romData);
      // Blur focus from any UI elements to prevent key conflicts
      (document.activeElement as HTMLElement)?.blur();

    } catch (error) {
      console.error('Error loading ROM:', error);
      alert('Failed to load ROM file');
    } finally {
      // Clear the input so the same file can be loaded again
      romInput.value = '';
    }
  });

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

      restartEmulatorWithRom(romData);

      // Blur focus from any UI elements to prevent key conflicts
      (document.activeElement as HTMLElement)?.blur();

    } catch (error) {
      console.error('Error loading test ROM:', error);
      alert(`Failed to load test ROM: ${selectedRom}`);
    } finally {
      // Reset the dropdown to default
      testRomSelect.value = '';
    }
  });
}

function setupResetButton() {
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  if (!resetBtn) {
    console.error('Reset button not found');
    return;
  }

  resetBtn.addEventListener('click', () => {
    // Stop the main loop
    stopMainLoop();

    // Reset the emulator state
    chip8.reset();

    // Clear and update display
    updateDisplay();

    console.log('Emulator reset');
  });
}

// Global key mapping
let globalKeyMap: { [key: string]: number } = {
  '1': 0x1, '2': 0x2, '3': 0x3, '4': 0xC,
  'q': 0x4, 'w': 0x5, 'e': 0x6, 'r': 0xD,
  'a': 0x7, 's': 0x8, 'd': 0x9, 'f': 0xE,
  'z': 0xA, 'x': 0x0, 'c': 0xB, 'v': 0xF
};

function setupRemapKeysButton() {
  const remapBtn = document.getElementById('remap-keys-btn') as HTMLButtonElement;
  if (!remapBtn) {
    console.error('Remap keys button not found');
    return;
  }

  remapBtn.addEventListener('click', () => {
    openKeyRemapPopup();
  });
}

function openKeyRemapPopup() {
  const overlay = document.getElementById('key-remap-overlay');
  if (!overlay) {
    console.error('Key remap overlay not found');
    return;
  }

  // Pause the emulator while remapping
  stopMainLoop();

  // Populate current values in the inputs
  populateCurrentKeyMappings();

  // Show the popup
  overlay.style.display = 'flex';

  // Set up event handlers
  setupPopupEventHandlers();
}

function populateCurrentKeyMappings() {
  // Create reverse mapping (chip8 value -> keyboard key)
  const reverseMap: { [chip8Value: number]: string } = {};
  Object.entries(globalKeyMap).forEach(([key, value]) => {
    reverseMap[value] = key;
  });

  // Populate input fields with current mappings and add blur handlers
  const inputs = document.querySelectorAll('#key-grid input');
  inputs.forEach((input) => {
    const inputElement = input as HTMLInputElement;
    const chip8Value = parseInt(inputElement.dataset.chip8Value!);
    const originalValue = reverseMap[chip8Value] || '';
    inputElement.value = originalValue;

    // Store original value as data attribute
    inputElement.dataset.originalValue = originalValue;

    // Add blur handler to revert to original if empty
    inputElement.addEventListener('blur', function() {
      if (this.value.trim() === '') {
        this.value = this.dataset.originalValue || '';
      }
    });
  });
}

// Track if event listeners are already set up
let popupEventListenersSetup = false;

function setupPopupEventHandlers() {
  // Only setup once
  if (popupEventListenersSetup) return;
  
  const overlay = document.getElementById('key-remap-overlay');
  const closeBtn = document.getElementById('popup-close-btn');
  const cancelBtn = document.getElementById('popup-cancel-btn');
  const applyBtn = document.getElementById('popup-apply-btn');

  const closePopup = () => {
    if (overlay) overlay.style.display = 'none';
    document.removeEventListener('keydown', handleEscKey);
    // Resume the emulator when closing the popup
    startMainLoop();
  };

  const handleEscKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePopup();
    }
  };

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', closePopup);
  }

  // Cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closePopup);
  }

  // Click overlay to close
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePopup();
    });
  }

  // ESC key
  document.addEventListener('keydown', handleEscKey);

  // Apply button
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      applyKeyMapping();
      closePopup();
    });
  }

  popupEventListenersSetup = true;
}

function applyKeyMapping() {
  const inputs = document.querySelectorAll('#key-grid input') as NodeListOf<HTMLInputElement>;
  const newKeyMap: { [key: string]: number } = {};
  const usedKeys = new Set<string>();

  // Collect all mappings and check for duplicates
  let hasError = false;
  inputs.forEach((input) => {
    const key = input.value.toLowerCase().trim();
    const chip8Value = parseInt(input.dataset.chip8Value!);

    if (key) {
      if (usedKeys.has(key)) {
        alert(`Key '${key}' is mapped to multiple CHIP-8 keys. Each key can only be used once.`);
        hasError = true;
        return;
      }
      usedKeys.add(key);
      newKeyMap[key] = chip8Value;
    }
  });

  if (hasError) return;

  // Update the global key mapping
  globalKeyMap = { ...newKeyMap };

  console.log('Key mapping updated:', globalKeyMap);
  alert('Key mapping applied successfully!');
}

function playBeep(duration = 200, frequency = 400, volume = 0.5) {
  // Create AudioContext on first use (requires user gesture)
  if (!audioContext) {
    audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
  }

  // Resume if suspended
  if (audioContext!.state === 'suspended') {
    audioContext!.resume();
  }

  const oscillator = audioContext!.createOscillator();
  const gainNode = audioContext!.createGain();

  // Connect the nodes
  oscillator.connect(gainNode);
  gainNode.connect(audioContext!.destination);

  // Set the oscillator properties
  oscillator.type = "square"; // Can be "sine", "square", "sawtooth", or "triangle"
  oscillator.frequency.value = frequency; // Frequency in Hertz
  gainNode.gain.value = volume * 0.01; // Volume (0 to 1)

  // Start and stop the sound
  oscillator.start(audioContext!.currentTime);
  oscillator.stop(audioContext!.currentTime + duration * 0.001);
}

function setupKeyboardHandling() {
  // CHIP-8 keypad mapping to keyboard keys
  // Original CHIP-8 keypad:
  // 1 2 3 C    ->    1 2 3 4
  // 4 5 6 D    ->    Q W E R
  // 7 8 9 E    ->    A S D F
  // A 0 B F    ->    Z X C V

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (globalKeyMap.hasOwnProperty(key) && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      chip8.set_key(globalKeyMap[key]);
      console.log(`Setting key ${key}`)
    }
  });

  document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (globalKeyMap.hasOwnProperty(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      chip8.unset_key(globalKeyMap[key])
      console.log(`Un-setting key ${key}`)
    }
  });
}

function main() {
  // Set CSS custom properties
  const aspectRatio = WIDTH / HEIGHT;
  document.documentElement.style.setProperty('--chip8-width', WIDTH.toString());
  document.documentElement.style.setProperty('--chip8-height', HEIGHT.toString());
  document.documentElement.style.setProperty('--chip8-aspect-ratio', aspectRatio.toString());

  const screenContainer = document.querySelector('.screen-container');

  // Clear any existing canvases
  if (screenContainer) {
    const existingCanvases = screenContainer.querySelectorAll('canvas');
    existingCanvases.forEach(canvas => canvas.remove());
  }

  if (screenContainer) screenContainer.appendChild(canvas);
  setupKeyboardHandling();
  setupRomButtons();
  setupResetButton();
  setupRemapKeysButton();

  startMainLoop();
  // Don't start main loop until ROM is loaded
}

main();
