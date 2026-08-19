//! GPIO LED output wrappers.
//!
//! Provides logical LED roles that drivers can publish through the
//! [`crate::registry::Registry`] and that apps can control for on/off/toggle
//! state. Each role is a zero-sized marker type; the physical pin is wired to
//! a role at startup using `pin_led`.

use alloc::boxed::Box;
use core::marker::PhantomData;

use embassy_rp::{
    Peri,
    gpio::{AnyPin, Output, Level},
};

mod private {
    pub trait Sealed {}
}

/// Marker trait for a logical LED role (e.g. `Generic`).
///
/// The type itself is zero-sized; it exists only to name a resource slot in the
/// [`crate::registry::Registry`].
pub trait LedRole: private::Sealed + 'static + Send {}

macro_rules! role {
    ($($n:ident),* $(,)?) => {
        $(
            pub struct $n;
            impl private::Sealed for $n {}
            impl LedRole for $n {}
        )*
    };
}

role!(Generic);

/// Interface for controlling an LED's on/off state.
pub trait Led<R: LedRole>: Send {
    /// Turn the LED on.
    fn on(&mut self);
    /// Turn the LED off.
    fn off(&mut self);
    /// Set the LED state explicitly.
    fn set(&mut self, on: bool);
    /// Toggle the LED state.
    fn toggle(&mut self);
    /// Returns `true` if the LED is currently on.
    fn is_on(&self) -> bool;
}

/// A single LED backed by one GPIO output.
pub struct SingleLed<R: LedRole> {
    pin: Output<'static>,
    active_low: bool,
    _role: PhantomData<R>,
}

impl<R: LedRole> SingleLed<R> {
    /// Create a `SingleLed` from a GPIO pin.
    ///
    /// If `active_low` is `true`, the LED is driven by a low signal (common for
    /// open-drain or active-low circuits). If `false`, a high signal turns the LED on.
    pub fn new(pin: Peri<'static, AnyPin>, active_low: bool) -> Self {
        let initial_level = if active_low { Level::High } else { Level::Low };
        Self {
            pin: Output::new(pin, initial_level),
            active_low,
            _role: PhantomData,
        }
    }
}

impl<R: LedRole> Led<R> for SingleLed<R> {
    fn on(&mut self) {
        let level = if self.active_low { Level::Low } else { Level::High };
        self.pin.set_level(level);
    }

    fn off(&mut self) {
        let level = if self.active_low { Level::High } else { Level::Low };
        self.pin.set_level(level);
    }

    fn set(&mut self, on: bool) {
        if on {
            self.on();
        } else {
            self.off();
        }
    }

    fn toggle(&mut self) {
        self.pin.toggle();
    }

    fn is_on(&self) -> bool {
        let is_high = self.pin.is_set_high();
        if self.active_low {
            !is_high
        } else {
            is_high
        }
    }
}

/// Create a boxed [`Led`] of role `R` from a single GPIO pin.
///
/// The pin is consumed and configured internally as an output.
///
/// # Arguments
/// * `pin` - The GPIO pin to use.
/// * `active_low` - If `true`, the LED is driven by a low signal; if `false`, by a high signal.
///
/// # Example
///
/// ```ignore
/// use embassy_rp::gpio::AnyPin;
/// use embassy_rp::Peri;
/// use xpanse_api::interfaces::leds::{Generic, pin_led};
/// use xpanse_api::registry::Registry;
///
/// # async fn example(
/// #     pin: Peri<'static, AnyPin>,
/// #     registry: &mut Registry,
/// #     slot: xpanse_api::metadata::ModuleSlot,
/// # ) {
/// let mut led = pin_led::<Generic>(pin, false);
/// led.on();
/// // registry.register(slot, id, led);
/// # }
/// ```
pub fn pin_led<R: LedRole>(
    pin: Peri<'static, AnyPin>,
    active_low: bool,
) -> Box<dyn Led<R>> {
    Box::new(SingleLed::<R>::new(pin, active_low))
}
