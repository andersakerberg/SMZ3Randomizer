import { readAsArrayBuffer } from '../file/util';

let ws;
let busy = false;

export function get_ws() {
  return ws;
}

export function clearBusy() {
  busy = false;
}

export function create_message(opcode, operands, space = 'SNES') {
  return JSON.stringify({
    Opcode: opcode,
    Space: space,
    Flags: null,
    Operands: operands,
  });
}

export function connect(url: string) {
  return new Promise((resolve, reject) => {
    if (busy) {
      reject('BUSY');
    }

    busy = true;
    const socket = new WebSocket(url);
    socket.onopen = function () {
      ws = socket;
      busy = false;
      resolve(socket);
    };

    socket.onerror = function (err) {
      busy = false;
      reject(err);
    };
  });
}

export function send(msg: any, noReply = false, timeOut = 1) {
  return new Promise((resolve, reject) => {
    if (busy) {
      reject('BUSY');
    }

    busy = true;
    ws.send(msg);

    if (noReply) {
      busy = false;
      setTimeout(() => {
        resolve(true);
      }, timeOut);
      return;
    }
    setTimeout(() => {
      busy = false;
      reject(false);
    }, 10000);

    ws.onmessage = function (event) {
      busy = false;
      resolve(event);
    };

    ws.onerror = function (err) {
      busy = false;
      reject(err);
    };
  });
}

export async function sendBin(msg, size) {
  return new Promise(async (resolve, reject) => {
    if (busy) {
      reject('BUSY');
      return;
    }

    busy = true;
    let outputBuffer;

    ws.onmessage = async (event) => {
      try {
        const buf = await readAsArrayBuffer(event.data);
        const arrayBuffer = new Uint8Array(buf);

        if (outputBuffer === null) {
          outputBuffer = arrayBuffer;
        } else {
          const tmpBuffer = new Uint8Array(outputBuffer.byteLength + arrayBuffer.byteLength);
          for (let i = 0; i < tmpBuffer.byteLength; ++i) {
            tmpBuffer[i] = i < outputBuffer.byteLength
              ? outputBuffer[i]
              : arrayBuffer[i - outputBuffer.byteLength];
          }
          outputBuffer = tmpBuffer;
        }

        if (outputBuffer.byteLength === size) {
          busy = false;
          resolve(outputBuffer);
        }
      } catch (err) {
        busy = false;
        reject(err);
      }
    };

    ws.onerror = function (err) {
      busy = false;
      reject(err);
    };

    ws.send(msg);
  });
}

export async function runCmd(data) {
  return new Promise(async (resolve, reject) => {
    try {
      const size = data.byteLength.toString(16);
      const message = create_message('PutAddress', ['2C01', size, '2C00', '1'], 'CMD');
      let ok = await send(message, true);
      if (ok) {
        const newArray = Array.from(data);
        newArray.push(0xea);
        ok = await send(new Blob([new Uint8Array(Buffer.from(newArray))]), true);
        if (ok) {
          resolve(true);
        } else {
          reject('Error while sending binary data for command');
        }
      } else {
        reject('Error during PutAddress for command');
      }
    } catch (err) {
      reject(err);
    }
  });
}

export async function readData(address, size) {
  return new Promise(async (resolve, reject) => {
    try {
      const message = create_message('GetAddress', [address.toString(16), size.toString(16)]);
      const response = await sendBin(message, size);
      resolve(response);
    } catch (err) {
      reject(`Could not read data from device, error was : ${err.message}`);
    }
  });
}

export async function writeData(address, data) {
  return new Promise(async (resolve, reject) => {
    try {
      const size = data.byteLength.toString(16);
      const message = create_message('PutAddress', [address.toString(16), size]);
      let ok = await send(message, true);
      if (ok) {
        try {
          ok = await send(new Blob([data]), true, 10);
          if (ok) {
            resolve(true);
          } else {
            reject('Error sending binary data');
          }
        } catch (err) {
          reject('Error sending binary data');
        }
      } else {
        reject('Error in PutAddress request');
      }
    } catch (err) {
      reject(`CCould not write data to usb2snes device, erro was : ${err.message}`);
    }
  });
}

/* Helper function for RAM writes, converts write to putCmd if on console */
export async function writeRam(address, data, snes = true) {
  return new Promise(async (resolve, reject) => {
    try {
      if (snes) {
        let opcodes = [0x48, 0x08, 0xc2, 0x30]; // PHA : PHP : REP #$30
        for (let i = 0; i < data.byteLength; i += 2) {
          if (data.byteLength - i === 1) {
            opcodes = opcodes.concat([0xe2, 0x20]); // SEP #$20
            opcodes = opcodes.concat([0xa9, data[i]]); // LDA #$xx
            const target = address + 0x7e0000 + i;
            opcodes = opcodes.concat([
              0x8f,
              target & 0xff,
              (target >> 8) & 0xff,
              (target >> 16) & 0xff,
            ]); // STA.L $xxyyzz
            opcodes = opcodes.concat([0xc2, 0x30]); // REP #$30
          } else {
            opcodes = opcodes.concat([0xa9, data[i], data[i + 1]]); // LDA #$xxyy
            const target = address + 0x7e0000 + i;
            opcodes = opcodes.concat([
              0x8f,
              target & 0xff,
              (target >> 8) & 0xff,
              (target >> 16) & 0xff,
            ]); // STA.L $xxyyzz
          }
        }
        opcodes = opcodes.concat([0x9c, 0x00, 0x2c, 0x28, 0x68, 0x6c, 0xea, 0xff]); // STZ $2C00 : PLA : PLP : JMP ($FFEA)
        console.log(new Uint8Array(opcodes));
        const ok = await runCmd(new Uint8Array(opcodes));
        resolve(ok);
      } else {
        const ok = await writeData(address + 0xf50000, data);
        resolve(ok);
      }
    } catch (err) {
      reject(`Could not write data to usb2snes device:${err}`);
    }
  });
}
