'use strict';

const blake = require('blakejs');

const diff1 = global.diff1 = BigInt('0x00000000ffff0000000000000000000000000000000000000000000000000000');

const algoProperties = global.algos = {
    scrypt: {
        multiplier: Math.pow(2, 16),
        hash: (data) => require('scryptsy')(data, data, 1024, 1, 1, 32)
    },
    sha256d: {
        multiplier: 1,
        hash: (data) => {
            const crypto = require('crypto');
            const first = crypto.createHash('sha256').update(data).digest();
            return crypto.createHash('sha256').update(first).digest();
        }
    },
    blake: {
        multiplier: 1,
        hash: (data) => Buffer.from(blake.blake256.array(data))
    }
};

module.exports = (algo) => {
    if (algoProperties.hasOwnProperty(algo)) {
        return algoProperties[algo];
    }
    throw new Error(`Unsupported algorithm: ${algo}`);
};
