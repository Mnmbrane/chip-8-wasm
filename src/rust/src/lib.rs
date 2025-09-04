use core::panic;
use rand::{rngs::SmallRng, Rng, SeedableRng};

// https://www.cs.columbia.edu/~sedwards/classes/2016/4840-spring/designs/Chip8.pdf
use wasm_bindgen::prelude::*;
use web_sys::console;

const FRAME_BUF_WIDTH: usize = 64;
const FRAME_BUF_HEIGHT: usize = 32;

const MEM_MAX: usize = 0x1000;
const REG_MAX: usize = 16;
const FRAME_BUF_MAX: usize = FRAME_BUF_HEIGHT * FRAME_BUF_WIDTH;
const NUM_OF_KEYS: usize = 16;

type Pixel = u8;

fn unhandled_opcode_panic(opcode: u16) {
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

    stack: Vec<u16>,

    // 64x32 frame buffer
    frame_buffer: [Pixel; FRAME_BUF_MAX],

    program_counter: u16,

    rand_rng: SmallRng,

    keys: [bool; NUM_OF_KEYS],
}

#[wasm_bindgen]
impl Chip8 {
    pub fn new() -> Self {
        Self {
            memory: [0u8; MEM_MAX],

            reg: [0u8; REG_MAX],
            index_reg: 0,

            stack: Vec::new(),

            frame_buffer: [0; FRAME_BUF_MAX],

            program_counter: 0,

            rand_rng: SmallRng::from_entropy(),

            keys: [false; NUM_OF_KEYS],
        }
    }

    pub fn get_width(&self) -> usize {
        FRAME_BUF_WIDTH
    }

    pub fn get_height(&self) -> usize {
        FRAME_BUF_HEIGHT
    }
    pub fn get_pixel(&self, x: usize, y: usize) -> u8 {
        self.frame_buffer[(y * FRAME_BUF_WIDTH as usize) + x]
    }

    pub fn set_key_pressed(&mut self, key_val: usize) {
        self.keys[key_val] = true;
    }

    pub fn set_key_unpressed(&mut self, key_val: usize) {
        self.keys[key_val] = false;
    }

    // true if collision otherwise false
    pub fn xor_pixel(&mut self, x: usize, y: usize, val: u8) -> bool {
        // 64 x 32
        let index: usize = (y * FRAME_BUF_WIDTH as usize) + x;
        let start_val = self.frame_buffer[index];

        if index < FRAME_BUF_MAX {
            self.frame_buffer[index] ^= val;
            if start_val == 1 && self.frame_buffer[index] == 0 {
                return true;
            }
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
            0xE000 => self.skip_if_key_pressed(opcode),
            0xF000 => self.misc(opcode),
            _ => unhandled_opcode_panic(opcode),
        }
    }

    pub fn execute_instructions(&self) {
        // do nothing
    }

    pub fn tick(&mut self) {
        self.execute_instructions();
        //delay_and_sound_timer.tick() => {
        //    if self.delay_counter > 0 {
        //        self.delay_counter -= 1;
        //    }

        //    if self.sound_counter > 0 {
        //        self.sound_counter -= 1;
        //    }
        //}
    }
    // 0x0000
    pub fn sys_addr(&mut self, opcode: u16) {
        match opcode {
            0x00E0 => self.frame_buffer.fill(0),
            0x00EE => self.program_counter = self.stack.pop().unwrap(),
            _ => unhandled_opcode_panic(opcode),
        }
    }
    // 0x1000
    pub fn jp_addr(&mut self, opcode: u16) {
        self.program_counter = get_nnn(opcode);
    }
    // 0x2000
    pub fn call_addr(&mut self, opcode: u16) {
        self.stack.push(self.program_counter);
        self.program_counter = get_nnn(opcode);
    }
    // 0x3000
    pub fn skip_if_equal(&mut self, opcode: u16) {
        if self.reg[get_x(opcode)] == get_kk(opcode) {
            self.program_counter += 2;
        }
    }
    // 0x4000
    pub fn skip_if_not_equal(&mut self, opcode: u16) {
        if self.reg[get_x(opcode)] != get_kk(opcode) {
            self.program_counter += 2;
        }
    }
    // 0x5000
    pub fn skip_if_reg_equal(&mut self, opcode: u16) {
        if self.reg[get_x(opcode)] == self.reg[get_y(opcode)] {
            self.program_counter += 2;
        }
    }
    // 0x9000
    pub fn skip_if_reg_not_equal(&mut self, opcode: u16) {
        if self.reg[get_x(opcode)] != self.reg[get_y(opcode)] {
            self.program_counter += 2;
        }
    }
    // 0x6000
    pub fn set_reg(&mut self, opcode: u16) {
        self.reg[get_x(opcode)] = get_kk(opcode);
    }
    // 0x7000
    pub fn add_reg(&mut self, opcode: u16) {
        let x = get_x(opcode);
        self.reg[x] = self.reg[x].wrapping_add(get_kk(opcode));
    }
    // 0x8000
    pub fn reg_ops(&mut self, opcode: u16) {
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
    pub fn set_index(&mut self, opcode: u16) {
        self.index_reg = get_nnn(opcode);
    }
    // 0xB000
    pub fn jp_offset(&mut self, opcode: u16) {
        self.program_counter = get_nnn(opcode) + self.reg[0] as u16;
    }
    // 0xC000
    pub fn rand(&mut self, opcode: u16) {
        self.reg[get_x(opcode)] = self.rand_rng.gen::<u8>() & get_kk(opcode);
    }
    // 0xD000
    pub fn display_sprite(&mut self, opcode: u16) {
        let bytes = opcode & 0xF;
        let (x, y) = (get_x(opcode), get_y(opcode));

        // Initialize collision flag to 0
        self.reg[0xF] = 0;

        // (x, y) starting point (0, 0) as an example
        // we work our way backwards for a byte so we decrement
        // y from y+8..y+0.
        // incrementing to the next sprite data means to
        // increment x
        let mut pixel_x = x;
        let mut pixel_y;

        for mem_index in (self.index_reg as usize)..(self.index_reg + bytes) as usize {
            pixel_y = y;
            for i in 0..8 {
                // we start at the least significant bit
                let bit = (self.memory[mem_index] >> (7 - i)) & 1;

                if self.xor_pixel(pixel_x, pixel_y, bit) {
                    self.reg[0xF] = 1;
                }

                pixel_y += 1;
            }
            pixel_x += 1;
        }
    }
    // 0xE000
    pub fn skip_if_key_pressed(&self, _opcode: u16) {
        todo!()
    }
    // 0xF000
    pub fn misc(&self, _opcode: u16) {
        todo!()
    }

    pub fn get_screen(&self) -> *const Pixel {
        self.frame_buffer.as_ptr()
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
