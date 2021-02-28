import { inflate } from 'pako';
import localForage from 'localforage';

import each from 'lodash/each';
import range from 'lodash/range';
import defaultTo from 'lodash/defaultTo';
import isPlainObject from 'lodash/isPlainObject';
import { bigText } from '../snes/big_text_table';
import { parse_rdc } from './rdc';
import { readAsArrayBuffer, snes_to_pc } from './util';

const legal_characters = /[A-Z0-9]/;
const illegal_characters = /[^A-Z0-9]/g;
const continous_space = / +/g;

export async function prepareRom(world_patch: any, settings: any, baseIps: any, game: any) {
  let rom;
  if (game.smz3) {
    const smRom = await readAsArrayBuffer(await localForage.getItem('baseRomSM'));
    const lttpRom = await readAsArrayBuffer(await localForage.getItem('baseRomLTTP'));
    rom = mergeRoms(new Uint8Array(smRom), new Uint8Array(lttpRom));
  } else {
    const base_rom = await readAsArrayBuffer(await localForage.getItem('baseRomSM'));
    /* extend to 4 mb to account for the base patch with custom sprites */
    rom = new Uint8Array(new ArrayBuffer(0x400000));
    rom.set(new Uint8Array(base_rom));
  }
  const base_patch = maybeCompressed(
    new Uint8Array(await (await fetch(baseIps, { cache: 'no-store' })).arrayBuffer()),
  );
  world_patch = Uint8Array.from(atob(world_patch), (c) => c.charCodeAt(0));

  const { mapping } = game;
  applyIps(rom, base_patch);

  if (game.z3) {
    await applySprite(rom, mapping, 'link_sprite', settings.z3Sprite);
  }
  await applySprite(rom, mapping, 'samus_sprite', settings.smSprite);
  if (settings.smSpinjumps) {
    smSpinjumps(rom, mapping);
  }

  if (game.z3) {
    z3HeartColor(rom, mapping, settings.z3HeartColor);
    z3HeartBeep(rom, settings.z3HeartBeep);
  }
  if (!settings.smEnergyBeep) {
    smEnergyBeepOff(rom, mapping);
  }

  applySeed(rom, world_patch);

  return rom;
}

async function applySprite(rom: any, mapping: any, block: any, sprite: any) {
  if (sprite.path) {
    const url = `${process.env.PUBLIC_URL}/sprites/${sprite.path}`;
    const rdc = maybeCompressed(new Uint8Array(await (await fetch(url)).arrayBuffer()));
    const [blocks, author] = parse_rdc(rdc);
    blocks[block] && blocks[block](rom, mapping);
    applySpriteAuthor(rom, mapping, block, author);
  }
}

function applySpriteAuthor(rom: any, mapping: any, block: any, author: any) {
  author = author.toUpperCase();
  /* Author field that is empty or has no accepted characters */
  if (!author.match(legal_characters)) return;

  author = formatAuthor(author);
  const width: number = 32;
  const pad: number = (width - author.length) >> 1; /* shift => div + floor */

  // @ts-ignore
  const addrs = {
    link_sprite: [0xf47002, 0xfd1480],
    samus_sprite: { exhirom: [0xf47004, 0xfd1600], lorom: [0xceff02, 0xcec740] },
  }[block];
  const [enable, tilemap] = isPlainObject(addrs) ? addrs[mapping] : addrs;

  rom[snes_to_pc(mapping, enable)] = 0x01;
  each(author, (char: any, i: number) => {
    // @ts-ignore
    const bytes = bigText[char];
    rom[snes_to_pc(mapping, tilemap + 2 * (pad + i))] = bytes[0];
    rom[snes_to_pc(mapping, tilemap + 2 * (pad + i + 32))] = bytes[1];
  });
}

function formatAuthor(author: string) {
  author = author.replace(illegal_characters, ' ');
  author = author.replace(continous_space, ' ');
  /* Keep at most 30 non-whitespace characters */
  /* A limit of 30 guarantee a margin at the edges */
  return author.trimStart().slice(0, 30).trimEnd();
}

/* Enables separate spinjump behavior */
function smSpinjumps(rom: Uint8Array | number[], mapping: any) {
  rom[snes_to_pc(mapping, 0x9b93fe)] = 0x01;
}

function z3HeartColor(rom: Uint8Array, mapping: any, setting: any) {
  const values = {
    red: [0x24, [0x18, 0x00]],
    yellow: [0x28, [0xbc, 0x02]],
    blue: [0x2c, [0xc9, 0x69]],
    green: [0x3c, [0x04, 0x17]],
  };
  // @ts-ignore
  const [hud, file_select] = defaultTo(values[setting], values.red);

  each(range(0, 20, 2), (i) => {
    rom[snes_to_pc(mapping, 0xdfa1e + i)] = hud;
  });

  rom.set(file_select, snes_to_pc(mapping, 0x1bd6aa));
}

function z3HeartBeep(rom: any, setting: any) {
  const values = {
    off: 0x00,
    double: 0x10,
    normal: 0x20,
    half: 0x40,
    quarter: 0x80,
  };
  /* Redirected to low bank $40 in combo */
  // @ts-ignore
  rom[0x400033] = defaultTo(values[setting], values.half);
}

function smEnergyBeepOff(rom: any, mapping: any) {
  each(
    [
      [0x90ea9b, 0x80],
      [0x90f337, 0x80],
      [0x91e6d5, 0x80],
    ],
    ([addr, value]) => (rom[snes_to_pc(mapping, addr)] = value),
  );
}

function maybeCompressed(data: any) {
  const big = false;
  const isGzip = new DataView(data.buffer).getUint16(0, big) === 0x1f8b;
  return isGzip ? inflate(data) : data;
}

function mergeRoms(sm_rom: any, z3_rom: any) {
  const rom = new Uint8Array(0x600000);

  let pos = 0;
  for (let i = 0; i < 0x40; i++) {
    const hi_bank = sm_rom.slice(i * 0x8000, i * 0x8000 + 0x8000);
    const lo_bank = sm_rom.slice((i + 0x40) * 0x8000, (i + 0x40) * 0x8000 + 0x8000);

    rom.set(lo_bank, pos);
    rom.set(hi_bank, pos + 0x8000);
    pos += 0x10000;
  }

  pos = 0x400000;
  for (let i = 0; i < 0x20; i++) {
    const hi_bank = z3_rom.slice(i * 0x8000, i * 0x8000 + 0x8000);
    rom.set(hi_bank, pos + 0x8000);
    pos += 0x10000;
  }

  return rom;
}

function applyIps(rom: any, patch: any) {
  const big = false;
  let offset = 5;
  const footer = 3;
  const view = new DataView(patch.buffer);
  while (offset + footer < patch.length) {
    const dest = (patch[offset] << 16) + view.getUint16(offset + 1, big);
    const length = view.getUint16(offset + 3, big);
    offset += 5;
    if (length > 0) {
      rom.set(patch.slice(offset, offset + length), dest);
      offset += length;
    } else {
      const rle_length = view.getUint16(offset, big);
      const rle_byte = patch[offset + 2];
      rom.set(
        Uint8Array.from(new Array(rle_length), () => rle_byte),
        dest,
      );
      offset += 3;
    }
  }
}

function applySeed(rom: any, patch: any) {
  const little = true;
  let offset = 0;
  const view = new DataView(patch.buffer);
  while (offset < patch.length) {
    const dest = view.getUint32(offset, little);
    const length = view.getUint16(offset + 4, little);
    offset += 6;
    rom.set(patch.slice(offset, offset + length), dest);
    offset += length;
  }
}
