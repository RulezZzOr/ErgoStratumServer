# Node Stratum Pool

> A high-performance, modular, and modern Stratum mining pool server written in Node.js.

This project is a modernized and refactored version of the original `node-stratum-pool`. The entire codebase has been updated to use modern JavaScript (ES6+), with a focus on clarity, modularity, and maintainability. It serves as a solid foundation for building a custom cryptocurrency mining pool.

---

## Key Features

*   **Modern JavaScript:** The entire codebase is rewritten in ES6, using `class`, `const`/`let`, and other modern features for improved readability and safety.
*   **Modular Architecture:** The code is logically separated into modules for handling blocks, transactions, peer communication, and cryptographic functions.
*   **Pure JS Compatibility:** This version has been adapted to use pure JavaScript implementations for hashing algorithms, removing the need for system-level C++ compilers (`node-gyp`). This ensures maximum compatibility but comes at the cost of performance compared to native C++ addons.
*   **Promise-Based Flow:** Utilizes `async/await` for cleaner asynchronous code flow.
*   **Extensible Algorithm Support:** Algorithm-specific properties are centralized, making it straightforward to add or modify cryptocurrency algorithms.

## Supported Algorithms

The pool supports a variety of hashing algorithms through the `multi-hashing` library, in addition to built-in support for Scrypt and SHA256d. Supported algorithms include:

*   scrypt
*   sha256d
*   scrypt-n
*   x11
*   x13
*   x15
*   nist5
*   neoscrypt
*   groestl
*   blake
*   keccak

## Prerequisites

*   **Node.js:** Version `12.0.0` or higher.
*   **NPM:** Comes bundled with Node.js.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd node-stratum-pool
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Configuration

All pool configurations are managed in the `config.json` file. Before running the pool, you must create and customize this file to match your setup.

1.  **Coin Configuration:** Set up the coin daemon's RPC connection, block reward information, and algorithm.
2.  **Pool Ports:** Define the port and difficulty for each Stratum port you want to open.
3.  **General Settings:** Configure payout thresholds, pool fees, and other operational parameters.

## Running the Pool

Once your `config.json` is set up, you can start the pool server by running the main initialization script:

```bash
node init.js
```

The server will start, connect to the coin daemon, and begin listening for miners on the configured ports.

## License

This program is free software; you can redistribute it and/or modify it under the terms of the **GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.**

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY. See the `LICENSE` file for more details.
