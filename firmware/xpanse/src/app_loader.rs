extern crate alloc;

use alloc::boxed::Box;
use core::{future::Future, pin::Pin};

use xpanse_api::{app::App, registry::Registry};

const APP_CATALOG: &[AppDescriptor] = &[
    #[cfg(feature = "app-doom")]
    AppDescriptor {
        name: doom_app::DoomApp::NAME,
        can_run: doom_app::DoomApp::can_run,
        run: run_app_impl::<doom_app::DoomApp>,
    },
    #[cfg(feature = "app-button-logger")]
    AppDescriptor {
        name: button_logger::ButtonLoggerApp::NAME,
        can_run: button_logger::ButtonLoggerApp::can_run,
        run: run_app_impl::<button_logger::ButtonLoggerApp>,
    },
    #[cfg(feature = "app-cube-game")]
    AppDescriptor {
        name: cube_game::CubeGameApp::NAME,
        can_run: cube_game::CubeGameApp::can_run,
        run: run_app_impl::<cube_game::CubeGameApp>,
    },
    #[cfg(feature = "app-neon-beat")]
    AppDescriptor {
        name: neon_beat::NeonBeatApp::NAME,
        can_run: neon_beat::NeonBeatApp::can_run,
        run: run_app_impl::<neon_beat::NeonBeatApp>,
    },
    #[cfg(feature = "app-snake-game")]
    AppDescriptor {
        name: snake_game::SnakeGameApp::NAME,
        can_run: snake_game::SnakeGameApp::can_run,
        run: run_app_impl::<snake_game::SnakeGameApp>,
    },
    #[cfg(feature = "app-nes-emulator")]
    AppDescriptor {
        name: nes_emulator::NesEmulatorApp::NAME,
        can_run: nes_emulator::NesEmulatorApp::can_run,
        run: run_app_impl::<nes_emulator::NesEmulatorApp>,
    },
    #[cfg(feature = "app-flappy-bird")]
    AppDescriptor {
        name: flappy_bird::FlappyBirdApp::NAME,
        can_run: flappy_bird::FlappyBirdApp::can_run,
        run: run_app_impl::<flappy_bird::FlappyBirdApp>,
    }
];

type AppFuture<'a> = Pin<Box<dyn Future<Output = ()> + 'a>>;
type AppRunner = for<'a> fn(&'a mut Registry) -> AppFuture<'a>;

pub(crate) struct AppDescriptor {
    pub name: &'static str,
    can_run: fn(&Registry) -> bool,
    run: AppRunner,
}

pub(crate) fn runnable_apps<'a>(
    registry: &'a Registry,
) -> impl Iterator<Item = &'static AppDescriptor> + 'a {
    APP_CATALOG
        .iter()
        .filter(move |app| (app.can_run)(registry))
}

pub(crate) fn runnable_app_count(registry: &Registry) -> usize {
    runnable_apps(registry).count()
}

pub(crate) fn runnable_app_at(
    registry: &Registry,
    selected_index: usize,
) -> Option<&'static AppDescriptor> {
    runnable_apps(registry).nth(selected_index)
}

pub(crate) fn run_app<'a>(
    app: &'static AppDescriptor,
    registry: &'a mut Registry,
) -> AppFuture<'a> {
    (app.run)(registry)
}

#[allow(dead_code)]
fn run_app_impl<'a, A: App + 'static>(registry: &'a mut Registry) -> AppFuture<'a> {
    Box::pin(async move {
        if let Some(mut app) = A::new(registry) {
            app.run().await;
            app.release(registry);
        } else {
            defmt::warn!("selected app requirements were no longer met");
        }
    })
}
