/* eslint-disable require-jsdoc */
'use strict';
const net = require('net');
const EventEmitter = require('events');

// state struct, format STATE : event key
const SOCKET_STATES = {
    'DISCONNECTED': 'socket:disconnect',
    'CONNECTING': 'socket:connecting',
    'CONNECTED': 'socket:connect',
    'CLOSED': 'socket:close',
};

//messages struct
const MESSAGES = {
    WIFI: [0x53, 0x30, 0x81, 0x12, 0x82],
    BT: [0x53, 0x30, 0x81, 0x19, 0xAD],
    AUX: [0x53, 0x30, 0x81, 0x1A, 0x9B],
    OPT: [0x53, 0x30, 0x81, 0x1B, 0x00],
    USB: [0x53, 0x30, 0x81, 0x1C, 0xF7],
    VOL_GET: [0x47, 0x25, 0x80, 0x6C],
    SRC_GET: [0x47, 0x30, 0x80, 0xD9],
    OFF: [0x53, 0x30, 0x81, 0x9b, 0x0b]
}

const OFF_INPUT_FLAG = {
    0x92: 'WIFI',
    0x9A: 'AUX',
    0x9F: 'BT',
    0x9C: 'USB',
    0x9B: 'OPT'
}

const OFF_TO_ON_INPUT_FLAG = {
    0x90: 'TRANSITION'
}

const ON_INPUT_FLAG = {
    0x12: 'WIFI',
    0x1A: 'AUX',
    0x1F: 'BT',
    0x1C: 'USB',
    0x1B: 'OPT'
}

/*  This is event based. callbacks to socket messages don't contain the answers, they are just a cb on sending the data to the socket.
    a promise version will be released next. 
*/

class KEF extends EventEmitter {
    /*
        ip/port - of speakers
        retryInterval - how long between retry attempts to reconnect a disconnected socket
        retry - should we attempt to reconnect a closed socket?  
        maxVolume - max vol limit
        checkstatusinterval - delay between asking speaker for current volume/mute
        emitUnchangedState - if true, always emit volume/mute info every time fetched. if False, only emit on change. 
        connectOnInstantiation
    */
    constructor({
        ip,
        port = 50001,
        retryInterval = 1000,
        retry = true,
        maxVolume = 50,
        checkStateInterval = 0,
        emitUnchangedState = false, // if you want it to always emit state events every time it checks even if it hasn't changed. 
        connectOnInstantiation = true,
    } = {}) {
        super();

        //throw errors if ip or max volume are invalid.
        if (ip === undefined) {
            throw new Error('No IP Defined');
        }
        if (maxVolume < 1 || maxVolume > 100) {
            throw new Error('Invalid max volume set' + maxVolume)
        }

        this.retryInterval = retryInterval;
        this.ip = ip;
        this.retry = retry;
        this.port = port;
        this.maxVolume = maxVolume; // a hard limit for max volume. a nice safety
        this.checkStateInterval = checkStateInterval; //
        this.emitUnchangedState = emitUnchangedState;
        this.muted = null; //we don't know if it's true or false. 
        this.volume = -1; //unknown to start
        this.source = -1;
        this.onoff = -1;
        // just keeps track if it's currently retrying only every have 1 retry in progress
        this.retryFlag = false;
        this.checkingStateFlag = false;
        this.dataCallbackQueue = [];
        this.socket = new net.Socket();
        // this.bindHandlers();
        // just forward errors
        this.socket.on('error', (err) => {
            this.emit('socket:error', err);
        });
        // other event handlers
        this.socket.on('close', this.handleClose.bind(this));
        this.socket.on('connect', this.handleConnect.bind(this));
        this.socket.on('data', this.handleData.bind(this))
        this.socket.on('end', this.handleEnd.bind(this))
        // starting state
        this.socketState = SOCKET_STATES.CLOSED;
        if (connectOnInstantiation) {
            this.connect();
        }
    }

    checkState(cb = function () {}) {
        if (this.socketState == SOCKET_STATES.CONNECTED && !this.checkingStateFlag) {
            //get the volume, then get the source. 
            this.checkingStateFlag = true;
            this.getVolume(() => {
                //an odd thing, if you request state immediately after this the source may be wrong, so we have to give it time.
                setTimeout(() => {
                    this.getSource(() => {
                        this.checkingStateFlag = false;
                        cb();
                    });
                }, 300)

            });
        } else {
            cb('Socket is not connected or already requesting state from speaker, ignoring')
        }
    }

    connect() {
        // if we're connecting, we want to reconnect if it fails or disconnects
        this.retry = true;
        this.setSocketState(SOCKET_STATES.CONNECTING)
        this.socket.connect({
            host: this.ip,
            port: this.port
        });
    }

    muteToggle(cb = function () {}) {
        if (this.muted === true) {
            this.setVolume(this.volume, cb);
        } else if (this.muted === false) {
            this.setVolume(this.volume + 128, cb);
        } else {
            // we don't know if it's muted or not. 
            cb("Unable to toggle mute, current mute state unknown")
        }
    }

    // this changes the input OR turns speakers on if off, power on function may only work with newer speakers 
    // note the callback is called when finished writing to the socket, not when a response from the speaker
    turnOnOrSwitchSource(which = 'AUX', cb = function () {}) {
        if (!(MESSAGES[which])) {
            throw new Error('Invalid input: ' + which);
        } else {
            this.socket.write(Buffer.from(MESSAGES[which]), cb);
        }
    }

    turnOff(cb = function () {}) {
        this.socket.write(Buffer.from(MESSAGES.OFF), cb);
        //it takes about 5 seconds to turn off. I hate set timeout but the speaker will not emit an off so we have to check source 2 seconds later
        setTimeout(() => {
            this.getSource(cb);
        }, 5000)
    }

    // note the callback is called when finished writing to the socket, not when a response from the speaker has confirmed the volume changed. If you want to confirm, wait for the volume event. 
    // negative amount goes down. 
    changeVolume(amount = 1, cb = function () {}) {
        if (this.volume == -1) {
            cb("Unable to change relative volume, current volume unknown.");
        } else {
            this.setVolume(this.volume + amount, cb)
        }
    }

    //note the callback is called when finished writing to the socket, not when a response from the speaker has confirmed the volume changed. If you want to confirm, wait for the volume event. 
    setVolume(val, cb = function () {}) {
        //normalize for mute
        if (this.socketState == SOCKET_STATES.CONNECTED && val >= 0 && ((val >= 128) || (val <= this.maxVolume))) {
            this.socket.write(Buffer.from([0x53, 0x25, 0x81, Math.min(val, 128 + this.maxVolume), 0x1A]), cb)
        } else {
            cb("Socket is not connected or value out of range " + val)
        }
    }

    end() {
        // if you call this you don't want it to reconnect
        this.retry = false;
        this.socket.end();
    }

    getVolume(cb = function () {}) {
        if (this.socketState == SOCKET_STATES.CONNECTED) {
            this.socket.write(Buffer.from(MESSAGES.VOL_GET), cb);
        } else {
            cb("Socket is not connected")
        }
    }

    getSource(cb = function () {}) {
        if (this.socketState == SOCKET_STATES.CONNECTED) {
            this.socket.write(Buffer.from(MESSAGES.SRC_GET), cb);
        } else {
            cb("Socket is not connected")
        }
    }

    // sets state and emits event
    setSocketState(state, data) {
        this.socketState = socketState;
        this.emit(socketState, data);
    }

    toJSON() {
        return {
            volume: this.volume,
            muted: this.muted,
            source: this.source,
            socketState: this.socketState,
            onoff: this.onoff
        };
    }

    handleData(data) {
        //parse the data
        let changeToEmit = false;
        if (data && data[0] == 0x52) {
            switch (data[1]) {
                case 0x11: //ack
                    //this is an ack on a message we sent, get new status
                    this.checkState();
                    break;
                case 0x25: //volume
                    //volume
                    let previousVolume = this.volume;
                    let previousMuted = this.muted;
                    if (data[3] >= 128) {
                        //it's muted
                        this.muted = true
                        this.volume = data[3] - 128;
                    } else {
                        this.volume = data[3];
                        this.muted = false
                    }
                    if (this.emitUnchangedState || this.volume != previousVolume || this.muted != previousMuted) {
                        changeToEmit = true;
                    }
                    break;
                case 0x30: //source
                    let previousSource = this.source;
                    let previousOnoff = this.onoff;

                    if (OFF_INPUT_FLAG[data[3]]) {
                        //we are off
                        this.onoff = 0;
                    } else if (OFF_TO_ON_INPUT_FLAG[data[3]]) {
                        this.onoff = 1;
                        //we really should queue up another request for state after this because we do not know the input
                        this.source = -1;
                        //i hate settimeout but we have to give it time to turn on. wait 1 second
                        setTimeout(() => {
                            this.getSource();
                        }, 1000)
                    } else if (ON_INPUT_FLAG[data[3]]) {
                        this.source = ON_INPUT_FLAG[data[3]];
                        this.onoff = 1;
                    } else {
                        //if we got here we received an unexpected message.
                        console.error("unparsed data", data)
                    }
                    if (this.source != previousSource || this.onoff != previousOnoff) {
                        changeToEmit = true;
                    }
                    break;

            }
        }

        if (changeToEmit) {
            this.emit('state', this.toJSON())
        }
    }

    handleConnect(data) {
        this.setSocketState(SOCKET_STATES.CONNECTED);

        // launch checkState loop, or check state one time.
        if (this.checkStateInterval > 0) {
            //just confirm its cleared before creating a new one
            clearTimeout(this.checkStateLoop)
            this.checkStateLoop = setInterval(this.checkState.bind(this), this.checkStateInterval);
        } else {
            this.checkState();
        }
    }

    handleEnd(data) {}

    handleClose(data) {
        this.setSocketState(SOCKET_STATES.CLOSED);
        clearTimeout(this.checkStateLoop);

        //attempt to reconnect if should retry and not already retrying
        if (this.retry && !this.retryFlag) {
            this.retryFlag = true;
            setTimeout(() => {
                // this.socket = new net.Socket();
                // this.bindHandlers();
                this.retryFlag = false;
                this.connect();
            }, this.retryInterval)
        }
    }
}

module.exports = KEF