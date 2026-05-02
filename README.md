# AlphaESS

This app allows you to integrate Alpha-ESS data into Homey. You can choose between two connection methods: the Alpha-ESS Open API or a local Modbus connection. This flexibility ensures you can utilize the app according to your preferences and technical setup.

## Features

- **API Integration:** The app connects to Alpha-ESS via their open API. Learn more: [Alpha-ESS Open API](https://open.alphaess.com/).
- **Local Modbus Connection (New):** Connect to your Alpha-ESS system locally via Modbus for extended functionality. In this setup, you only need to add the IP address or hostname in the app's settings.

## Setup Instructions

### Using the Alpha-ESS Open API
1. Create an account at [Alpha-ESS Open API](https://open.alphaess.com/).
2. Add your system to the account:
   - Click "Add."
   - Enter the Serial Number and CheckCode (found on your inverter).
   - Click "Get Verification Code" and input the code sent to your email.
   - Note down the **AppId** and **AppSecret**.
3. Install the Alpha-ESS app from Homey: [Alpha-ESS App](https://homey.app/nl-nl/app/nl.aboreaon.alpaess/AlphaESS/).
4. Open the app in Homey and configure it:
   - Input your **AppId** and **AppSecret**.
5. Add the device to your setup.

### Using the Local Modbus Connection
1. Ensure your Alpha-ESS inverter supports Modbus communication.
2. Locate the local IP address or hostname of your inverter.
3. Install the Alpha-ESS app from Homey: [Alpha-ESS App](https://homey.app/nl-nl/app/nl.aboreaon.alpaess/AlphaESS/).
4. Open the app in Homey and configure it:
   - Input your **Hostname** and **Port**.
5. Add the device to your setup.

## Modbus Dispatch Function

The dispatch function allows you to remotely control how your AlphaESS battery system operates via Modbus. This is exposed through the **battery** device in the Modbus connection mode.

### Dispatch Modes

| Value | Mode | Description |
|-------|------|-------------|
| 1 | Battery only charges from PV | Battery will not charge from the grid. |
| 2 | SOC control | Charge/Discharge battery to the target SOC percentage. |
| 3 | Load following | Battery follows home load demand. |
| 4 | Maximise output | Maximise power output from the battery. |
| 5 | Normal mode | Default inverter behaviour. |
| 6 | Optimise consumption | Optimise self-consumption of PV power. |
| 7 | Maximise consumption | Maximise consumption ( In some models this forces PV off automatically). |
| 8 | Eco mode | Economy mode — balances grid and battery usage. |
| 9 | FCAS mode | Frequency Control Ancillary Services mode. |
| 10 | PV power setting | Directly control PV power output. |

### Flow Cards

The following Homey flow cards are available for the battery device:

**Triggers:**
- Dispatch mode enabled changed
- Dispatch mode changed
- Dispatch target SOC changed
- Dispatch active power changed

**Conditions:**
- Dispatch is/isn't enabled
- Dispatch mode is/isn't [mode]
- Dispatch active power is/isn't greater than [power] W

**Actions:**
- Set dispatch enabled/disabled
- Set dispatch mode
- Set dispatch target SOC
- Set dispatch active power

### Dispatch Active Power

Controls the dispatch active power. It is an `int32` register with a 32000 offset:

- **Raw value < 32000** → battery is charging (negative watts)
- **Raw value = 32000** → idle (0 W)
- **Raw value > 32000** → battery is discharging (positive watts)

The app handles the offset automatically — you work with actual watts in the range **-32000 W** (charge) to **+32000 W** (discharge).

> **Important:** The dispatch function must be enabled for the active power register to take effect. If dispatch is not enabled, writing to this register will have no effect.

### PV On/Off

The modbus solar panels device exposes an on/off switch via Modbus register `0x088A`. This allows you to remotely enable or disable PV power generation. Is useful when the electricity price is negative. 

> **Important:** The dispatch function must be enabled for the PV on/off register to take effect. If dispatch is not enabled, writing to this register will have no effect.

### Flow Cards

The following Homey flow cards are available for the solar panels device.
These settings do not check if dispatch mode is enabled, wich is necesarry to make this setting effectful. 

**Triggers:**
- Solar panels turned on or off

**Conditions:**
- Solar panels are/aren't on

**Actions:**
- Turn solar panels on or off

