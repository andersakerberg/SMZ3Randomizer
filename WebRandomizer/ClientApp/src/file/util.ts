export async function readAsArrayBuffer(blob: any): Promise<ArrayBuffer> {
  const fileReader = new FileReader();
  return new Promise((resolve, reject) => {
    fileReader.onerror = () => {
      fileReader.abort();
      reject(new DOMException('Error parsing data'));
    };

    fileReader.onload = (e) => {
      if (e && e.target && e.target.result) {
        resolve(e.target.result as ArrayBuffer);
      }
    };

    fileReader.readAsArrayBuffer(blob);
  });
}

export function snes_to_pc(mapping: any, addr: any) {
  if (mapping === 'exhirom') {
    const ex = addr < 0x800000 ? 0x400000 : 0;
    const pc = addr & 0x3fffff;
    return ex | pc;
  }
  if (mapping === 'lorom') {
    return ((addr & 0x7f0000) >>> 1) | (addr & 0x7fff);
  }
  throw new Error('No known addressing mode supplied');
}
