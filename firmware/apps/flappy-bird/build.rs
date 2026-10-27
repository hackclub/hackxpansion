fn main() {
    let config = slint_build::CompilerConfiguration::new()
        .embed_resources(slint_build::EmbedResourcesKind::EmbedForSoftwareRenderer);
    slint_build::compile_with_config("ui/ui.slint", config)
        .expect("failed to compile flappy bird UI");

    println!("cargo:rerun-if-changed=ui/ui.slint");
}