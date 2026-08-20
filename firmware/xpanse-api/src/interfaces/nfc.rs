//! NFC device interfaces.
//!
//! Provides NFC device capabilities that drivers can publish through the
//! [`crate::registry::Registry`] and that apps can use to read/write NFC tags.
//! Transport-agnostic: supports I2C, SPI, or other backends.

use alloc::boxed::Box;
use core::future::Future;
use core::pin::Pin;

/// NFC operation error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NfcError {
    /// Communication error (I2C/SPI/etc).
    BusError,
    /// Invalid address or length.
    InvalidAddress,
    /// Device not responding.
    NoDevice,
}

/// Async interface for interacting with an NFC device.
pub trait Nfc: Send {
    /// Read data from the NFC device EEPROM at the specified address.
    ///
    /// # Arguments
    /// * `address` - Starting byte address in the EEPROM.
    /// * `data` - Buffer to read into.
    ///
    /// # Returns
    /// `Ok(())` on success, `Err` on communication failure.
    fn read<'a>(
        &'a mut self,
        address: u16,
        data: &'a mut [u8],
    ) -> Pin<Box<dyn Future<Output = Result<(), NfcError>> + 'a>>;

    /// Write data to the NFC device EEPROM at the specified address.
    ///
    /// # Arguments
    /// * `address` - Starting byte address in the EEPROM.
    /// * `data` - Data to write.
    ///
    /// # Returns
    /// `Ok(())` on success, `Err` on communication failure or write protection.
    fn write<'a>(
        &'a mut self,
        address: u16,
        data: &'a [u8],
    ) -> Pin<Box<dyn Future<Output = Result<(), NfcError>> + 'a>>;

    /// Detect if an NFC field is present.
    ///
    /// Returns `true` if a reader field is currently active.
    fn detect_field<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<bool, NfcError>> + 'a>>;
}

