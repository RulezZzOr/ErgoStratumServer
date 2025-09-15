'use strict';

const crypto = require('crypto');
const bs58 = require('bs58');
const { toBigIntBE, toBufferBE } = require('bigint-buffer');

const bufferToBigInt = (buffer) => buffer.length === 0 ? 0n : toBigIntBE(buffer);

const bigIntToBuffer = (value) => {
    if (value === 0n) {
        return Buffer.from([0]);
    }
    return toBufferBE(value, Math.ceil(value.toString(2).length / 8));
};

exports.addressFromEx = function(exAddress, ripdm160Key){
    try {
        const versionByte = exports.getVersionByte(exAddress);
        const addrBase = Buffer.concat([versionByte, Buffer.from(ripdm160Key, 'hex')]);
        const checksum = exports.sha256d(addrBase).slice(0, 4);
        const address = Buffer.concat([addrBase, checksum]);
        return bs58.encode(address);
    }
    catch(e){
        return null;
    }
};

exports.getVersionByte = function(addr){
    return Buffer.from(bs58.decode(addr)).slice(0, 1);
};

exports.sha256 = function(buffer){
    return crypto.createHash('sha256').update(buffer).digest();
};

exports.sha256d = function(buffer){
    return exports.sha256(exports.sha256(buffer));
};

exports.reverseBuffer = function(buff){
    return Buffer.from(buff).reverse();
};

exports.reverseHex = function(hex){
    return exports.reverseBuffer(Buffer.from(hex, 'hex')).toString('hex');
};

exports.reverseByteOrder = function(buff){
    for (let i = 0; i < 8; i++) buff.writeUInt32LE(buff.readUInt32BE(i * 4), i * 4);
    return exports.reverseBuffer(buff);
};

exports.uint256BufferFromHash = function(hex){
    let fromHex = Buffer.from(hex, 'hex');
    if (fromHex.length !== 32){
        const empty = Buffer.alloc(32);
        fromHex.copy(empty, 32 - fromHex.length);
        fromHex = empty;
    }
    return exports.reverseBuffer(fromHex);
};

exports.hexFromReversedBuffer = function(buffer){
    return exports.reverseBuffer(buffer).toString('hex');
};

exports.varIntBuffer = function(n){
    if (n < 0xfd)
        return Buffer.from([n]);
    else if (n <= 0xffff){
        const buff = Buffer.alloc(3);
        buff[0] = 0xfd;
        buff.writeUInt16LE(n, 1);
        return buff;
    }
    else if (n <= 0xffffffff){
        const buff = Buffer.alloc(5);
        buff[0] = 0xfe;
        buff.writeUInt32LE(n, 1);
        return buff;
    }
    const buff = Buffer.alloc(9);
    buff[0] = 0xff;
    exports.packUInt16LE(n).copy(buff, 1);
    return buff;
};

exports.varStringBuffer = function(string){
    const strBuff = Buffer.from(string);
    return Buffer.concat([exports.varIntBuffer(strBuff.length), strBuff]);
};

exports.serializeNumber = function(n){
    if (n >= 1 && n <= 16) return Buffer.from([0x50 + n]);
    let l = 1;
    const buff = Buffer.alloc(9);
    while (n > 0x7f)
    {
        buff.writeUInt8(n & 0xff, l++);
        n >>= 8;
    }
    buff.writeUInt8(l, 0);
    buff.writeUInt8(n, l++);
    return buff.slice(0, l);
};

exports.serializeString = function(s){
    if (s.length < 253)
        return Buffer.concat([
            Buffer.from([s.length]),
            Buffer.from(s)
        ]);
    if (s.length < 0x10000)
        return Buffer.concat([
            Buffer.from([253]),
            exports.packUInt16LE(s.length),
            Buffer.from(s)
        ]);
    if (s.length < 0x100000000)
        return Buffer.concat([
            Buffer.from([254]),
            exports.packUInt32LE(s.length),
            Buffer.from(s)
        ]);
    return Buffer.concat([
        Buffer.from([255]),
        exports.packUInt16LE(s.length),
        Buffer.from(s)
    ]);
};

exports.packUInt16LE = function(num){
    const buff = Buffer.alloc(2);
    buff.writeUInt16LE(num, 0);
    return buff;
};
exports.packInt32LE = function(num){
    const buff = Buffer.alloc(4);
    buff.writeInt32LE(num, 0);
    return buff;
};
exports.packInt32BE = function(num){
    const buff = Buffer.alloc(4);
    buff.writeInt32BE(num, 0);
    return buff;
};
exports.packUInt32LE = function(num){
    const buff = Buffer.alloc(4);
    buff.writeUInt32LE(num, 0);
    return buff;
};
exports.packUInt32BE = function(num){
    const buff = Buffer.alloc(4);
    buff.writeUInt32BE(num, 0);
    return buff;
};
exports.packInt64LE = function(num){
    const buff = Buffer.alloc(8);
    buff.writeUInt32LE(num % Math.pow(2, 32), 0);
    buff.writeUInt32LE(Math.floor(num / Math.pow(2, 32)), 4);
    return buff;
};

exports.range = function(start, stop, step){
    if (typeof stop === 'undefined'){
        stop = start;
        start = 0;
    }
    if (typeof step === 'undefined'){
        step = 1;
    }
    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)){
        return [];
    }
    const result = [];
    for (let i = start; step > 0 ? i < stop : i > stop; i += step){
        result.push(i);
    }
    return result;
};

exports.pubkeyToScript = function(key){
    if (key.length !== 66) {
        console.error('Invalid pubkey: ' + key);
        throw new Error();
    }
    const pubkey = Buffer.alloc(35);
    pubkey[0] = 0x21;
    pubkey[34] = 0xac;
    Buffer.from(key, 'hex').copy(pubkey, 1);
    return pubkey;
};

exports.miningKeyToScript = function(key){
    const keyBuffer = Buffer.from(key, 'hex');
    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), keyBuffer, Buffer.from([0x88, 0xac])]);
};

exports.addressToScript = function(addr){
    const decoded = Buffer.from(bs58.decode(addr));
    if (decoded.length !== 25){
        console.error('invalid address length for ' + addr);
        throw new Error();
    }
    const pubkey = decoded.slice(1,-4);
    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), pubkey, Buffer.from([0x88, 0xac])]);
};

exports.getReadableHashRateString = function(hashrate){
    let i = -1;
    const byteUnits = [ ' KH', ' MH', ' GH', ' TH', ' PH' ];
    do {
        hashrate = hashrate / 1024;
        i++;
    } while (hashrate > 1024);
    return hashrate.toFixed(2) + byteUnits[i];
};

exports.shiftMax256Right = function(shiftRight){
    const arr256 = Array.from({ length: 256 }, () => 1);
    const arrLeft = Array.from({ length: shiftRight }, () => 0);
    const shifted = arrLeft.concat(arr256).slice(0, 256);
    const octets = [];
    for (let i = 0; i < 32; i++){
        octets[i] = 0;
        const bits = shifted.slice(i * 8, i * 8 + 8);
        for (let f = 0; f < bits.length; f++){
            const multiplier = Math.pow(2, f);
            octets[i] += bits[f] * multiplier;
        }
    }
    return Buffer.from(octets);
};

exports.bufferToCompactBits = function(startingBuff){
    let buff = bigIntToBuffer(bufferToBigInt(startingBuff));
    buff = buff.length && buff[0] > 0x7f ? Buffer.concat([Buffer.from([0x00]), buff]) : buff;
    const compact = Buffer.alloc(4);
    compact.writeUInt8(buff.length, 0);
    buff.copy(compact, 1, 0, 3);
    return compact;
};

exports.bignumFromBitsBuffer = function(bitsBuff){
    const numBytes = bitsBuff.readUInt8(0);
    const bigBits = bufferToBigInt(bitsBuff.slice(1));
    const target = bigBits * (1n << (8n * BigInt(numBytes - 3)));
    return target;
};

exports.bignumFromBitsHex = function(bitsString){
    const bitsBuff = Buffer.from(bitsString, 'hex');
    return exports.bignumFromBitsBuffer(bitsBuff);
};

exports.convertBitsToBuff = function(bitsBuff){
    const target = exports.bignumFromBitsBuffer(bitsBuff);
    const resultBuff = bigIntToBuffer(target);
    const buff256 = Buffer.alloc(32);
    const slice = resultBuff.slice(-32);
    slice.copy(buff256, buff256.length - slice.length);
    return buff256;
};

exports.getTruncatedDiff = function(shift){
    return exports.convertBitsToBuff(exports.bufferToCompactBits(exports.shiftMax256Right(shift)));
};
