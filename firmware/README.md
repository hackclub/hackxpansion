# Xpanse

> [!WARNING]  
> This is still under development and may contain bugs, and the api may change, and many parts aren't documented.

This is the firmware for the Hackxpansion console.

The main binary crate is called `xpanse`; this is the create the is the heart of the firmware.

The driver api is located in the `xpanse-api` crate; this crate provides drivers and apps with the necessary traits and types that they need to implement.

## Enabling apps

Each app can be enabled by a feature flag; you can find the exact names for these in the `Cargo.toml` of the `xpanse` folder under the `[features]` section.

You can enable features by adding `--features "app-name1,app-name2,app-name3"
