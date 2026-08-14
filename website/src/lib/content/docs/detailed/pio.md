# How to use PIO

PIO (Programmable Input/Output) is a feature of the RP2354 which allows you to write/use peripherals that the MCU never had.

For example the the RP doesn't have a hardware I2S (Inter IC Sound) peripheral. But with PIO we can use a I2S PIO program, provided with embassy, to get near real hardware performance.

## Getting PIO access as a driver

When you are writing a driver you have to use the `BusAllocator` to get a PIO state machine, and then use the `with_pio!` macro to use access the underlying `Common` and state machine:

Pass every pin used by the PIO program to `request_pio` so the allocator can select a GPIO window that covers the complete pin set.

```rust
use xpanse_api::reexports::embassy_rp::pio::{Common, Instance, StateMachine};

fn my_init<PIO: Instance, const N: usize>(
    common: &mut Common<'static, PIO>,
    sm: StateMachine<'static, PIO, N>,
) -> MyDriver<PIO, N> {
    // This can be any pio program
    let program = MyProgram::new(common);
    MyDriver::new(common, sm, &program)
}

// We have to provide all the pins that we want the PIO state machine to
// access, so the allocator can give us the right state machine
let handle = allocator.request_pio(&[&pin1, &pin2])?;
let driver = with_pio!(handle, common, sm, my_init(common, sm));
```
