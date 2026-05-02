'use strict';

import { ModbusResult } from '../../modbus/reader';
import BaseDriver from '../baseMobusDriver';

type PanelDeviceLike = {
  setPvOnOff(v: boolean): Promise<void>;
  getCapabilityValue(cap: string): unknown;
};

class PanelsDriver extends BaseDriver {

  getName(data: ModbusResult) {
    return 'Modbus Solarpanels';
  }

  async onInit() {
    this.homey.flow.getActionCard('set_panels_onoff')
      .registerRunListener(async (args: { device: PanelDeviceLike, onoff: string }) => {
        await args.device.setPvOnOff(args.onoff === 'true');
      });

    this.homey.flow.getConditionCard('panels_is_on')
      .registerRunListener(async (args: { device: PanelDeviceLike }) => {
        return args.device.getCapabilityValue('onoff') === true;
      });
  }

}

module.exports = PanelsDriver;
