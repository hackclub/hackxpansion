# Hackxpansion documentation

<div class="flex flex-wrap items-center gap-6">
    <img class="h-64 w-auto max-w-full object-contain" src="/shop/console.png" />
    <img class="h-64 w-auto max-w-full object-contain" src="https://cdn.hackclub.com/01a005fc-617f-76f8-a676-107ad7259ae6/6767676.png" />
</div>

This is the main docs page of Hackxpansion, where you can learn about the event, hardware and firmware. If you have any more questions ask in the `#hackxpansion` slack channel.

## How does this work?

Design 4 expansion cards; get funding to build them; write an app that use these card; get a custom handheld console to use them in/on.

Each card can be in one of three tiers; for each tier of card, you get a different amount of currency.

### Tiers:

- **Basic**: Only a few buttons, or a joystick, or smth from a guide; this is to get you into PCB design and writing code 'and stuff. Max funding of ≈ $35. Worth 1 currency

- **Advanced**: Has at least one IC, or it has a relatively complex CAD design. Something like a simple audio card or an LED matrix. Max funding of ≈ $50. Worth 2 currency

- **PRO**: Something relatively advanced, like another MCU(ch32), or some sort of RF. Max funding of ≈ $75(If you need more DM @koeg on slack). Worth 3 currency

You also get 1-3 currency per app that you make; the payout is based on complexity, just like with the modules.

To get a console, you have to have at least 8 currency, 4 modules' design accepted and an app/apps that use at least 4 of your modules.

The most polished/cool modules get added to the shop, will be "mass" produced, and can be bought with currency.

### Tracking work

You have to track your work, here are the 3 options you have:

- Journal your work on the platform, read this [guide](https://codex.hackclub.com/shipping/journaling/) on journaling
- Using [Lapse](https://lapse.hackclub.com/) to create a timelapse of your work
- Using [Hackatime](https://hackatime.hackclub.com/) to track your coding in your editors

You must only track a unit of work with one of these, so if you used lapse to record yourself coding, you must not also use hackatime. There is one exception here, you can write journals of work tracked with lapse or hackatime, but you must not report time for them in the journal entry.

## Gallery

<details>
<summary>images</summary>

<img src="https://cdn.hackclub.com/01a005f3-4a9c-737e-9898-1df71c40801d/1000023455.png">
<img src="https://cdn.hackclub.com/01a005f3-4d9e-79aa-9c5c-b8ef2e1f3400/1000023456.png">
<img src="https://cdn.hackclub.com/01a005f3-36c0-75ce-b869-0186b5b8bbfc/100002326767.jpg">
<img src="https://cdn.hackclub.com/01a005f3-39ec-7b7e-ad51-f78bb3b2e53e/1000023131.jpg">
<img src="https://cdn.hackclub.com/01a005f3-3e5d-7997-a91d-7d19fe64ddf7/1000023140.jpg">
<img src="https://cdn.hackclub.com/01a005f3-4149-7843-9add-a190e7cf5b50/1000023459.jpg">
<img src="https://cdn.hackclub.com/01a005f3-440e-79cb-8e40-8658f3d5547d/1000023171.jpg">
<img src="https://cdn.hackclub.com/01a005f3-4747-7552-b844-f382ceb26087/1000023265.jpg">

</details>

## FAQ

### What do I get in the console package

You get the

- **_Hackxpansion_** console
- a two and four button module kit with PCBs and parts
- as many right angle 2x7 headers as you need for your modules

### When do I get the funding for my modules

After your all your module designs get approved and you order the console, you will get an email/DM on slack with an invite to a HCB grant card. This way you can order call your modules at once, and save on shipping

### I don't have a 3D printer, how do I print out the shell of my modules

No problem! Just join `#printing-legion` on slack and you can get your models printed by a network of printers all around the world.

The price of printing legion is 50$/Kg, you won't have to this out of pocket, instead you will have to use your HCB grant card. If other services are cheaper, maybe like JLC3DP, you are welcome to use those.

### What is this all about?

Hackxpansion is an event run by Hack Club, a global community of high school hackers. Make four expansion cards, write drivers for them, get funding, and earn a custom console to use them in.

### Where do I get started?

[Join the Hack Club Slack](https://slack.hackclub.com/) and visit the [#hackxpansion](https://hackclub.enterprise.slack.com/archives/C0A9B4152BY) channel. The community can help while you work through the getting-started guides.

You will need to track your time with journals, time lapses, or streams. This evidence is required for the console reward and helps document your work.

### What if I am new to hardware?

The guides and resources are designed to help you make your first module or even your first PCB.

### How powerful will the console be?

The console uses an RP2354B MCU as its main processor, from the next generation of the chip used in [Sprig](https://sprig.hackclub.com/). It is capable enough for many projects, and you can add a coprocessor when you need more power.
