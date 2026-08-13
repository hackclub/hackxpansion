# Connector Pinout

Use the KiCAD footprints, symbols and the [`GpioBank`](https://docs.rs/xpanse-api/latest/xpanse_api/gpio_bank/struct.GpioBank.html) type as reference.

Also here is a pin function table:

| PIN NR | FUNCTION1 | FUNCTION2 | FUNCTION3    |
| ------ | --------- | --------- | ------------ |
| 1      | GND       |           |              |
| 2      | 3V3       |           |              |
| 3      | MD0       |           |              |
| 4      | MD1       |           |              |
| 5      | GPIO0     | I2C_SCL   |              |
| 6      | GPIO1     | I2C_SDA   |              |
| 7      | GPIO2     | SPI_SCK   | PWM_SLICE2_A |
| 8      | GPIO3     | SPI_MISO  |              |
| 9      | GPIO4     | SPI_MOSI  |              |
| 10     | GPIO5     | UART_TX   | PWM_SLICE1_A |
| 11     | GPIO6     | UART_RX   | PWM_SLICE1_B |
| 12     | GPIO7     | ADC0      | PWM_SLICE0_A |
| 13     | GPIO8     | ADC1      | PWM_SLICE0_B |
| 14     | GPIO9     |           |              |

_MDx_ - module detect

![footprint with numbers](https://cdn.hackclub.com/019ffc57-0079-7785-9443-97a5a4c47c83/image.png)
![header](https://cdn.hackclub.com/019ffc58-e0e1-766a-9f70-7710009c73bd/image.png)
