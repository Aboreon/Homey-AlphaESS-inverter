'use strict';

import { ModbusResult } from '../../modbus/reader';
import BaseDriver from '../baseMobusDriver';

type BatteryDeviceLike = {
  setDispatchEnabled(v: boolean): Promise<void>;
  setDispatchMode(v: string): Promise<void>;
  setDispatchSoc(v: number): Promise<void>;
  setDispatchActivePower(v: number): Promise<void>;
  getCapabilityValue(cap: string): unknown;
};

class BatteryDriver extends BaseDriver {

  getName(data: ModbusResult) {
    return data['0x11A'].value_name || 'Battery';
  }

  async onInit() {
    this.homey.flow.getActionCard('set_dispatch_enabled')
      .registerRunListener(async (args: { device: BatteryDeviceLike, enabled: string }) => {
        await args.device.setDispatchEnabled(args.enabled === 'true');
      });

    this.homey.flow.getActionCard('set_dispatch_mode')
      .registerRunListener(async (args: { device: BatteryDeviceLike, mode: string }) => {
        await args.device.setDispatchMode(args.mode);
      });

    this.homey.flow.getActionCard('set_dispatch_soc')
      .registerRunListener(async (args: { device: BatteryDeviceLike, soc: number }) => {
        await args.device.setDispatchSoc(args.soc);
      });

    this.homey.flow.getActionCard('set_dispatch_active_power')
      .registerRunListener(async (args: { device: BatteryDeviceLike, power: number }) => {
        await args.device.setDispatchActivePower(args.power);
      });

    this.homey.flow.getConditionCard('dispatch_enabled_is')
      .registerRunListener(async (args: { device: BatteryDeviceLike }) => {
        return args.device.getCapabilityValue('dispatch_enabled') === true;
      });

    this.homey.flow.getConditionCard('dispatch_mode_is')
      .registerRunListener(async (args: { device: BatteryDeviceLike, mode: string }) => {
        return args.device.getCapabilityValue('dispatch_mode') === args.mode;
      });

    this.homey.flow.getConditionCard('dispatch_active_power_is')
      .registerRunListener(async (args: { device: BatteryDeviceLike, power: number }) => {
        return (args.device.getCapabilityValue('dispatch_active_power') as number) > args.power;
      });
  }

}

module.exports = BatteryDriver;
