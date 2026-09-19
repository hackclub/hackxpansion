#![no_std]
pub mod filesystem;
use embassy_rp::{
    bind_interrupts,
    gpio::{Level, Output},
    peripherals::{DMA_CH0, DMA_CH1, SPI0},
    spi::{self, ClkPin, MisoPin, MosiPin},
};

use xpanse_api::{
    bus::{
        allocator::BusAllocator,
        spi::SpiBusHandle,
    },
    driver::{Driver, DriverError, DriverMeta},
    gpio_bank::{BankPins, GpioBank},
    interfaces::buttons::{pin_button, A, B, X},
    metadata::{ModuleDetectResistor, ModuleID, ModuleSlot},
    registry::Registry,
};

// Both DMA_CH0 and DMA_CH1 use DMA_IRQ_0 on the RP235x.
bind_interrupts!(pub struct Irqs {
    DMA_IRQ_0 =>
        embassy_rp::dma::InterruptHandler<DMA_CH0>,
        embassy_rp::dma::InterruptHandler<DMA_CH1>;
});

pub struct SdCard {
    pub spi: SpiBusHandle,
    pub cs: Output<'static>,
}

pub struct SdCardDriver;

impl DriverMeta for SdCardDriver {
    const ID: ModuleID = ModuleID {
        md0: ModuleDetectResistor::R1K,
        md1: ModuleDetectResistor::R30K,
    };
}

impl<G> Driver<G> for SdCardDriver
where
    G: BankPins,
    G::GPIO2: ClkPin<SPI0>,
    G::GPIO3: MisoPin<SPI0>,
    G::GPIO4: MosiPin<SPI0>,
{
    async fn create(
        gpio_bank: GpioBank<G>,
        slot: ModuleSlot,
        registry: &mut Registry,
        bus_allocator: &mut BusAllocator,
    ) -> Result<(), DriverError> {

        // -------------------------
        // Buttons
        // -------------------------

        registry.register(
            slot,
            Self::ID,
            pin_button::<A>(gpio_bank.gpio5.into()),
        );

        registry.register(
            slot,
            Self::ID,
            pin_button::<B>(gpio_bank.gpio6.into()),
        );

        registry.register(
            slot,
            Self::ID,
            pin_button::<X>(gpio_bank.gpio7.into()),
        );

        // -------------------------
        // SPI
        //
        // GPIO2 = SCK
        // GPIO3 = MISO
        // GPIO4 = MOSI
        // GPIO9 = CS
        // -------------------------

        let spi = bus_allocator
            .create_spi_hardware::<SPI0, DMA_CH0, DMA_CH1, _>(
                gpio_bank.gpio2, // SCK
                gpio_bank.gpio4, // MOSI
                gpio_bank.gpio3, // MISO
                Irqs,
                spi::Config::default(),
            )
            .map_err(|_| DriverError::InitFailed)?;

        // SD card chip select.
        //
        // SD cards are selected when CS is LOW, so we start
        // deselected with CS HIGH.
        let cs = Output::new(
            gpio_bank.gpio9,
            Level::High,
        );

        // -------------------------
        // Register SD card resource
        // -------------------------

        registry.register(
            slot,
            Self::ID,
            SdCard {
                spi,
                cs,
            },
        );

        Ok(())
    }
}
