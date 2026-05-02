'use strict';

import { Device } from 'homey';
import Mutex from '../utils/mutex';
import ModbusEventEmitter from '../modbus/emitter';
import { ModbusResult } from '../modbus/reader';

const EMITTERS: { [key: string]: { count: number, instance: ModbusEventEmitter } } = {};
const mutex = new Mutex();

async function getInstance(name: string, construct: () => ModbusEventEmitter) {
  const unlock = await mutex.lock();
  try {
    const inst = EMITTERS[name];
    if (inst) {
      inst.count += 1;
      return inst.instance;
    }

    const newInst = construct();

    EMITTERS[name] = {
      count: 1,
      instance: newInst,
    };

    return newInst;
  } finally {
    unlock();
  }
}

async function destroyInstance(name: string) {
  const unlock = await mutex.lock();
  try {
    const inst = EMITTERS[name];
    inst.count -= 1;

    if (inst.count === 0) {
      inst.instance.stop();
      delete EMITTERS[name];
    }
  } finally {
    unlock();
  }
}

export function getExistingEmitter(name: string): ModbusEventEmitter | undefined {
  return EMITTERS[name]?.instance;
}

export default class ModbusBaseDevice extends Device {

  emitter?: ModbusEventEmitter;
  errorEmitter?: (e: unknown) => void;
  dataEmitter?: (data: unknown) => unknown;

  async checkCapabilites(list: string[]) {
    this.log('Checking capabilities', list);

    await Promise.all(list.map((e) => {
      if (!this.hasCapability(e)) {
        this.log('Adding capability', e);
        return this.addCapability(e);
      }

      return null;
    }));
  }

  async onInit() {
    this.log('Device has been initialized');
    await this.startPolling();
  }

  async onSettings(/* { oldSettings, newSettings, changedKeys } */) {
    await this.startPolling();
  }

  async cleanup() {
    // Clear any existing intervals
    if (this.emitter) {
      this.emitter.off('error', this.errorEmitter!);
      this.emitter.off('data', this.dataEmitter!);

      await destroyInstance(this.emitter.id());

      this.emitter = undefined;
    }
  }

  async startPolling() {
    await this.cleanup();

    const host = (this.getSetting('hostname') || this.homey.settings.get('hostname')).toLowerCase();
    const port = this.getSetting('port') || this.homey.settings.get('port');

    let interval = parseInt(this.getSetting('interval'), 10) || 10;
    if (Number.isNaN(interval) || interval <= 1) {
      interval = 1;
    }

    const emitterName = `${host}:${port}`;
    this.emitter = await getInstance(emitterName, () => new ModbusEventEmitter(host, port));

    this.errorEmitter = (e) => {
      this.error(e);
    };

    this.dataEmitter = async (data) => {
      // this.log(data);
      this.log('Received data');
      await this.setCapabilities(data as ModbusResult);
    };

    this.emitter.on('error', this.errorEmitter);
    this.emitter.on('data', this.dataEmitter);

    if (!this.emitter.isPolling()) {
      this.emitter.start(interval * 1000);
    }
  }

  // eslint-disable-next-line no-empty-function
  async setCapabilities(data: ModbusResult) { }

  onDeleted() {
    this.log('Device has been deleted');

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.cleanup();
  }

}
