'use strict';
let CryptoJS = require("crypto-js");
let logger = require('color-logs')(true, true, "chain.js");
let fs = require('fs');

class Block {
    constructor(index, previousHash, timestamp, data, hash) {
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
}

let MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

let blockchain = [getGenesisBlock()];


//INIT
module.exports.blockchain = function () {
    return blockchain;
};

/**
 * To generate a block we must know the hash of the previous block and create the rest of the
 * required content (= index, hash, data and timestamp). Block data is something that is provided by the end-user.
 */
module.exports.generateNextBlock = function (blockData) {
    let previousBlock = this.getLatestBlock();
    let nextIndex = previousBlock.index + 1;
    let nextTimestamp = new Date().getTime() / 1000;
    let nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
};


module.exports.addBlock = function (newBlock) {
    if (isValidNewBlock(newBlock, this.getLatestBlock())) {
        blockchain.push(newBlock);
    }
};

module.exports.getLatestBlock = function () {
    return blockchain[blockchain.length - 1];
};

module.exports.queryChainLengthMsg = function () {
    return ({'type': MessageType.QUERY_LATEST});
};

module.exports.queryAllMsg = function () {
    return ({'type': MessageType.QUERY_ALL});
};
module.exports.responseChainMsg = function () {
    return ({'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)});
};

module.exports.responseLatestMsg = function () {
    return ({'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify([this.getLatestBlock()])});
};

/**
 * There should always be only one explicit set of blocks in the chain at a given time.
 * In case of conflicts (e.g. two nodes both generate block number 72) we choose the chain that has the longest number of blocks.
 */
module.exports.replaceChain = function (newBlocks, broadcast) {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        logger.info('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcast(this.responseLatestMsg());
    } else {
        logger.info('Received blockchain invalid');
    }
};

module.exports.persist = function (id, block) {
    logger.info("Node " + id + " persisting new block.");
    logger.colors("cyan").info('Block added: \n' + JSON.stringify(block, null, 4));
};



function getGenesisBlock() {
    /**
     * A in-memory Javascript array is used to store the blockchain.
     * The first block of the blockchain is always a so-called “genesis-block”, which is hard coded.
     */
    let hash = calculateHash(0, "0", 1510679507.176, "Genesis");
    return new Block(0, "0", 1465154705, "Genesis", hash);
}

function calculateHashForBlock(block) {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
}

function calculateHash(index, previousHash, timestamp, data) {
    /**
     * The block needs to be hashed to keep the integrity of the data. A SHA-256 is taken over the content of the block.
     * */
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
}

function isValidNewBlock(newBlock, previousBlock) {
    /**
     * At any given time we must be able to validate if a block or a chain of blocks are valid in terms of integrity.
     * This is true especially when we receive new blocks from other nodes and must decide whether to accept them or not.
     */
    //TODO: validate block structure.
    if (previousBlock.index + 1 !== newBlock.index) {
        logger.error('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        logger.error('invalid previoushash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        logger.warn(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        logger.error('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
}

function isValidChain(blockchainToValidate) {
    //TODO: This can be optimized with underscore
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    let tempBlocks = [blockchainToValidate[0]];
    for (let i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
}