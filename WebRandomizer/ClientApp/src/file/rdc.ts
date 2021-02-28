import isPlainObject from 'lodash/isPlainObject';
import isArray from 'lodash/isArray';
import { StringDecoder } from 'string_decoder';
import { snes_to_pc } from './util';

const decoder = new StringDecoder('utf8');

const link_manifest = [
  [[0x108000], 0x7000], // sprite
  [[0x1bd308], 4 * 30], // palette
  [[0x1bedf5], 4], // gloves
];

const samus_loader_offsets = [0x0, 0x24, 0x4f, 0x73, 0x9e, 0xc2, 0xed, 0x111, 0x139];
const samus_manifest = [
  [{ exhirom: [0x440000], lorom: [0x9c8000] }, 0x8000], // DMA bank 1
  [{ exhirom: [0x450000], lorom: [0x9d8000] }, 0x8000], // DMA bank 2
  [{ exhirom: [0x460000], lorom: [0x9e8000] }, 0x8000], // DMA bank 3
  [{ exhirom: [0x470000], lorom: [0x9f8000] }, 0x8000], // DMA bank 4
  [{ exhirom: [0x480000], lorom: [0xf58000] }, 0x8000], // DMA bank 5
  [{ exhirom: [0x490000], lorom: [0xf68000] }, 0x8000], // DMA bank 6
  [{ exhirom: [0x4a0000], lorom: [0xf78000] }, 0x8000], // DMA bank 7
  [{ exhirom: [0x4b0000], lorom: [0xf88000] }, 0x8000], // DMA bank 8
  [{ exhirom: [0x540000], lorom: [0xf98000] }, 0x8000], // DMA bank 9
  [{ exhirom: [0x550000], lorom: [0xfa8000] }, 0x8000], // DMA bank 10
  [{ exhirom: [0x560000], lorom: [0xfb8000] }, 0x8000], // DMA bank 11
  [{ exhirom: [0x570000], lorom: [0xfc8000] }, 0x8000], // DMA bank 12
  [{ exhirom: [0x580000], lorom: [0xfd8000] }, 0x8000], // DMA bank 13
  [{ exhirom: [0x590000], lorom: [0xfe8000] }, 0x7880], // DMA bank 14
  [{ exhirom: [0x5a0000], lorom: [0xff8000] }, 0x3f60], // Death DMA left
  [{ exhirom: [0x5a4000], lorom: [0xffc000] }, 0x3f60], // Death DMA right
  [[0x9a9a00], 0x3c0], // Gun port data
  [[0xb6da00], 0x600], // File select sprites
  [[0xb6d900], 0x20], // File select missile
  [[0xb6d980], 0x20], // File select missile head
  [[0x9b9402], 30], // Power Standard
  [[0x9b9522], 30], // Varia Standard
  [[0x9b9802], 30], // Gravity Standard
  [[0x8ddb6d], 30, 9, samus_loader_offsets], // Power Loader
  [[0x8ddcd3], 30, 9, samus_loader_offsets], // Varia Loader
  [[0x8dde39], 30, 9, samus_loader_offsets], // Gravity Loader
  [[0x8de468], 30, 16, 0x22], // Power Heat
  [[0x8de694], 30, 16, 0x22], // Varia Heat
  [[0x8de8c0], 30, 16, 0x22], // Gravity Heat
  [[0x9b9822], 30, 8, 0x20], // Power Charge
  [[0x9b9922], 30, 8, 0x20], // Varia Charge
  [[0x9b9a22], 30, 8, 0x20], // Gravity Charge
  [[0x9b9b22], 30, 4, 0x20], // Power Speed boost
  [[0x9b9d22], 30, 4, 0x20], // Varia Speed boost
  [[0x9b9f22], 30, 4, 0x20], // Gravity Speed boost
  [[0x9b9ba2], 30, 4, 0x20], // Power Speed squat
  [[0x9b9da2], 30, 4, 0x20], // Varia Speed squat
  [[0x9b9fa2], 30, 4, 0x20], // Gravity Speed squat
  [[0x9b9c22], 30, 4, 0x20], // Power Shinespark
  [[0x9b9e22], 30, 4, 0x20], // Varia Shinespark
  [[0x9ba022], 30, 4, 0x20], // Gravity Shinespark
  [[0x9b9ca2], 30, 4, 0x20], // Power Screw attack
  [[0x9b9ea2], 30, 4, 0x20], // Varia Screw attack
  [[0x9ba0a2], 30, 4, 0x20], // Gravity Screw attack
  [[0x9b96c2], 30, 6, 0x20], // Crystal flash
  [[0x9ba122], 30, 9, 0x20], // Death
  [[0x9ba242], 30, 10, 0x20], // Hyper beam
  [[0x9ba3a2, 0x8ce56b], 30], // Sepia
  [[0x9ba382], 30], // Sepia hurt
  [[0x9ba3c0, 0x9ba3c6], 6], // Xray
  [[0x82e52c], 2], // Door Visor
  [[0x8ee5e2], 30], // File select
  [[0x8ce68b], 30], // Ship Intro
  [[0x8dd6c2], 30, 16, 0x24], // Ship Outro
  [[0xa2a5a0], 28], // Ship Standard
  [[0x8dca54], 2, 14, 0x6], // Ship Glow
];

const block_entries = ({
  1: ['link_sprite', link_manifest],
  4: ['samus_sprite', samus_manifest],
} as unknown) as any;

export function parse_rdc(rdc: Buffer) {
  const little = true;

  const version = 1;
  if (decoder.write(rdc.slice(0, 18)) !== 'RETRODATACONTAINER') throw new Error('Could not find the RDC format header');
  if (rdc[18] !== version) throw new Error(`RDC version ${rdc[18]} is not supported, expected version ${version}`);

  let offset = 19;
  const view = new DataView(rdc.buffer);
  const block_list = [];
  let blocks = view.getUint32(offset, little);
  while (blocks > 0) {
    blocks -= 1;
    const block_type = view.getUint32((offset += 4), little);
    const block_offset = view.getUint32((offset += 4), little);
    // @ts-ignore
    block_list.push([block_type, block_offset]);
  }

  const field = new Uint8Array(rdc.buffer, (offset += 4));
  const end = field.findIndex((x) => x === 0);
  if (end < 0) throw new Error('Missing null terminator for the Author data field');

  const asBuffer = Buffer.from(field.slice(0, end));
  const author = decoder.write(asBuffer);

  return [process_blocks(rdc, block_list), author];
}

function process_blocks(rdc: Buffer, block_list: any[]) {
  const list = [] as any[];
  for (const list of block_list) {
    const entry = block_entries[list.type];

    if (entry) {
      const [name, manifest] = entry;
      const block = new Uint8Array(rdc.buffer, list.offset);
      const content = parse_block(block, manifest);
      list[name] = (rom: any, mode: any) => apply_block(rom, mode, content, manifest);
    }
  }
  return list;
}

function parse_block(block: any, manifest: any) {
  let offset = 0;
  const content = [];
  for (const [, length, entries = 1] of manifest) {
    // @ts-ignore
    content.push(block.slice(offset, offset + entries * length));
    offset += entries * length;
  }
  return content;
}

function apply_block(rom: any, mapping: any, content: any, manifest: any) {
  let index = -1;
  for (const [addrs, length, entries = 1, offset = 0] of manifest) {
    const _addrs = isPlainObject(addrs) ? addrs[mapping] : addrs;
    const entry = content[(index += 1)];
    for (const addr of _addrs) {
      for (let i = 0; i < entries; i += 1) {
        const dest = snes_to_pc(mapping, addr + (isArray(offset) ? offset[i] : offset * i));
        const src = length * i;
        rom.set(entry.slice(src, src + length), dest);
      }
    }
  }
}
