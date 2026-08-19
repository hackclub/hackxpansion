# Dual-Slot Modules

This doc page will provide useful info on how to create dual-slot modules

## Module Detect Resistors

A dual-slot module doesn't require both slots to have an identical pair of ID resistors, only one of the slots needs to have them.

## PCB Design

Currently there is no footprint or symbol for a dual-slot modules.
So you have to use two single slot module ports as a base.

You shouldn't use the footprint included in the Hackxpansion KiCAD library for dual-slot modules. If you put two of these footprints next to each other, the spacing will be wrong.

Instead use `Connector_PinSocket_2.54mm:PinSocket_2x07_P2.54mm_Horizontal`. This footprint doesn't have edge cuts baked in, and you have to draw them yourself. For the spacing and edge.cuts check out the [Hackxpansion main board](https://github.com/hackclub/hackxpansion/tree/main/hardware/hackxpansion/pcb) PCB for dimensions.

## Firmware

Making a driver for a dual-slot card is very similar to a single-slot driver. But instead of implementing the `Driver` trait, you have to implement the `DualSlotDriver` trait, which gives you access to the pins on both slots.

Adding the driver to the main `xpanse` firmware is also really similar to adding a single-slot driver. Just instead of adding a new match arm to the `load_driver` function, you add a new match arm to `load_dual_slot_driver`.

For more info on how to create drivers, check out the [first driver guide](../quickstart/first-driver);
