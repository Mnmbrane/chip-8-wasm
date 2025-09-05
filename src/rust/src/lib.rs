use core::panic;
use rand::{rngs::SmallRng, Rng, SeedableRng};

// https://www.cs.columbia.edu/~sedwards/classes/2016/4840-spring/designs/Chip8.pdf
use wasm_bindgen::prelude::*;
use web_sys::console;

macro_rules! console_log {
    ($($t:tt)*) => (web_sys::console::log_1(&format_args!($($t)*).to_string().into()))
}

const FRAME_BUF_WIDTH: usize = 64;
const FRAME_BUF_HEIGHT: usize = 32;

const MEM_MAX: usize = 0x1000;
const REG_MAX: usize = 16;
const FRAME_BUF_MAX: usize = FRAME_BUF_HEIGHT * FRAME_BUF_WIDTH;
const NUM_OF_KEYS: usize = 16;
const START_OF_FONT: usize = 0x50;

type Pixel = u8;

fn unhandled_opcode_panic(opcode: u16) {
    console_log!("ERROR: Unhandled opcode 0x{:04x}", opcode);
    panic!("Unhandled opcode 0x{:04x}", opcode);
}
// Opcode helper functions
fn get_x(opcode: u16) -> usize {
    ((opcode & 0x0F00) >> 8) as usize
}

fn get_y(opcode: u16) -> usize {
    ((opcode & 0x00F0) >> 4) as usize
}

fn get_kk(opcode: u16) -> u8 {
    (opcode & 0x00FF) as u8
}

fn get_nnn(opcode: u16) -> u16 {
    opcode & 0x0FFF
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    fn update_canvas();
    fn wait_for_keypress(x: usize);
}

#[cfg(not(target_arch = "wasm32"))]
fn update_canvas() {
    // No-op for native/test builds
}

#[cfg(not(target_arch = "wasm32"))]
fn wait_for_keypress(x: usize) {
    // No-op for native/test builds
}

#[wasm_bindgen]
pub struct Chip8 {
    // 0-512 bytes: Chip8 interpreter
    // 0xF00-0xFFF: Display refresh
    // 0xEA0-0xEFF: Call stack, internal use, and other variables
    memory: [u8; MEM_MAX],

    // V0, V1...VF
    // Address register(12 bits wids)?
    reg: [u8; REG_MAX],
    index_reg: u16,

    stack: Vec<usize>,

    // 64x32 frame buffer
    frame_buffer: [Pixel; FRAME_BUF_MAX],

    program_counter: usize,

    rand_rng: SmallRng,

    keys: [u8; NUM_OF_KEYS],

    delay_timer: u8,
    sound_timer: u8,
}

#[wasm_bindgen]
impl Chip8 {
    pub fn new() -> Self {
        let mut chip8 = Self {
            memory: [0u8; MEM_MAX],

            reg: [0u8; REG_MAX],
            index_reg: 0,

            stack: Vec::new(),

            frame_buffer: [0; FRAME_BUF_MAX],

            program_counter: 0x200,

            rand_rng: SmallRng::from_entropy(),

            keys: [0; NUM_OF_KEYS],

            delay_timer: 0,
            sound_timer: 0,
        };

        // Load font data into memory starting at 0x50
        let font_data = [
            0xF0, 0x90, 0x90, 0x90, 0xF0, // Digit 0 (0x50-0x54)
            0x20, 0x60, 0x20, 0x20, 0x70, // Digit 1 (0x55-0x59)
            0xF0, 0x10, 0xF0, 0x80, 0xF0, // Digit 2 (0x5A-0x5E)
            0xF0, 0x10, 0xF0, 0x10, 0xF0, // Digit 3 (0x5F-0x63)
            0x90, 0x90, 0xF0, 0x10, 0x10, // Digit 4 (0x64-0x68)
            0xF0, 0x80, 0xF0, 0x10, 0xF0, // Digit 5 (0x69-0x6D)
            0xF0, 0x80, 0xF0, 0x90, 0xF0, // Digit 6 (0x6E-0x72)
            0xF0, 0x10, 0x20, 0x40, 0x40, // Digit 7 (0x73-0x77)
            0xF0, 0x90, 0xF0, 0x90, 0xF0, // Digit 8 (0x78-0x7C)
            0xF0, 0x90, 0xF0, 0x10, 0xF0, // Digit 9 (0x7D-0x81)
        ];

        chip8.memory[START_OF_FONT..START_OF_FONT + font_data.len()].copy_from_slice(&font_data);

        chip8
    }

    pub fn reset(&mut self) {
        self.memory[0x200..MEM_MAX].fill(0);
        self.stack.clear();
        self.frame_buffer.fill(0);
        self.index_reg = 0;
        self.program_counter = 0x200;
        self.keys.fill(0);
        self.delay_timer = 0;
        self.sound_timer = 0;
    }

    pub fn get_width(&self) -> usize {
        FRAME_BUF_WIDTH
    }

    pub fn get_height(&self) -> usize {
        FRAME_BUF_HEIGHT
    }
    // true if collision otherwise false
    fn xor_pixel(&mut self, x: usize, y: usize, val: u8) -> bool {
        // 64 x 32: index = (row * width) + column = (y * FRAME_BUF_WIDTH) + x
        let wrapped_x = x.rem_euclid(FRAME_BUF_WIDTH);
        let wrapped_y = y.rem_euclid(FRAME_BUF_HEIGHT);
        let index: usize = (wrapped_y * FRAME_BUF_WIDTH) + wrapped_x;
        let start_val = self.frame_buffer[index];

        self.frame_buffer[index] ^= val;
        if start_val == 1 && self.frame_buffer[index] == 0 {
            return true;
        }
        false
    }

    pub fn handle_opcode(&mut self, opcode: u16) {
        match opcode & 0xF000 {
            0x0000 => self.sys_addr(opcode),
            0x1000 => self.jp_addr(opcode),
            0x2000 => self.call_addr(opcode),
            0x3000 => self.skip_if_equal(opcode),
            0x4000 => self.skip_if_not_equal(opcode),
            0x5000 => self.skip_if_reg_equal(opcode),
            0x9000 => self.skip_if_reg_not_equal(opcode),
            0x6000 => self.set_reg(opcode),
            0x7000 => self.add_reg(opcode),
            0x8000 => self.reg_ops(opcode),
            0xA000 => self.set_index(opcode),
            0xB000 => self.jp_offset(opcode),
            0xC000 => self.rand(opcode),
            0xD000 => self.display_sprite(opcode),
            0xE000 => self.skip_if_key_state(opcode),
            0xF000 => self.misc(opcode),
            _ => unhandled_opcode_panic(opcode),
        }
    }

    fn execute_instructions(&mut self) {
        let opcode = (self.memory[self.program_counter] as u16) << 8
            | self.memory[self.program_counter + 1] as u16;
        self.program_counter += 2;
        self.handle_opcode(opcode);
    }

    pub fn tick(&mut self) {
        self.execute_instructions();
        if self.delay_timer > 0 {
            self.delay_timer -= 1;
        }

        //    if self.sound_counter > 0 {
        //        self.sound_counter -= 1;
        //    }
        //}
    }
    // 0x0000
    fn sys_addr(&mut self, opcode: u16) {
        match opcode {
            0x00E0 => {
                self.frame_buffer.fill(0);
                update_canvas();
            }
            0x00EE => self.program_counter = self.stack.pop().unwrap(),
            _ => unhandled_opcode_panic(opcode),
        }
    }
    // 0x1000
    fn jp_addr(&mut self, opcode: u16) {
        self.program_counter = get_nnn(opcode) as usize;
    }
    // 0x2000
    fn call_addr(&mut self, opcode: u16) {
        self.stack.push(self.program_counter);
        self.program_counter = get_nnn(opcode) as usize;
    }
    // 0x3000
    fn skip_if_equal(&mut self, opcode: u16) {
        if self.reg[get_x(opcode)] == get_kk(opcode) {
            self.program_counter += 2;
        }
    }
    // 0x4000
    fn skip_if_not_equal(&mut self, opcode: u16) {
        if self.reg[get_x(opcode)] != get_kk(opcode) {
            self.program_counter += 2;
        }
    }
    // 0x5000
    fn skip_if_reg_equal(&mut self, opcode: u16) {
        if self.reg[get_x(opcode)] == self.reg[get_y(opcode)] {
            self.program_counter += 2;
        }
    }
    // 0x9000
    fn skip_if_reg_not_equal(&mut self, opcode: u16) {
        if self.reg[get_x(opcode)] != self.reg[get_y(opcode)] {
            self.program_counter += 2;
        }
    }
    // 0x6000
    fn set_reg(&mut self, opcode: u16) {
        self.reg[get_x(opcode)] = get_kk(opcode);
    }
    // 0x7000
    fn add_reg(&mut self, opcode: u16) {
        let x = get_x(opcode);
        self.reg[x] = self.reg[x].wrapping_add(get_kk(opcode));
    }
    // 0x8000
    fn reg_ops(&mut self, opcode: u16) {
        let x = get_x(opcode);
        let y = get_y(opcode);
        let op = opcode & 0xF;

        match op {
            0x0 => self.reg[x] = self.reg[y],
            0x1 => self.reg[x] |= self.reg[y],
            0x2 => self.reg[x] &= self.reg[y],
            0x3 => self.reg[x] ^= self.reg[y],
            0x4 => {
                let (result, carry) = self.reg[x].overflowing_add(self.reg[y]);
                self.reg[x] = result;
                self.reg[0xF] = carry as u8;
            }
            0x5 => {
                let (result, borrow) = self.reg[x].overflowing_sub(self.reg[y]);
                self.reg[x] = result;
                self.reg[0xF] = !borrow as u8;
            }
            0x6 => {
                self.reg[0xF] = (self.reg[x] & 1 == 1) as u8;
                self.reg[x] >>= 1;
            }
            0x7 => {
                let (result, borrow) = self.reg[y].overflowing_sub(self.reg[x]);
                self.reg[x] = result;
                self.reg[0xF] = !borrow as u8;
            }
            0xE => {
                // 0b1000 0000
                self.reg[0xF] = self.reg[x] >> 7;
                self.reg[x] <<= 1;
            }
            _ => unhandled_opcode_panic(opcode),
        }
    }
    // 0xA000
    fn set_index(&mut self, opcode: u16) {
        self.index_reg = get_nnn(opcode);
    }
    // 0xB000
    fn jp_offset(&mut self, opcode: u16) {
        self.program_counter = get_nnn(opcode) as usize + self.reg[0] as usize;
    }
    // 0xC000
    fn rand(&mut self, opcode: u16) {
        self.reg[get_x(opcode)] = self.rand_rng.gen::<u8>() & get_kk(opcode);
    }
    // 0xD000
    fn display_sprite(&mut self, opcode: u16) {
        let bytes = opcode & 0xF;
        let (reg_x, reg_y) = (self.reg[get_x(opcode)], self.reg[get_y(opcode)]);

        // Initialize collision flag to 0
        self.reg[0xF] = 0;

        // Each byte represents a row of 8 pixels
        // Outer loop: rows (y-direction)
        // Inner loop: columns within each row (x-direction)
        let mut pixel_y = reg_y;

        for mem_index in (self.index_reg as usize)..(self.index_reg + bytes) as usize {
            let mut pixel_x = reg_x;

            for i in 0..8 {
                // Extract bit from left to right (MSB to LSB)
                let bit = (self.memory[mem_index] >> (7 - i)) & 1;

                if self.xor_pixel(pixel_x as usize, pixel_y as usize, bit) {
                    self.reg[0xF] = 1;
                }

                pixel_x += 1;
            }
            pixel_y += 1;
        }
        update_canvas();
    }
    // 0xE000
    fn skip_if_key_state(&mut self, opcode: u16) {
        let x = get_x(opcode);
        // pressed
        if opcode & 0xFF == 0x9E {
            if self.keys[self.reg[x] as usize] == 1 {
                self.program_counter += 2;
            }
        }
        // not pressed
        else if opcode & 0xFF == 0xA1 {
            if self.keys[self.reg[x] as usize] == 0 {
                self.program_counter += 2;
            }
        } else {
            unhandled_opcode_panic(opcode);
        }
    }
    // 0xF000
    fn misc(&mut self, opcode: u16) {
        let x = get_x(opcode);
        let op = opcode & 0xFF;

        match op {
            0x07 => self.reg[x] = self.delay_timer,
            0x0A => wait_for_keypress(x),
            0x15 => self.delay_timer = self.reg[x],
            0x18 => self.sound_timer = self.reg[x],
            0x1E => self.index_reg += self.reg[x] as u16,
            0x29 => self.index_reg = START_OF_FONT as u16 + (self.reg[x] as u16 * 5),
            0x33 => {
                self.memory[self.index_reg as usize] = self.reg[x] / 100;
                self.memory[self.index_reg as usize + 1] = (self.reg[x] / 10) % 10;
                self.memory[self.index_reg as usize + 2] = self.reg[x] % 10;
            }
            0x55 => {
                self.memory[(self.index_reg as usize)..=(self.index_reg as usize + x)]
                    .copy_from_slice(&self.reg[0..=x]);
                self.index_reg += (x + 1) as u16;
            }
            0x65 => {
                self.reg[0..=x].copy_from_slice(
                    &self.memory[(self.index_reg as usize)..=(self.index_reg as usize + x)],
                );
                self.index_reg += (x + 1) as u16;
            }
            _ => unhandled_opcode_panic(opcode),
        }
    }

    pub fn get_screen(&self) -> *const Pixel {
        self.frame_buffer.as_ptr()
    }

    pub fn get_memory(&self) -> *const u8 {
        self.memory.as_ptr()
    }

    pub fn get_registers(&self) -> *const u8 {
        self.reg.as_ptr()
    }

    pub fn get_keys(&self) -> *const u8 {
        self.reg.as_ptr()
    }
}

// This is like the `main` function, except for JavaScript.
#[wasm_bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    // This provides better error messages in debug mode.
    // It's disabled in release mode so it doesn't bloat up the file size.
    #[cfg(debug_assertions)]
    console_error_panic_hook::set_once();

    // Your code goes here!
    console::log_1(&JsValue::from_str("Hello world!"));

    Ok(())
}

#[cfg(test)]
mod tests;
