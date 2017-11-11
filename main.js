let express = require("express");
let bodyParser = require('body-parser');
let WebSocket = require("ws");
let chain = require("./chain.js");
let logger = require('color-logs')(true, true, "main.js");

let http_port = process.env.HTTP_PORT || 3001;
let p2p_port = process.env.P2P_PORT || 6001;
let initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

let sockets = [];
let MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

let write = (ws, message) => ws.send(JSON.stringify(message));
let broadcast = (message) => sockets.forEach(socket => write(socket, message));



let initHttpServer = () => {
    let app = express();
    app.use(bodyParser.json());

    //List all blocks
    app.get('/blocks', (req, res) => res.send(JSON.stringify(chain.blockchain())));

    //Create a new block with a content given by the user
    app.post('/mineBlock', (req, res) => {
        let newBlock = chain.generateNextBlock(req.body.data);
        chain.addBlock(newBlock);
        broadcast(chain.responseLatestMsg());
        logger.colors("cyan").info('Block added: \n' + JSON.stringify(newBlock , null, 4));
        res.send({"stat":"Block added"});
    });

    //List peers
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });

    //Add peer
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });

    app.listen(http_port, () => logger.info('HTTP on port: ' + http_port));
};


let initP2PServer = () => {
    let server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    logger.info('P2P on port: ' + p2p_port);

};

let initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, chain.queryChainLengthMsg());
};

let initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        let message = JSON.parse(data);

        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, chain.responseLatestMsg());
                logger.info('NEW MESSAGE: Query Latest');
                break;
            case MessageType.QUERY_ALL:
                write(ws, chain.responseChainMsg());
                logger.info('NEW MESSAGE: Query All');
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                logger.info('NEW MESSAGE: Sync');
                break;
        }
    });
};

let initErrorHandler = (ws) => {
    let closeConnection = (ws) => {
        logger.error('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};



let connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        let ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            logger.error('connection failed')
        });
    });
};

let handleBlockchainResponse = (message) => {
    let receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    let latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    let latestBlockHeld = chain.getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            logger.info("We can append the received block to our chain");
            chain.blockchain().push(latestBlockReceived);
            broadcast(chain.responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            logger.warning("We have to query the chain from our peer");
            broadcast(chain.queryAllMsg());
        } else {
            logger.warning("Received blockchain is longer than current blockchain");
            chain.replaceChain(receivedBlocks, broadcast);
        }
    }
};

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();