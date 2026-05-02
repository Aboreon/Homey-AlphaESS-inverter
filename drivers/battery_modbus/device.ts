'use strict';

import ModbusBaseDevice from '../baseModbusDevice';
import { powerToBatteryState } from '../../utils/batteryState';
import { formatBit } from '../../utils/formatBit';
import { ModbusResult } from '../../modbus/reader';
import config from './driver.compose.json';

const REG_DISPATCH_ENABLED = '0x880';
const REG_DISPATCH_ACTIVE_POWER = '0x881';
const REG_DISPATCH_MODE = '0x885';
const REG_DISPATCH_SOC = '0x886';
const SOC_FACTOR = 0.4;
const ACTIVE_POWER_OFFSET = 32000;

class BatteryDevice extends ModbusBaseDevice {

  async setDispatchEnabled(val: boolean) {
    await this.emitter?.write(REG_DISPATCH_ENABLED, val ? 1 : 0);
    await this.setCapabilityValue('dispatch_enabled', val);
  }

  async setDispatchMode(val: string) {
    await this.emitter?.write(REG_DISPATCH_MODE, parseInt(val, 10));
    await this.setCapabilityValue('dispatch_mode', val);
  }

  async setDispatchSoc(val: number) {
    await this.emitter?.write(REG_DISPATCH_SOC, Math.round(val / SOC_FACTOR));
    await this.setCapabilityValue('dispatch_soc', val);
  }

  async setDispatchActivePower(val: number) {
    await this.emitter?.write(REG_DISPATCH_ACTIVE_POWER, val + ACTIVE_POWER_OFFSET, 2);
    await this.setCapabilityValue('dispatch_active_power', val);
  }

  async onInit() {
    await this.checkCapabilites(config.capabilities);
    await super.onInit();

    this.registerCapabilityListener('dispatch_enabled', (val: boolean) => this.setDispatchEnabled(val));
    this.registerCapabilityListener('dispatch_mode', (val: string) => this.setDispatchMode(val));
    this.registerCapabilityListener('dispatch_soc', (val: number) => this.setDispatchSoc(val));
    this.registerCapabilityListener('dispatch_active_power', (val: number) => this.setDispatchActivePower(val));
  }

  async setCapabilities(data: ModbusResult) {
    const safeSet = async (cap: string, val: unknown) => {
      try {
        const prev = this.getCapabilityValue(cap);
        await this.setCapabilityValue(cap, val as never);
        if (prev !== val && (cap === 'dispatch_enabled' || cap === 'dispatch_mode' || cap === 'dispatch_soc' || cap === 'dispatch_active_power')) {
          await this.homey.flow
            .getDeviceTriggerCard(`${cap}_changed`)
            .trigger(this, { [cap]: val }, {})
            .catch((e: Error) => this.error(`Trigger ${cap}_changed failed`, e.message));
        }
      } catch (e) {
        this.error(`setCapabilityValue ${cap}=${JSON.stringify(val)} failed`, (e as Error).message);
      }
    };

    await Promise.all([
      safeSet('measure_battery', data['0x102'].value),
      safeSet('measure_power', data['0x126'].value),

      safeSet('battery_charging_state', powerToBatteryState(data['0x126'].value as number)),

      safeSet('alarm_battery', data['0x11C'].value !== '00000000000000000000000000000000' || data['0x11E'].value !== '00000000000000000000000000000000'),
      safeSet('alpha_fault_text.warning', formatBit(data['0x11C'].value_string)),
      safeSet('alpha_fault_text.fault', formatBit(data['0x11E'].value_string)),

      safeSet('meter_power.charged', data['0x120'].value),
      safeSet('meter_power.discharged', data['0x122'].value),
      safeSet('meter_power.grid', data['0x124'].value),

      safeSet('dispatch_enabled', data[REG_DISPATCH_ENABLED]?.value === 1),
      safeSet('dispatch_mode', data[REG_DISPATCH_MODE]?.value != null ? String(data[REG_DISPATCH_MODE].value) : null),
      safeSet('dispatch_soc', data[REG_DISPATCH_SOC]?.value),
      safeSet('dispatch_active_power', data[REG_DISPATCH_ACTIVE_POWER]?.value != null ? (data[REG_DISPATCH_ACTIVE_POWER].value as number) - ACTIVE_POWER_OFFSET : null),
    ]);
  }

}

module.exports = BatteryDevice;
