'use strict';

import { Socket } from 'net';
import { ModbusTCPClient } from 'jsmodbus';
import Mutex from '../utils/mutex';

type Register = {
  intRegister: number,
  register: string,
  // eslint-disable-next-line camelcase
  name_en: string,
  unit: string,
  type: 'string' | 'uint16be' | 'int16be' | 'uint32be' | 'int32be',
  len: number,
  factor: number,
  rw?: boolean,
  bits?: string[],
  enum?: {
    value: number,
    // eslint-disable-next-line camelcase
    name_en: string,
  }[],
  // eslint-disable-next-line camelcase
  frontend_type: 'state' | 'enum' | 'bits'
}

const DEFAULT_REGISTERS: Register[] = require('./register.json');

const UNIT_ID = 85;
const PORT = 502;
const CONNECT_TIMEOUT_MS = 5000;
const CONNECT_RETRIES = 4;
const CONNECT_RETRY_DELAY_MS = 750;
const RETRYABLE_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'EPIPE']);

function delay(ms: number) {
  return new Promise((resolve) => {
    // eslint-disable-next-line homey-app/global-timers
    setTimeout(resolve, ms);
  });
}

function dec2bin(dec: number) {
  return (dec >>> 0).toString(2);
}

export type ModbusResult = {
  [details: string]: {
    name: string,
    unit: string,
    value?: string | null | number,
    // eslint-disable-next-line camelcase
    value_string?: string,
    // eslint-disable-next-line camelcase
    value_name?: string,
  };
}

export class ModbusReader {

  port;
  host;

  private socket: Socket | null = null;
  private client: ModbusTCPClient | null = null;
  private connecting: Promise<ModbusTCPClient> | null = null;
  private mutex = new Mutex();

  constructor(host: string, port: number = PORT) {
    this.host = host;
    this.port = port || PORT;
  }

  private resetConnection() {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch (_e) {
        // ignore
      }
    }
    this.socket = null;
    this.client = null;
    this.connecting = null;
  }

  private async getClient(): Promise<ModbusTCPClient> {
    if (this.client && this.socket && !this.socket.destroyed) {
      return this.client;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      let lastErr: Error | undefined;
      for (let attempt = 0; attempt < CONNECT_RETRIES; attempt += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          return await this.connectOnce();
        } catch (e) {
          lastErr = e as Error;
          const { code } = (e as NodeJS.ErrnoException);
          if (!code || !RETRYABLE_CODES.has(code) || attempt === CONNECT_RETRIES - 1) {
            throw e;
          }
          // eslint-disable-next-line no-await-in-loop
          await delay(CONNECT_RETRY_DELAY_MS * (attempt + 1));
        }
      }
      throw lastErr ?? new Error('Failed to connect');
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connectOnce(): Promise<ModbusTCPClient> {
    return new Promise<ModbusTCPClient>((resolve, reject) => {
      const socket = new Socket();
      const client = new ModbusTCPClient(socket, UNIT_ID);

      const onError = (err: Error) => {
        socket.removeAllListeners();
        socket.destroy();
        this.socket = null;
        this.client = null;
        reject(err);
      };

      socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
        const err = new Error(`Connect timeout to ${this.host}:${this.port}`) as NodeJS.ErrnoException;
        err.code = 'ETIMEDOUT';
        onError(err);
      });

      socket.once('error', onError);

      socket.once('connect', () => {
        socket.setTimeout(0);
        socket.removeListener('error', onError);

        // Once connected, drop the cached client on any later error/close.
        socket.on('error', () => this.resetConnection());
        socket.on('close', () => this.resetConnection());

        this.socket = socket;
        this.client = client;
        resolve(client);
      });

      socket.connect({
        host: this.host,
        port: this.port,
      });
    });
  }

  async readOnce(registers = DEFAULT_REGISTERS): Promise<ModbusResult> {
    const unlock = await this.mutex.lock();
    try {
      const client = await this.getClient();
      const result: ModbusResult = {};

      for (const reg of registers) {
        // eslint-disable-next-line radix
        const res = await client.readHoldingRegisters(parseInt(reg.register), reg.len);
        let val: string | number | null = null;

        switch (reg.type) {
          case 'string':
            val = res.response.body.valuesAsBuffer.toString().replace(/\0/ig, '');
            break;

          case 'uint16be':
            val = res.response.body.valuesAsBuffer.readUint16BE();
            break;

          case 'int16be':
            val = res.response.body.valuesAsBuffer.readInt16BE();
            break;

          case 'uint32be':
            val = res.response.body.valuesAsBuffer.readUint32BE();
            break;

          case 'int32be':
            val = res.response.body.valuesAsBuffer.readInt32BE();
            break;

          default:
            throw new Error(`Unkonw type ${reg.type}`);
        }

        result[reg.register] = {
          name: reg.name_en,
          unit: reg.unit,
        };

        if (reg.type === 'string') {
          result[reg.register].value = val;
        }

        if (reg.frontend_type === 'bits') {
          const bitstr = dec2bin(val as number).padStart(reg.len * 16, '0');

          result[reg.register].value = bitstr;
          result[reg.register].value_string = reg.bits?.map((e, i) => {
            return bitstr[bitstr.length - i - 1] === '1' ? e : null;
          }).filter((e) => e).join(',');
        } else if (reg.frontend_type === 'enum') {
          const enumVal = reg.enum?.find((e) => e.value === val);
          result[reg.register].value = val;
          result[reg.register].value_name = enumVal ? enumVal.name_en : val?.toString();
        } else {
          result[reg.register].value = (val as number) * (reg.factor ?? 1);
        }
      }

      return result;
    } catch (e) {
      this.resetConnection();
      throw e;
    } finally {
      unlock();
    }
  }

  async writeOnce(register: string, value: number, len: number = 1): Promise<void> {
    const unlock = await this.mutex.lock();
    try {
      const client = await this.getClient();
      // eslint-disable-next-line radix
      const addr = parseInt(register);
      if (len > 1) {
        const buf = Buffer.alloc(len * 2);
        buf.writeInt32BE(value, 0);
        await client.writeMultipleRegisters(addr, buf);
      } else {
        await client.writeSingleRegister(addr, value);
      }
    } catch (e) {
      this.resetConnection();
      throw e;
    } finally {
      unlock();
    }
  }

  close() {
    this.resetConnection();
  }

}
