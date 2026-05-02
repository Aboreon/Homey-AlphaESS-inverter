'use strict';

import { EventEmitter } from 'events';
import { ModbusReader } from './reader';

const INTERVAL = 10 * 1000;

export default class ModbusEventEmitter extends EventEmitter {

  reader;
  pollingTask: string | number | NodeJS.Timeout | undefined;

  constructor(host: string, port?: number) {
    super();
    this.reader = new ModbusReader(host, port);
  }

  id() {
    return `${this.reader.host}:${this.reader.port}`;
  }

  isPolling() {
    return !!this.pollingTask;
  }

  stop() {
    clearInterval(this.pollingTask);
    this.pollingTask = undefined;
    this.reader.close();
  }

  start(interval = INTERVAL) {
    if (this.pollingTask) {
      clearInterval(this.pollingTask);
      this.pollingTask = undefined;
    }

    // eslint-disable-next-line homey-app/global-timers, @typescript-eslint/no-misused-promises
    this.pollingTask = setInterval(this.poll.bind(this), interval);
  }

  async readOnce() {
    return this.reader.readOnce();
  }

  async poll() {
    try {
      const result = await this.reader.readOnce();
      this.emit('data', result);
    } catch (e) {
      this.emit('error', e);
    }
  }

  async write(register: string, value: number, len: number = 1) {
    await this.reader.writeOnce(register, value, len);
    await this.poll();
  }

}
