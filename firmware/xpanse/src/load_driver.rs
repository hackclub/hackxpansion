use xpanse_api::{
    bus::allocator::BusAllocator,
    driver::{Driver, DriverMeta},
    gpio_bank::{BankPins, GpioBank},
    metadata::{ModuleID, ModuleSlot},
    registry::Registry,
};

type Module<G> = (Option<ModuleID>, GpioBank<G>, ModuleSlot);

/// loads a dual slot driver or two single slot drivers
///
/// 0 is right, 1 is left for modules
pub async fn load_driver_pair<G1: BankPins, G2: BankPins>(
    modules: (Module<G1>, Module<G2>),
    registry: &mut Registry,
    bus: &mut BusAllocator,
) {
    match (modules.0.0, modules.1.0) {
        (None, None) => {
            defmt::warn!("No modules in front slots");
        }

        (Some(right), Some(left)) if left != right => {
            load_driver(modules.0.0, modules.0.1, modules.0.2, registry, bus).await;
            load_driver(modules.1.0, modules.1.1, modules.1.2, registry, bus).await;
        }

        (Some(id), None) | (None, Some(id)) | (Some(id), Some(_)) => {
            if let Err(banks) = load_dual_slot_driver(
                Some(id),
                (modules.0.1, modules.1.1),
                (modules.0.2, modules.1.2),
                registry,
                bus,
            )
            .await
            {
                load_driver(modules.0.0, banks.0, modules.0.2, registry, bus).await;
                load_driver(modules.1.0, banks.1, modules.1.2, registry, bus).await;
            }
        }
    }
}

async fn load_driver<G: BankPins>(
    id: Option<ModuleID>,
    bank: GpioBank<G>,
    slot: ModuleSlot,
    registry: &mut Registry,
    bus: &mut BusAllocator,
) {
    match id {
        Some(id) if id == four_button_driver::FourButtonDriver::ID => {
            match four_button_driver::FourButtonDriver::create(bank, slot, registry, bus).await {
                Ok(()) => defmt::info!("Four button driver initialized in {:?}", slot),
                Err(error) => {
                    defmt::error!("Four button driver init failed in {:?}: {:?}", slot, error)
                }
            }
        }
        Some(id) if id == two_button_driver::TwoButtonDriver::ID => {
            match two_button_driver::TwoButtonDriver::create(bank, slot, registry, bus).await {
                Ok(()) => defmt::info!("Two button driver initialized in {:?}", slot),
                Err(error) => {
                    defmt::error!("Two button driver init failed in {:?}: {:?}", slot, error)
                }
            }
        }
        Some(id) if id == test_driver::TestDriver::ID => {
            match test_driver::TestDriver::create(bank, slot, registry, bus).await {
                Ok(()) => defmt::info!("Test driver initialized in {:?}", slot),
                Err(error) => {
                    defmt::error!("Test driver init failed in {:?}: {:?}", slot, error)
                }
            }
        }
        Some(id) if id == test_driver::spi_adc::SpiAdcDriver::ID => {
            match test_driver::spi_adc::SpiAdcDriver::create(bank, slot, registry, bus).await {
                Ok(()) => defmt::info!("SPI ADC driver initialized in {:?}", slot),
                Err(error) => {
                    defmt::error!("SPI ADC driver init failed in {:?}: {:?}", slot, error)
                }
            }
        }
        Some(id) => defmt::warn!("unknown driver id {:?} in {:?}", id, slot),
        None => defmt::info!("no driver to load in {:?}", slot),
    }
}

/// 0 is the right, 1 is the left for tuples
async fn load_dual_slot_driver<G1: BankPins, G2: BankPins>(
    id: Option<ModuleID>,
    banks: (GpioBank<G1>, GpioBank<G2>),
    slots: (ModuleSlot, ModuleSlot),
    registry: &mut Registry,
    bus: &mut BusAllocator,
) -> Result<(), (GpioBank<G1>, GpioBank<G2>)> {
    match id {
        // Example
        // Some(id) if id == dual_slot_test_driver::DualSlotTestDriver::ID => {
        //     match dual_slot_test_driver::DualSlotTestDriver::create(banks, slots, registry, bus).await
        //         .await
        //     {
        //         Ok(()) => defmt::info!("dual slot test driver initialized in {:?}", slots),
        //         Err(error) => {
        //             defmt::error!("dual slot driver init failed in {:?}: {:?}", slots, error)
        //         }
        //     }
        //     Ok(())
        // }
        Some(_) | None => {
            defmt::warn!("no dual slot module found in slots: {:?}", slots.0);
            Err(banks)
        }
    }
}
