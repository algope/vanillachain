
let express = require("express");
let bodyParser = require('body-parser');
let WebSocket = require("ws");
let chain = require("./chain.js");

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
        console.log('block added: ' + JSON.stringify(newBlock));
        res.send();
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
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};


let initP2PServer = () => {
    let server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);

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
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, chain.responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, chain.responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

let initErrorHandler = (ws) => {
    let closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
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
            console.log('connection failed')
        });
    });
};

let handleBlockchainResponse = (message) => {
    let receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    let latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    let latestBlockHeld = chain.getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            chain.blockchain().push(latestBlockReceived);
            broadcast(chain.responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(chain.queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            chain.replaceChain(receivedBlocks, broadcast);
        }
    } else {
        console.log('received blockchain is not longer than received blockchain. Do nothing');
    }
};

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();