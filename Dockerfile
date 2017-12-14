FROM node:latest

RUN mkdir /vanillachain
ADD package.json /vanillachain/
ADD main.js /vanillachain/
ADD chain.js /vanillachain/

RUN cd /vanillachain && npm install

EXPOSE 3001
EXPOSE 6001

ENTRYPOINT cd /vanillachain && npm install && PEERS=$PEERS npm start