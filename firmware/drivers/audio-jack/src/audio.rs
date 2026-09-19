
use embassy_rp::{
    bind_interrupts,
    dma,
    gpio::{Level, Output},
    i2c,
    peripherals::{DMA_CH0, I2C0},
    pio_programs::{
        clk::{PioClk, PioClkProgram},
        i2s::{PioI2sOut, PioI2sOutProgram},
    },
};

use embedded_hal_async::i2c::I2c;

use xpanse_api::{
    with_pio,
    bus::allocator::BusAllocator,
    driver::{Driver, DriverError, DriverMeta},
    gpio_bank::{BankPins, GpioBank},
    interfaces::buttons::{
        pin_button,
        A,
        B,
        X,
    },
    metadata::{ModuleDetectResistor, ModuleID, ModuleSlot},
    registry::Registry,
};

const DAC_ADDRESS: u8 = 0x18;

const SAMPLE_RATE: u32 = 48_000;
const BIT_DEPTH: u32 = 16;
const MCLK_FREQUENCY: u32 = 12_288_000;

bind_interrupts!(struct I2cIrqs {
    I2C0_IRQ => embassy_rp::i2c::InterruptHandler<I2C0>;
});

bind_interrupts!(struct AudioDmaIrqs {
    DMA_IRQ_0 => dma::InterruptHandler<DMA_CH0>;
});

pub struct AudioDriver;

impl DriverMeta for AudioDriver {
    const ID: ModuleID = ModuleID {
        md0: ModuleDetectResistor::R1K,
        md1: ModuleDetectResistor::R62K,
    };
}

impl<G> Driver<G> for AudioDriver
where
    G: BankPins,
    G::GPIO0: embassy_rp::i2c::SclPin<I2C0>,
    G::GPIO1: embassy_rp::i2c::SdaPin<I2C0>,
{
    async fn create(
        bank: GpioBank<G>,
        slot: ModuleSlot,
        registry: &mut Registry,
        buses: &mut BusAllocator,
    ) -> Result<(), DriverError> {
 
        let mut reset = Output::new(
            bank.gpio6,
            Level::Low,
        );

        embassy_time::Timer::after_millis(5).await;

        reset.set_high();

        embassy_time::Timer::after_millis(10).await;


        core::mem::forget(reset);

        let mut i2c_bus = buses
            .create_i2c_hardware::<I2C0, _>(
                bank.gpio0,
                bank.gpio1,
                I2cIrqs,
                i2c::Config::default(),
            )
            .map_err(|_| DriverError::InitFailed)?;

 
        dac_write(
            &mut i2c_bus,
            0x00,
            0x01,
        )
        .await?;

        embassy_time::Timer::after_millis(10).await;


        configure_dac(&mut i2c_bus).await?;


        registry.register(
            slot,
            Self::ID,
            pin_button::<A>(bank.gpio7.into()),
        );

        registry.register(
            slot,
            Self::ID,
            pin_button::<B>(bank.gpio8.into()),
        );

        registry.register(
            slot,
            Self::ID,
            pin_button::<X>(bank.gpio9.into()),
        );

        let dma = buses
            .request_dma::<DMA_CH0>()
            .map_err(|_| DriverError::InitFailed)?;

      
        let mclk_pio = buses
            .request_pio(&[
                &bank.gpio5,
            ])
            .ok_or(DriverError::InitFailed)?;

        with_pio!(
            mclk_pio,
            mclk_common,
            mclk_sm,
            {
                let mclk_program = PioClkProgram::new(
                    &mut *mclk_common,
                );

                let mut mclk = PioClk::new(
                    &mut *mclk_common,
                    mclk_sm,
                    bank.gpio5,
                    &mclk_program,
                    MCLK_FREQUENCY,
                );

          
                mclk.start();

                
                core::mem::forget(mclk);
            }
        );

     
        let i2s_pio = buses
            .request_pio(&[
                &bank.gpio2,
                &bank.gpio3,
                &bank.gpio4,
            ])
            .ok_or(DriverError::InitFailed)?;

        with_pio!(
            i2s_pio,
            i2s_common,
            i2s_sm,
            {
                let i2s_program = PioI2sOutProgram::new(
                    &mut *i2s_common,
                );

                let mut i2s = PioI2sOut::new(
                    &mut *i2s_common,
                    i2s_sm,
                    dma,
                    AudioDmaIrqs,
                    bank.gpio3, 
                    bank.gpio2, 
                    bank.gpio4, 
                    SAMPLE_RATE,
                    BIT_DEPTH,
                    &i2s_program,
                );

                i2s.start();

         
                registry.register(
                    slot,
                    Self::ID,
                    i2s,
                );
            }
        );

        Ok(())
    }
}

async fn dac_write<I>(
    i2c: &mut I,
    register: u8,
    value: u8,
) -> Result<(), DriverError>
where
    I: I2c,
{
    i2c.write(
        DAC_ADDRESS,
        &[register, value],
    )
    .await
    .map_err(|_| DriverError::InitFailed)
}


async fn configure_dac<I>(
    i2c: &mut I,
) -> Result<(), DriverError>
where
    I: I2c,
{
    dac_write(i2c, 0x00, 0x00).await?;

    // CODEC_CLKIN = MCLK
    dac_write(i2c, 0x04, 0x00).await?;

    // NDAC = 8, powered
    dac_write(i2c, 0x0B, 0x88).await?;

    // MDAC = 2, powered
    dac_write(i2c, 0x0C, 0x82).await?;

    // DOSR = 128
    dac_write(i2c, 0x0D, 0x00).await?;
    dac_write(i2c, 0x0E, 0x80).await?;

    // I2S, 16-bit, codec slave
    dac_write(i2c, 0x1B, 0x00).await?;

    dac_write(i2c, 0x00, 0x01).await?;

    // Common-mode voltage
    dac_write(i2c, 0x1F, 0x04).await?;

    // De-pop
    dac_write(i2c, 0x21, 0x4E).await?;

    // LDAC -> HPL
    // RDAC -> HPR
    dac_write(i2c, 0x23, 0x44).await?;

    // HPL unmuted
    dac_write(i2c, 0x28, 0x06).await?;

    // HPR unmuted
    dac_write(i2c, 0x29, 0x06).await?;

    // Power HPL + HPR
    dac_write(i2c, 0x1F, 0xC2).await?;

    // Analog output volume = -9 dB
    dac_write(i2c, 0x24, 0x92).await?;
    dac_write(i2c, 0x25, 0x92).await?;

    dac_write(i2c, 0x00, 0x00).await?;

    // Power DAC L/R + soft stepping
    dac_write(i2c, 0x3F, 0xD4).await?;

    // Digital gain
    dac_write(i2c, 0x41, 0xD4).await?;
    dac_write(i2c, 0x42, 0xD4).await?;

    // Unmute DAC
    dac_write(i2c, 0x40, 0x00).await?;

    Ok(())
}
