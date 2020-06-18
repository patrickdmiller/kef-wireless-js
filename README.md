# KEF wireless speaker JS module

Control and read state from your KEF wireless speakers (tested on ls50w)

This opens a socket and sends and parses the messages needed to communicate with the KEF socket protocol

It's event / callback based. Promise version coming later.


# Example  Use

```javascript

//minimum info to connect to speakers. see OPTIONS for more
let kef = new KEF({
    ip: '192.168.1.60'
});


//when the state of the speakers change (volume , source, onoff )
kef.on('state', (data)=>{
    console.log(data);
});

//or get it manually
kef.toJSON();

//or force a query of the speaker
kef.checkState();

//at some point later turn the speakers on or change the source
kef.turnOnOrSwitchSource('AUX');

//or change the volume
kef.changeVolume(1);
kef.changeVolume(-1);

//or set volume manually
kef.setVolume(20);

//and turn them off
kef.turnOff();

```
# Speaker / Module State
to get the current state of the speakers, as we know it, just call toJSON()
the retured object looks like: 
```javascript
{
    "volume":40, //1-100, -1 if unknown. the speaker actually goes above 100 for muted states. this corrects for that.
    "muted":false, //true|false, null if unknown
    "source":"AUX", //AUX|OPT|BT|USB|WIFI, -1 if unknown
    "socketState":"socket:connect", //socket:disconnect, socket:connecting, socket:connect, socket:close
    "onoff":1 //1 if on, 0 if off, -1 if we don't know
}
```

# Options
The constructor requiers an options object passed. 
```javascript
let kef = new KEF({
    ip: '192.168.1.60'
});
```

### `ip ` (required)
IP address of the speakers

### `port` (optional, Default: 50001)
port of speakers

### `retryInterval` (optional, milliseconds, Default: 1000)
if unable to connect or becomes disconnected, will retry every interval. 

### `retry` (optional, true|false, Default: true)
enable or disable retry socket connection on disconnect 

### `maxVolume` (optional, Default: 50)
limit the volume of the speakers. Note: this only limits what we send the speaker. If you use the remote control or on-speaker buttons you can do whatever you want. 

### `checkStateInterval` (optional, milliseconds, Default: 0 which is disabled)
this basically checks the speaker state once every x milliseconds. This is helpful if you want to catch changes made external to this module. For example, if you pick up the remote and turn the volume up, you won't know the new state unless you checkState(). This will just check for you. 

### `emitUnchangedState` (optional, true|false, Default: false)
if you want the module to always emit the state when we get it, even if it's unchanged. remember, you can always just access toJSON() to get current known state without requesting it from the speaker. 

### `connectOnInstantiation` (optional, true|false, Default: true)
connect to the speaker on instantiation. if false, you have to connect it by calling connect() on your kef instance. 

# Methods

Please note, for anything that takes a callback, it's a callback for the message on the underlying `socket.write()` not when the speakers have indeed done what we've asked them to do. 

I will release a promise version later, but for now, if you want to know when the speaker has done the action you need to wait until the `state` event is thrown with the state you are waiting for. 

The way it works under the hood is that after every request is made to the speakers, the speakers respond with an ack message. After the ack message, the library requests both source and volume info from the speakers and the appropriate `state` event is then thrown. 



### `connect()`
connect the socket. You don't need to call this unless you set `connectOnInstantiation` option to false. 

### `muteToggle(cb)`
equivilent to pressing the mute button. 

### `turnOnOrSwitchSource(source, cb)`
switch source. If off, speakers will turn on to the passed source. valid source values are ('AUX', 'WIFI', 'BT', 'USB', 'OPT'). 

### `turnOff(cb)`
equivilent to pressing the mute button. 

### `changeVolume(amount, cb)`
pass 1 for volume up and -1 for down

### `setVolume(val, cb)`
absolute volume val

### `end`
sets retry to false and calls a [socket.end()](https://nodejs.org/api/net.html#net_socket_end_data_encoding_callback)

### `toJSON()`
returns the current known state of the speakers. see [speaker state](#Speaker-/-Module-State) above. 

# Events

## socket events
`socket:error`

`socket:disconnect`

`socket:connecting`

`socket:connect`

`socket:close`

## speaker events

`state` when we get a new state ( or any state if you set the [option](#options) )



# thanks
- https://github.com/Gronis/pykef