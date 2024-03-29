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

const { promises: fs } = require("fs");

for(key in MESSAGES){
  let buf = Buffer.from(MESSAGES[key]);
  fs.writeFile(key,buf)
}
