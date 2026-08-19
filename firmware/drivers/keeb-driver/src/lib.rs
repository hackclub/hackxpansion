#![no_std]

use xpanse_api::{
    bus::allocator::BusAllocator,
    driver::{Driver, DriverError, DriverMeta},
    gpio_bank::{BankPins, GpioBank},
    interfaces::buttons::{A, pin_button},
    interfaces::leds::{Generic, pin_led},
    metadata::{ModuleDetectResistor, ModuleID, ModuleSlot},
    registry::Registry,
};


// Each driver is a struct, that impls the Driver and DriverMeta trait
//
// This struct should stay zero sized
pub struct KeebDriver;

// This trait allows the main firmware to know when should it load this driver,
// on what resistor combination
impl DriverMeta for KeebDriver {
    const ID: ModuleID = ModuleID {
        md0: ModuleDetectResistor::R1K6,
        md1: ModuleDetectResistor::R1K5,
    };
}

// This is where the actual business logic happens
impl<G: BankPins> Driver<G> for KeebDriver {
    async fn create(
        // Each driver gets a bank of GPIO pins it can work with, GPIO0 through GPIO10
        gpio_bank: GpioBank<G>,
        // They also get some data about which slot they are in
        slot: ModuleSlot,
        // They also get access to the registry, where they can add peripherals which
        // apps will be able to use. I'll explain this later more in depth
        registry: &mut Registry,
        // They also get access to a bus allocator, since the RP2354 only
        // has 2 I2C, 2 SPI and 2 UART peripherals, not every module can
        // get its own hardware UART for example. I'll also explain this later more in depth
        bus_allocator: &mut BusAllocator,
    ) -> Result<(), DriverError> {

        // Here we add an A button to the registry
        registry.register(
            slot,
            KeebDriver::ID,
            pin_button::<A>(gpio_bank.gpio0.into()),
        );

        // Register LEDs on GPIO1, GPIO2, GPIO3
        registry.register(
            slot,
            KeebDriver::ID,
            pin_led::<Generic>(gpio_bank.gpio1.into(), false),
        );

        registry.register(
            slot,
            KeebDriver::ID,
            pin_led::<Generic>(gpio_bank.gpio2.into(), false),
        );

        registry.register(
            slot,
            KeebDriver::ID,
            pin_led::<Generic>(gpio_bank.gpio3.into(), false),
        );

        // we don't use any busses
        let _ = bus_allocator;

        // You can also spawn new tasks here which run on core 1
        // Apps and resource method calls run on core 0, so you can use both cores
        // Use embassy sync types to communicate between tasks

        Ok(())
    }
}