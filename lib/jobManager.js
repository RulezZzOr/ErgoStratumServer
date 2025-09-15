const events = require('events');
const crypto = require('crypto');
const { blake2b } = require('blakejs');
const uint64be = require('uint64be');
const util = require('./util.js');
const blockTemplate = require('./blockTemplate.js');
const BigIntBuffer = require('bigint-buffer');
const BigNumber = require('bignumber.js')

// const N = BigInt(Math.pow(2, 26));
const M = Buffer.concat(Array(1024).fill().map((_, i) => uint64be.encode(i)));

const NBase = BigInt(Math.pow(2, 26))

const IncreaseStart = 600 * 1024

const IncreasePeriodForN = 50 * 1024

const NIncreasementHeightMax = 9216000

const N = height => {
    height = Math.min(NIncreasementHeightMax, height)
    if (height < IncreaseStart) {
        return NBase;
    }else if(height >= NIncreasementHeightMax){
        return 2147387550;
    } else {
        let res = NBase;
        let iterationsNumber = Math.floor((height - IncreaseStart) / IncreasePeriodForN) + 1;
        for (let i = 0; i < iterationsNumber; i++) {
            res = res / BigInt(100) * BigInt(105)
        }
        return res;
    }
}


//Unique extra nonce per subscriber
const ExtraNonceCounter = function (configInstanceId, extraNonce1Size) {
    extraNonce1Size = extraNonce1Size || 4; //bytes
    if (extraNonce1Size > 4 || extraNonce1Size < 1){
        throw "ExtraNonce1 size must be in range [1..4]"
    }
    const instanceId = configInstanceId || crypto.randomBytes(4).readUInt32LE(0);
    let counter = instanceId << 27;

    this.next = function () {
        const extraNonce = util.packUInt32BE(Math.abs(counter++));
        return extraNonce.toString('hex').substr(8 - 2 * extraNonce1Size);
    };

    this.size = extraNonce1Size; //bytes
};

function genIndexes(seed, height) {
    const hash = blake2bDigest(seed);
    const extendedHash = new Uint8Array(hash.length * 2);
    extendedHash.__proto__ = hash.__proto__;
    extendedHash.set(hash);
    extendedHash.set(hash, hash.length);
    return Array.from({length: 32}).map((_, index) => extendedHash.readUIntBE(index, 4) % parseInt(N(height)))
}

function blake2bDigest(seed) {
    return Buffer.from(blake2b(seed, null, 32));
}

//Unique job per new block template
const JobCounter = function () {
    let counter = 0;

    this.next = function () {
        counter++;
        if (counter % 0xffff === 0)
            counter = 1;
        return this.cur();
    };

    this.cur = function () {
        return counter.toString(16);
    };
};

/**
 * Emits:
 * - newBlock(blockTemplate) - When a new block (previously unknown to the JobManager) is added, use this event to broadcast new jobs
 * - share(shareData, blockHex) - When a worker submits a share. It will have blockHex if a block was found
 **/
const JobManager = module.exports = function JobManager(options) {


    //private members

    const _this = this;
    const jobCounter = new JobCounter();

    //public members

    this.extraNonceCounter = new ExtraNonceCounter(options.instanceId, options.extraNonce1Size);
    this.extraNoncePlaceholder = new Buffer('f000000ff111111f', 'hex');
    this.extraNonce2Size = this.extraNoncePlaceholder.length - this.extraNonceCounter.size;

    this.currentJob;
    this.validJobs = {};

    this.updateCurrentJob = function (rpcData) {

        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNoncePlaceholder,
            options.coin.reward,
            options.coin.txMessages,
            options.recipients
        );

        _this.currentJob = tmpBlockTemplate;

        _this.emit('updatedBlock', tmpBlockTemplate, true);

        _this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

    };

    //returns true if processed a new block
    this.processTemplate = function (rpcData) {

        /* Block is new if A) its the first block we have seen so far or B) the block hash is different and the
           block height is greater than the one we have */
        let isNewBlock = typeof (_this.currentJob) === 'undefined';
        if (!isNewBlock && _this.currentJob.rpcData.msg !== rpcData.msg) {
            isNewBlock = true;

            //If new block is outdated/out-of-sync than return
            if (rpcData.height < _this.currentJob.rpcData.height)
                return false;
        }

        if (!isNewBlock) return false;


        const tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNoncePlaceholder,
            options.coin.reward,
            options.coin.txMessages,
            options.recipients
        );

        this.currentJob = tmpBlockTemplate;

        this.validJobs = {};
        _this.emit('newBlock', tmpBlockTemplate);

        this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

        return true;

    };

    this.processShare = function (jobId, previousDifficulty, difficulty, extraNonce1, extraNonce2, nTime, nonce, ipAddress, port, workerName) {
        const shareError = function (error) {
            _this.emit('share', {
                job: jobId,
                ip: ipAddress,
                worker: workerName,
                difficulty: difficulty,
                error: error[1]
            });
            return {error: error, result: null};
        };

        if (extraNonce2.length / 2 !== _this.extraNonce2Size)
            return shareError([20, 'incorrect size of extra nonce2']);

        const job = this.validJobs[jobId];

        if (typeof job === 'undefined' || job.jobId !== jobId) {
            return shareError([21, 'job not found']);
        }

        nonce = extraNonce1 + extraNonce2;

        if (nonce.length !== 16) {
            return shareError([20, 'incorrect size of nonce']);
        }

        if (!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce)) {
            return shareError([22, 'duplicate share']);
        }

        const extraNonce1Buffer = new Buffer(extraNonce1, 'hex');
        const extraNonce2Buffer = new Buffer(extraNonce2, 'hex');

        const coinbaseBuffer = job.serializeCoinbase(extraNonce1Buffer, extraNonce2Buffer);
        const h = BigIntBuffer.toBufferBE(BigInt(job.rpcData.height), 4);
        const i = BigIntBuffer.toBufferBE(BigIntBuffer.toBigIntBE(blake2bDigest(coinbaseBuffer).slice(24, 32)) % N(job.rpcData.height), 4);
        const e = blake2bDigest(Buffer.concat([
            i,
            h,
            M
        ])).slice(1, 32);
        const J = genIndexes(Buffer.concat([e, coinbaseBuffer]), job.rpcData.height).map(item => BigIntBuffer.toBufferBE(BigInt(item), 4));
        const f = J.map(item => BigIntBuffer.toBigIntBE(
            blake2bDigest(Buffer.concat([item, h, M])).slice(1, 32)
        )).reduce((a, b) => a + b);

        const fhBigInt = BigIntBuffer.toBigIntBE(blake2bDigest(BigIntBuffer.toBufferBE(f, 32)));
        const fhBigNumber = new BigNumber(fhBigInt.toString());
        const baseTarget = new BigNumber(
            job.jobParams[6] && typeof job.jobParams[6].toString === 'function'
                ? job.jobParams[6].toString(10)
                : String(job.jobParams[6])
        );

        let networkTarget;
        if (job.rpcData && job.rpcData.b) {
            networkTarget = typeof job.rpcData.b.toString === 'function'
                ? new BigNumber(job.rpcData.b.toString(10))
                : new BigNumber(job.rpcData.b);
        } else {
            networkTarget = baseTarget;
        }

        let blockHash = "";
        if (networkTarget.gte(fhBigNumber)) {
            blockHash = BigIntBuffer.toBufferBE(f, 32);
        } else {
            let poolDifficulty = new BigNumber(difficulty || 1);
            if (!poolDifficulty.isFinite() || poolDifficulty.lte(0)) {
                poolDifficulty = new BigNumber(1);
            }

            const effectiveTarget = baseTarget.dividedBy(poolDifficulty);
            if (fhBigNumber.gt(effectiveTarget)) {
                return shareError([23, 'Low Difficulty share']);
            }
        }


        _this.emit('share', {
            job: jobId,
            ip: ipAddress,
            port: port,
            worker: workerName,
            height: job.rpcData.height,
            blockReward: job.rpcData.coinbasevalue,
            msg: job.rpcData.msg,
            difficulty: difficulty,
            shareDiff: 1,
            blockDiff: false,
            blockDiffActual: job.difficulty,
            blockHash: blockHash,
            blockHashInvalid: false
        }, nonce);

        return {result: true, error: null, blockHash: blockHash};
    };
};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;
