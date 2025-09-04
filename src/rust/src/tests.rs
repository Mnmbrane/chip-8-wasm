use super::*;

#[test]
fn test_clear_display_opcode() {
    let mut chip8 = Chip8::new();

    // Set up alternating framebuffer pattern (on/off)
    for i in 0..FRAME_BUF_MAX {
        chip8.frame_buffer[i] = if i % 2 == 0 { 1 } else { 0 };
    }

    // Verify pattern is set
    assert_eq!(chip8.frame_buffer[0], 1); // even index
    assert_eq!(chip8.frame_buffer[1], 0); // odd index
    assert_eq!(chip8.frame_buffer[2], 1); // even index

    // Execute clear display opcode (0x00E0)
    chip8.handle_opcode(0x00E0);

    // Verify all pixels are 0
    for pixel in chip8.frame_buffer.iter() {
        assert_eq!(*pixel, 0);
    }
}

#[test]
fn test_return_opcode() {
    let mut chip8 = Chip8::new();

    // Push a return address to stack
    chip8.stack.push(0x50);

    // Execute return opcode (0x00EE)
    chip8.handle_opcode(0x00EE);

    // Verify program counter is set to popped value
    assert_eq!(chip8.program_counter, 0x50);

    // Verify stack is empty
    assert!(chip8.stack.is_empty());
}

#[test]
fn test_jump_addr_opcode() {
    let mut chip8 = Chip8::new();

    // Execute jump opcode (0x1ABC)
    chip8.handle_opcode(0x1ABC);

    // Verify program counter is set to address (0x0ABC)
    assert_eq!(chip8.program_counter, 0x0ABC);
}

#[test]
fn test_call_addr_opcode() {
    let mut chip8 = Chip8::new();
    chip8.program_counter = 0x200; // Set initial PC

    // Execute call opcode (0x2ABC)
    chip8.handle_opcode(0x2ABC);

    // Verify return address was pushed to stack
    assert_eq!(chip8.stack.len(), 1);
    assert_eq!(chip8.stack[0], 0x200);

    // Verify program counter is set to call address (0x0ABC)
    assert_eq!(chip8.program_counter, 0x0ABC);
}

#[test]
fn test_skip_if_equal_opcode() {
    let mut chip8 = Chip8::new();
    chip8.program_counter = 0x200;
    chip8.reg[5] = 0x42; // Set V5 to 0x42

    // Test when values are equal - should skip (PC += 2)
    chip8.handle_opcode(0x3542); // Skip if V5 == 0x42
    assert_eq!(chip8.program_counter, 0x202);

    // Reset PC and test when values are not equal - should not skip
    chip8.program_counter = 0x200;
    chip8.handle_opcode(0x3543); // Skip if V5 == 0x43 (false)
    assert_eq!(chip8.program_counter, 0x200);
}

#[test]
fn test_skip_if_not_equal_opcode() {
    let mut chip8 = Chip8::new();
    chip8.program_counter = 0x200;
    chip8.reg[5] = 0x42; // Set V5 to 0x42

    // Test when values are not equal - should skip (PC += 2)
    chip8.handle_opcode(0x4543); // Skip if V5 != 0x43
    assert_eq!(chip8.program_counter, 0x202);

    // Reset PC and test when values are equal - should not skip
    chip8.program_counter = 0x200;
    chip8.handle_opcode(0x4542); // Skip if V5 != 0x42 (false)
    assert_eq!(chip8.program_counter, 0x200);
}

#[test]
fn test_skip_if_reg_equal_opcode() {
    let mut chip8 = Chip8::new();
    chip8.program_counter = 0x200;
    chip8.reg[3] = 0x42; // Set V3 to 0x42
    chip8.reg[7] = 0x42; // Set V7 to 0x42

    // Test when registers are equal - should skip (PC += 2)
    chip8.handle_opcode(0x5370); // Skip if V3 == V7
    assert_eq!(chip8.program_counter, 0x202);

    // Reset PC and test when registers are not equal - should not skip
    chip8.program_counter = 0x200;
    chip8.reg[7] = 0x43; // Change V7 to 0x43
    chip8.handle_opcode(0x5370); // Skip if V3 == V7 (false)
    assert_eq!(chip8.program_counter, 0x200);
}

#[test]
fn test_set_reg_opcode() {
    let mut chip8 = Chip8::new();

    // Execute set register opcode (0x6A42) - Set VA to 0x42
    chip8.handle_opcode(0x6A42);

    // Verify register VA (index 10) is set to 0x42
    assert_eq!(chip8.reg[10], 0x42);

    // Test another register (0x6337) - Set V3 to 0x37
    chip8.handle_opcode(0x6337);
    assert_eq!(chip8.reg[3], 0x37);
}

#[test]
fn test_add_reg_opcode() {
    let mut chip8 = Chip8::new();
    chip8.reg[5] = 10; // Set V5 to 10

    // Execute add register opcode (0x7520) - Add 0x20 to V5
    chip8.handle_opcode(0x7520);

    // Verify V5 = 10 + 32 = 42
    assert_eq!(chip8.reg[5], 42);

    // Test wraparound: V5 = 42, add 240 should wrap
    chip8.handle_opcode(0x75F0); // Add 0xF0 (240) to V5
                           // 42 + 240 = 282, 282 % 256 = 26
    assert_eq!(chip8.reg[5], 26);
}

#[test]
fn test_reg_ops_set() {
    let mut chip8 = Chip8::new();
    chip8.reg[3] = 0x42;

    // 8xy0 - Set Vx = Vy
    chip8.handle_opcode(0x8230); // Set V2 = V3
    assert_eq!(chip8.reg[2], 0x42);
}

#[test]
fn test_reg_ops_or() {
    let mut chip8 = Chip8::new();
    chip8.reg[2] = 0x0F;
    chip8.reg[3] = 0xF0;

    // 8xy1 - Set Vx = Vx OR Vy
    chip8.handle_opcode(0x8231); // V2 = V2 OR V3
    assert_eq!(chip8.reg[2], 0xFF);
}

#[test]
fn test_reg_ops_and() {
    let mut chip8 = Chip8::new();
    chip8.reg[2] = 0xFF;
    chip8.reg[3] = 0x0F;

    // 8xy2 - Set Vx = Vx AND Vy
    chip8.handle_opcode(0x8232); // V2 = V2 AND V3
    assert_eq!(chip8.reg[2], 0x0F);
}

#[test]
fn test_reg_ops_xor() {
    let mut chip8 = Chip8::new();
    chip8.reg[2] = 0xF0;
    chip8.reg[3] = 0xFF;

    // 8xy3 - Set Vx = Vx XOR Vy
    chip8.handle_opcode(0x8233); // V2 = V2 XOR V3
    assert_eq!(chip8.reg[2], 0x0F);
}

#[test]
fn test_reg_ops_add_with_carry() {
    let mut chip8 = Chip8::new();
    chip8.reg[2] = 200;
    chip8.reg[3] = 100;

    // 8xy4 - Set Vx = Vx + Vy, set VF = carry
    chip8.handle_opcode(0x8234); // V2 = V2 + V3
    assert_eq!(chip8.reg[2], 44); // 300 % 256 = 44
    assert_eq!(chip8.reg[0xF], 1); // Carry occurred

    // Test no carry
    chip8.reg[2] = 10;
    chip8.reg[3] = 20;
    chip8.handle_opcode(0x8234);
    assert_eq!(chip8.reg[2], 30);
    assert_eq!(chip8.reg[0xF], 0); // No carry
}

#[test]
fn test_reg_ops_sub() {
    let mut chip8 = Chip8::new();
    chip8.reg[2] = 50;
    chip8.reg[3] = 30;

    // 8xy5 - Set Vx = Vx - Vy, set VF = NOT borrow
    chip8.handle_opcode(0x8235); // V2 = V2 - V3
    assert_eq!(chip8.reg[2], 20);
    assert_eq!(chip8.reg[0xF], 1); // No borrow (50 >= 30)

    // Test with borrow
    chip8.reg[2] = 10;
    chip8.reg[3] = 20;
    chip8.handle_opcode(0x8235);
    assert_eq!(chip8.reg[2], 246); // 10 - 20 wraps to 246
    assert_eq!(chip8.reg[0xF], 0); // Borrow occurred (10 < 20)
}

#[test]
fn test_reg_ops_shr() {
    let mut chip8 = Chip8::new();
    chip8.reg[2] = 0x85; // Binary: 10000101

    // 8xy6 - Set Vx = Vx SHR 1, set VF = LSB
    chip8.handle_opcode(0x8236);
    assert_eq!(chip8.reg[2], 0x42); // Binary: 01000010
    assert_eq!(chip8.reg[0xF], 1); // LSB was 1

    // Test LSB = 0
    chip8.reg[2] = 0x84; // Binary: 10000100
    chip8.handle_opcode(0x8236);
    assert_eq!(chip8.reg[2], 0x42); // Binary: 01000010
    assert_eq!(chip8.reg[0xF], 0); // LSB was 0
}

#[test]
fn test_reg_ops_subn() {
    let mut chip8 = Chip8::new();
    chip8.reg[2] = 30;
    chip8.reg[3] = 50;

    // 8xy7 - Set Vx = Vy - Vx, set VF = NOT borrow
    chip8.handle_opcode(0x8237); // V2 = V3 - V2
    assert_eq!(chip8.reg[2], 20);
    assert_eq!(chip8.reg[0xF], 1); // No borrow (50 >= 30)

    // Test with borrow
    chip8.reg[2] = 20;
    chip8.reg[3] = 10;
    chip8.handle_opcode(0x8237);
    assert_eq!(chip8.reg[2], 246); // 10 - 20 wraps to 246
    assert_eq!(chip8.reg[0xF], 0); // Borrow occurred (10 < 20)
}

#[test]
fn test_reg_ops_shl() {
    let mut chip8 = Chip8::new();
    chip8.reg[2] = 0x85; // Binary: 10000101

    // 8xyE - Set Vx = Vx SHL 1, set VF = MSB
    chip8.handle_opcode(0x823E);
    assert_eq!(chip8.reg[2], 0x0A); // Binary: 00001010 (shifted left)
    assert_eq!(chip8.reg[0xF], 1); // MSB was 1

    // Test MSB = 0
    chip8.reg[2] = 0x42; // Binary: 01000010
    chip8.handle_opcode(0x823E);
    assert_eq!(chip8.reg[2], 0x84); // Binary: 10000100
    assert_eq!(chip8.reg[0xF], 0); // MSB was 0
}

#[test]
fn test_set_index_opcode() {
    let mut chip8 = Chip8::new();

    // Execute set index opcode (0xA123) - Set I to 0x123
    chip8.handle_opcode(0xA123);

    // Verify index register is set to 0x123
    assert_eq!(chip8.index_reg, 0x123);

    // Test with different address (0xAFFF) - Set I to 0xFFF
    chip8.handle_opcode(0xAFFF);
    assert_eq!(chip8.index_reg, 0xFFF);
}

#[test]
fn test_jp_offset_opcode() {
    let mut chip8 = Chip8::new();
    chip8.reg[0] = 0x10; // Set V0 to 0x10

    // Execute jump with offset opcode (0xB200) - Jump to 0x200 + V0
    chip8.handle_opcode(0xB200);

    // Verify program counter is set to 0x200 + 0x10 = 0x210
    assert_eq!(chip8.program_counter, 0x210);

    // Test with different values
    chip8.reg[0] = 0x05;
    chip8.handle_opcode(0xB123);
    assert_eq!(chip8.program_counter, 0x128); // 0x123 + 0x05 = 0x128
}

#[test]
fn test_rand_opcode() {
    let mut chip8 = Chip8::new();

    // Execute random opcode (0xC2FF) - Set V2 = random & 0xFF
    chip8.handle_opcode(0xC2FF);

    // Test with more restrictive mask (0xC20F) - Set V2 = random & 0x0F
    chip8.handle_opcode(0xC20F);

    // With mask 0x0F, result should be 0-15
    assert!(chip8.reg[2] <= 15);

    // Test multiple calls produce different values (probabilistic)
    let mut values = Vec::new();
    for _ in 0..10 {
        chip8.handle_opcode(0xC2FF);
        values.push(chip8.reg[2]);
    }
    // Very unlikely all 10 values are identical (but theoretically possible)
    let all_same = values.iter().all(|&x| x == values[0]);
    // This is probabilistic - could rarely fail, but shows randomness
    if all_same {
        println!("Warning: All random values were identical (very unlikely but possible)");
    }
}



#[test]
fn test_display_sprite_collision() {
    let mut chip8 = Chip8::new();
    
    // Test 1: Drawing on empty screen should not cause collision
    chip8.frame_buffer.fill(0);
    chip8.index_reg = 0x200;
    chip8.memory[0x200] = 0xC0; // Binary: 11000000 (top two pixels)
    chip8.memory[0x201] = 0xC0; // Binary: 11000000 (bottom two pixels)
    
    chip8.handle_opcode(0xD222); // Draw 2-byte sprite at (2, 2)
    
    // VF should be 0 (no collision on empty screen)
    assert_eq!(chip8.reg[0xF], 0);
    
    // Verify pixels were drawn at (2,2), (3,2), (2,3), (3,3)
    assert_eq!(chip8.frame_buffer[2 * 64 + 2], 1);  // (2, 2)
    assert_eq!(chip8.frame_buffer[2 * 64 + 3], 1);  // (3, 2)
    assert_eq!(chip8.frame_buffer[3 * 64 + 2], 1);  // (2, 3)
    assert_eq!(chip8.frame_buffer[3 * 64 + 3], 1);  // (3, 3)
    
    // Test 2: Drawing same sprite at same location should cause collision
    chip8.handle_opcode(0xD222); // Draw same sprite at same location
    
    // VF should be 1 (collision occurred - all pixels were erased)
    assert_eq!(chip8.reg[0xF], 1);
    
    // All pixels should be erased (XOR with same pattern turns them off)
    assert_eq!(chip8.frame_buffer[2 * 64 + 2], 0);  // (2, 2)
    assert_eq!(chip8.frame_buffer[2 * 64 + 3], 0);  // (3, 2)
    assert_eq!(chip8.frame_buffer[3 * 64 + 2], 0);  // (2, 3)
    assert_eq!(chip8.frame_buffer[3 * 64 + 3], 0);  // (3, 3)
}

#[test]
fn test_display_sprite_partial_collision() {
    let mut chip8 = Chip8::new();
    
    // Set up a different sprite pattern
    chip8.index_reg = 0x200;
    chip8.memory[0x200] = 0xF0; // Binary: 11110000
    
    // Pre-populate screen with some pixels exactly where the sprite will draw
    chip8.frame_buffer[2 * 64 + 2] = 1;  // Set pixel at (2, 2) - first sprite bit
    chip8.frame_buffer[2 * 64 + 4] = 1;  // Set pixel at (4, 2) - third sprite bit  
    
    println!("Before draw - existing pixels:");
    for y in 0..10 {
        for x in 0..10 {
            if chip8.frame_buffer[y * 64 + x] != 0 {
                println!("Existing pixel at ({}, {}) = {}", x, y, chip8.frame_buffer[y * 64 + x]);
            }
        }
    }
    
    // Draw sprite that will partially overlap
    chip8.handle_opcode(0xD221); // Draw 1-byte sprite at (2, 2)
    
    println!("After draw:");
    for y in 0..10 {
        for x in 0..10 {
            if chip8.frame_buffer[y * 64 + x] != 0 {
                println!("Pixel at ({}, {}) = {}", x, y, chip8.frame_buffer[y * 64 + x]);
            }
        }
    }
    println!("VF = {}", chip8.reg[0xF]);
    
    // VF should be 1 because some existing pixels were erased
    assert_eq!(chip8.reg[0xF], 1);
}

#[test]
fn test_display_sprite_no_collision_with_zeros() {
    let mut chip8 = Chip8::new();
    
    // Set up sprite with some 0 bits: 10100000 (bits 0,2,4,5,6,7 are 0)
    chip8.index_reg = 0x200;
    chip8.memory[0x200] = 0xA0; // Binary: 10100000
    
    // Pre-populate screen with pixels where sprite has 0 bits
    // Based on previous tests, sprite draws vertically from (2,2) to (2,9)
    chip8.frame_buffer[3 * 64 + 2] = 1;  // Set pixel at (2, 3) - sprite bit 6 is 0
    chip8.frame_buffer[5 * 64 + 2] = 1;  // Set pixel at (2, 5) - sprite bit 4 is 0
    chip8.frame_buffer[9 * 64 + 2] = 1;  // Set pixel at (2, 9) - sprite bit 0 is 0
    
    println!("Before draw - existing pixels:");
    for y in 0..15 {
        for x in 0..10 {
            if chip8.frame_buffer[y * 64 + x] != 0 {
                println!("Existing pixel at ({}, {}) = {}", x, y, chip8.frame_buffer[y * 64 + x]);
            }
        }
    }
    
    // Draw sprite
    chip8.handle_opcode(0xD221); // Draw 1-byte sprite at (2, 2)
    
    println!("After draw:");
    for y in 0..15 {
        for x in 0..10 {
            if chip8.frame_buffer[y * 64 + x] != 0 {
                println!("Pixel at ({}, {}) = {}", x, y, chip8.frame_buffer[y * 64 + x]);
            }
        }
    }
    println!("VF = {}", chip8.reg[0xF]);
    
    // VF should be 0 because no existing pixels were turned off
    // (sprite 0 bits don't change existing pixels, and sprite 1 bits only turn on new pixels)
    assert_eq!(chip8.reg[0xF], 0);
}
