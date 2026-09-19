use core::ops::ControlFlow;

use embassy_rp::gpio::Output;
use embassy_time::Delay;

use embedded_hal_bus::spi::ExclusiveDevice;

use embedded_sdmmc::{
    Mode,
    RawDirectory,
    RawVolume,
    SdCard as EmbeddedSdCard,
    TimeSource,
    Timestamp,
    VolumeIdx,
    VolumeManager,
};

use xpanse_api::bus::spi::SpiBusHandle;

use crate::SdCard;

pub type SdSpiDevice =
    ExclusiveDevice<SpiBusHandle, Output<'static>, Delay>;

pub type SdBlockDevice =
    EmbeddedSdCard<SdSpiDevice, Delay>;


pub const MAX_DIRS: usize = 4;
pub const MAX_FILES: usize = 4;
pub const MAX_VOLUMES: usize = 1;


pub struct SdTime;

impl TimeSource for SdTime {
    fn get_timestamp(&self) -> Timestamp {
        Timestamp {
            year_since_1970: 56,
            zero_indexed_month: 7,
            zero_indexed_day: 27,
            hours: 0,
            minutes: 0,
            seconds: 0,
        }
    }
}


pub type SdVolumeManager =
    VolumeManager<
        SdBlockDevice,
        SdTime,
        MAX_DIRS,
        MAX_FILES,
        MAX_VOLUMES,
    >;


pub fn create_filesystem(sd: SdCard) -> SdVolumeManager {
    let spi_device = ExclusiveDevice::new(
        sd.spi,
        sd.cs,
        Delay,
    )
    .expect("Failed to create SPI device for SD card");

    let sd_card = EmbeddedSdCard::new(
        spi_device,
        Delay,
    );

    VolumeManager::new(
        sd_card,
        SdTime,
    )
}


pub fn open_volume(
    fs: &SdVolumeManager,
) -> Result<
    RawVolume,
    embedded_sdmmc::Error<
        <SdBlockDevice as embedded_sdmmc::BlockDevice>::Error,
    >,
> {
    fs.open_raw_volume(VolumeIdx(0))
}


pub fn open_root(
    fs: &SdVolumeManager,
    volume: RawVolume,
) -> Result<
    RawDirectory,
    embedded_sdmmc::Error<
        <SdBlockDevice as embedded_sdmmc::BlockDevice>::Error,
    >,
> {
    fs.open_root_dir(volume)
}

pub fn read_file(
    fs: &SdVolumeManager,
    root_dir: RawDirectory,
    file_name: &str,
    buffer: &mut [u8],
) -> Result<
    usize,
    embedded_sdmmc::Error<
        <SdBlockDevice as embedded_sdmmc::BlockDevice>::Error,
    >,
> {
    let file = fs.open_file_in_dir(
        root_dir,
        file_name,
        Mode::ReadOnly,
    )?;

    let bytes_read = fs.read(
        file,
        buffer,
    )?;

    fs.close_file(file)?;

    Ok(bytes_read)
}


pub fn write_file(
    fs: &SdVolumeManager,
    root_dir: RawDirectory,
    file_name: &str,
    data: &[u8],
) -> Result<
    usize,
    embedded_sdmmc::Error<
        <SdBlockDevice as embedded_sdmmc::BlockDevice>::Error,
    >,
> {
    let file = fs.open_file_in_dir(
        root_dir,
        file_name,
        Mode::ReadWriteCreateOrTruncate,
    )?;

    fs.write(
        file,
        data,
    )?;

    fs.close_file(file)?;

    Ok(data.len())
}

pub fn list_root(
    fs: &SdVolumeManager,
    root_dir: RawDirectory,
) -> Result<
    (),
    embedded_sdmmc::Error<
        <SdBlockDevice as embedded_sdmmc::BlockDevice>::Error,
    >,
> {
    fs.iterate_dir(
        root_dir,
        |_entry| {
            ControlFlow::Continue(())
        },
    )?;

    Ok(())
}


pub fn close_filesystem(
    fs: &SdVolumeManager,
    volume: RawVolume,
    root_dir: RawDirectory,
) -> Result<
    (),
    embedded_sdmmc::Error<
        <SdBlockDevice as embedded_sdmmc::BlockDevice>::Error,
    >,
> {
    fs.close_dir(root_dir)?;
    fs.close_volume(volume)?;

    Ok(())
}
