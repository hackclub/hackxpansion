//! NFC device interfaces.
//!
//! Provides logical NFC device roles that drivers can publish through the
//! [`crate::registry::Registry`] and that apps can use to read/write NFC tags.
//! Each role is a zero-sized marker type; the physical device is wired to
//! a role at startup using `i2c_nfc`.

use alloc::boxed::Box;
use core::future::Future;
use core::marker::PhantomData;
use core::pin::Pin;

use crate::bus::i2c::{I2cBusHandle, I2cError};

mod private {
    pub trait Sealed {}
}

/// Marker trait for a logical NFC device role (e.g. `Generic`).
///
/// The type itself is zero-sized; it exists only to name a resource slot in the
/// [`crate::registry::Registry`].
pub trait NfcRole: private::Sealed + 'static + Send {}

macro_rules! role {
    ($($n:ident),* $(,)?) => {
        $(
            pub struct $n;
            impl private::Sealed for $n {}
            impl NfcRole for $n {}
        )*
    };
}

role!(Generic);

/// Async interface for interacting with an NFC device.
pub trait Nfc<R: NfcRole>: Send {
    /// Read data from the NFC device EEPROM at the specified address.
    ///
    /// # Arguments
    /// * `address` - Starting byte address in the EEPROM.
    /// * `data` - Buffer to read into.
    ///
    /// # Returns
    /// `Ok(())` on success, `Err` on I2C communication failure.
    fn read<'a>(
        &'a mut self,
        address: u16,
        data: &'a mut [u8],
    ) -> Pin<Box<dyn Future<Output = Result<(), I2cError>> + 'a>>;

    /// Write data to the NFC device EEPROM at the specified address.
    ///
    /// # Arguments
    /// * `address` - Starting byte address in the EEPROM.
    /// * `data` - Data to write.
    ///
    /// # Returns
    /// `Ok(())` on success, `Err` on I2C communication failure or write protection.
    fn write<'a>(
        &'a mut self,
        address: u16,
        data: &'a [u8],
    ) -> Pin<Box<dyn Future<Output = Result<(), I2cError>> + 'a>>;

    /// Detect if an NFC field is present.
    ///
    /// Returns `true` if a reader field is currently active.
    fn detect_field<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<bool, I2cError>> + 'a>>;
}

/// Single NFC device backed by I2C (e.g. ST25DV04K).
pub struct I2cNfc<R: NfcRole> {
    bus: I2cBusHandle,
    _role: PhantomData<R>,
}

impl<R: NfcRole> I2cNfc<R> {
    /// Create an I2cNfc device using the specified I2C bus.
    pub fn new(bus: I2cBusHandle) -> Self {
        Self {
            bus,
            _role: PhantomData,
        }
    }
}

impl<R: NfcRole> Nfc<R> for I2cNfc<R> {
    fn read<'a>(
        &'a mut self,
        address: u16,
        data: &'a mut [u8],
    ) -> Pin<Box<dyn Future<Output = Result<(), I2cError>> + 'a>> {
        Box::pin(async move {
            let addr_bytes = address.to_be_bytes();
            self.bus
                .write_read(0xA0, &addr_bytes, data)
                .await
        })
    }

    fn write<'a>(
        &'a mut self,
        address: u16,
        data: &'a [u8],
    ) -> Pin<Box<dyn Future<Output = Result<(), I2cError>> + 'a>> {
        Box::pin(async move {
            let mut buf = [0u8; 258];
            if data.len() > 256 {
                return Err(I2cError::InvalidBufferLength);
            }
            let addr_bytes = address.to_be_bytes();
            buf[0..2].copy_from_slice(&addr_bytes);
            buf[2..2 + data.len()].copy_from_slice(data);
            self.bus
                .write(0xA0, &buf[0..2 + data.len()])
                .await
        })
    }

    fn detect_field<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<bool, I2cError>> + 'a>> {
        Box::pin(async move {
            // Field detection register at address 0x0016
            let mut buf = [0u8; 1];
            self.read(0x0016, &mut buf).await?;
            Ok((buf[0] & 0x01) != 0)
        })
    }
}

/// Create a boxed [`Nfc`] device of role `R` from an I2C bus handle.
///
/// # Arguments
/// * `bus` - Configured I2C bus handle.
///
/// # Example
///
/// ```ignore
/// use xpanse_api::bus::i2c::I2cBusHandle;
/// use xpanse_api::interfaces::nfc::{Generic, i2c_nfc};
/// use xpanse_api::registry::Registry;
///
/// # async fn example(
/// #     bus: I2cBusHandle,
/// #     registry: &mut Registry,
/// #     slot: xpanse_api::metadata::ModuleSlot,
/// # ) {
/// let nfc = i2c_nfc::<Generic>(bus);
/// // registry.register(slot, id, nfc);
/// # }
/// ```
pub fn i2c_nfc<R: NfcRole>(bus: I2cBusHandle) -> Box<dyn Nfc<R>> {
    Box::new(I2cNfc::<R>::new(bus))
}
