'use strict';

import { Driver } from 'homey';
import { ModbusReader, ModbusResult } from '../modbus/reader';
import { getExistingEmitter } from './baseModbusDevice';

export default class BaseDriver extends Driver {

  getName(data: ModbusResult) {
    return data['0x64A'].value || 'Unknown';
  }

  async onPairListDevices(): Promise<unknown[]> {
    try {
      const device = await this.fetchinvdata();
      this.log('onPairListDevices', device);

      // Map API response to Homey device objects
      return [
        {
          name: this.getName(device),
          data: {
            id: device['0x64A']?.value,
          },
          settings: {
            hostname: this.homey.settings.get('hostname'),
            port: this.homey.settings.get('port'),
          },
        },
      ];
    } catch (error) {
      this.log('Failed to list devices:', error);
      throw new Error('Failed to list devices');
    }
  }

  async fetchinvdata() {
    const host = this.homey.settings.get('hostname');
    const port = this.homey.settings.get('port');

    this.log('Connecting to', host, port);

    // Reuse existing shared connection if available (inverter only allows one TCP connection)
    const emitterName = `${host.toLowerCase()}:${port}`;
    const existingEmitter = getExistingEmitter(emitterName);
    if (existingEmitter) {
      this.log('Reusing existing shared connection for pairing');
      return existingEmitter.readOnce();
    }

    const reader = new ModbusReader(host, port);
    try {
      return await reader.readOnce();
    } finally {
      reader.close();
    }
  }

}
