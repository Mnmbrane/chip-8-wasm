<div align="center">

  <h1><code>chip8 emulator</code></h1>

  <strong>A CHIP-8 emulator built with Rust and WebAssembly, featuring a web-based interface for playing classic CHIP-8 games.</strong>

  <p>
    <a href="https://travis-ci.org/rustwasm/create-wasm-app"><img src="https://img.shields.io/travis/rustwasm/create-wasm-app.svg?style=flat-square" alt="Build Status" /></a>
  </p>

  <h3>
    <a href="#usage">Usage</a>
    <span> | </span>
    <a href="https://discordapp.com/channels/442252698964721669/443151097398296587">Chat</a>
  </h3>

  <sub>Built with 🦀🕸 by <a href="https://rustwasm.github.io/">The Rust and WebAssembly Working Group</a></sub>
</div>

## About

This is a CHIP-8 emulator implemented in Rust and compiled to WebAssembly for web browsers. CHIP-8 is an interpreted programming language that was used on some microcomputers and calculators from the 1970s. This emulator allows you to play classic CHIP-8 games directly in your web browser.

### Features
- Full CHIP-8 instruction set implementation
- Web-based interface with keyboard controls
- Sound support for beep instructions
- Real-time game rendering
- Built with Rust for performance and compiled to WebAssembly

## 📦 Dependencies

This project requires both Rust and Node.js dependencies:

### Rust Dependencies
- **Rust toolchain**: Required for compiling WebAssembly modules
- **wasm-pack**: Tool for building Rust-generated WebAssembly packages
- Rust dependencies are managed via `Cargo.toml` in the WebAssembly package

### npm Dependencies
- **webpack**: Module bundler for JavaScript applications
- **webpack-cli**: Command line interface for webpack
- **webpack-dev-server**: Development server with live reloading
- All npm dependencies are listed in `package.json`

## 🚴 Usage

### Quick Start

1. Clone the repository
2. Install dependencies and start the development server:

### Development Commands

```bash
# Install npm dependencies
npm install

# Start development server
npm run start

# Build for production
npm run build
```

## 🔋 Batteries Included

- `.gitignore`: ignores `node_modules`
- `LICENSE-APACHE` and `LICENSE-MIT`: most Rust projects are licensed this way, so these are included for you
- `README.md`: the file you are reading now!
- `index.html`: a bare bones html document that includes the webpack bundle
- `index.js`: example js file with a comment showing how to import and use a wasm pkg
- `package.json` and `package-lock.json`:
  - pulls in devDependencies for using webpack:
      - [`webpack`](https://www.npmjs.com/package/webpack)
      - [`webpack-cli`](https://www.npmjs.com/package/webpack-cli)
      - [`webpack-dev-server`](https://www.npmjs.com/package/webpack-dev-server)
  - defines a `start` script to run `webpack-dev-server`
- `webpack.config.js`: configuration file for bundling your js with webpack

## License

Licensed under either of

* Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
* MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally
submitted for inclusion in the work by you, as defined in the Apache-2.0
license, shall be dual licensed as above, without any additional terms or
conditions.
