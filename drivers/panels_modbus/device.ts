'use strict';

import { ModbusResult } from '../../modbus/reader';
import BaseDevice from '../baseModbusDevice';
import config from './driver.compose.json';

const REG_PV_ONOFF = '0x88A';

class PanelDevice extends BaseDevice {

  async setPvOnOff(val: boolean) {
    await this.emitter?.write(REG_PV_ONOFF, val ? 1 : 2);
    await this.setCapabilityValue('onoff', val);
  }

  async onInit() {
    await this.checkCapabilites(config.capabilities);
    await super.onInit();

    this.registerCapabilityListener('onoff', (val: boolean) => this.setPvOnOff(val));
  }

  async setCapabilities(data: ModbusResult) {
    const total = (data['0x41F'].value as number)
      + (data['0x423'].value as number)
      + (data['0x427'].value as number)
      + (data['0x429'].value as number);

    const pvOn = data[REG_PV_ONOFF]?.value === 1;
    const prevOnOff = this.getCapabilityValue('onoff');

    await Promise.all([
      this.setCapabilityValue('onoff', pvOn),

      this.setCapabilityValue('measure_power', total),

      this.setCapabilityValue('measure_power.ppv1', data['0x41F'].value),
      this.setCapabilityValue('measure_power.ppv2', data['0x423'].value),
      this.setCapabilityValue('measure_power.ppv3', data['0x427'].value),
      this.setCapabilityValue('measure_power.ppv4', data['0x429'].value),

      this.setCapabilityValue('measure_temperature', data['0x435'].value),

      this.setCapabilityValue('meter_power', data['0x43E'].value),
    ]);

    if (prevOnOff !== pvOn) {
      await this.homey.flow
        .getDeviceTriggerCard('panels_onoff_changed')
        .trigger(this, { onoff: pvOn }, {})
        .catch((e: Error) => this.error('Trigger panels_onoff_changed failed', e.message));
    }
  }

}

module.exports = PanelDevice;
