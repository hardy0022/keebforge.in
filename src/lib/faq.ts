export type FaqItem = { q: string; a: string };

/** Resolves a service slug to its DB price text, e.g. "₹12 per switch". */
export type PriceTextFn = (slug: string) => string | null;

export const GENERAL_FAQ: FaqItem[] = [
  {
    q: "What services does KeebForge offer?",
    a: "KeebForge offers mechanical keyboard and gaming mouse services: switch lubing and filming, spring swap, stabilizer tuning, soldering and desoldering, hot-swap socket repair, Mill-Max installation, PCB troubleshooting and repair, custom keyboard builds, firmware upload, and mouse switch, encoder, skate and diagnostics work.",
  },
  {
    q: "Do you repair mechanical keyboards?",
    a: "Yes. Dead keys, rattling stabilizers, scratchy switches, damaged sockets and PCB faults are all repaired at component level.",
  },
  {
    q: "Do you repair gaming mice?",
    a: "Yes — double-clicking switches, dead scroll wheels (encoder replacement), worn skates and cable, sensor or connectivity issues.",
  },
  {
    q: "How do I send my keyboard or mouse for service?",
    a: "Place an order on the order page, confirm the details, and ship your device to Jammu & Kashmir. The buyer covers shipping in both directions.",
  },
  {
    q: "Do you accept orders from outside your city?",
    a: "Yes — KeebForge is a mail-in service and accepts work from anywhere in India. There is no physical walk-in shop.",
  },
  {
    q: "How long does a repair take?",
    a: "Turnaround is generally 5–7 days depending on order complexity and the queue.",
  },
  {
    q: "How is payment handled?",
    a: "Payment is confirmed before work begins — it books any parts needed and secures your order, so work only starts once payment is received. Fixed-price services are billed at the listed rates; other work is quoted after inspection and confirmed before payment.",
  },
  {
    q: "Do you ship to all of India?",
    a: "Yes. Keyboard and mouse repair services are available across India via shipping.",
  },
  {
    q: "What does 'quoted after inspection' mean?",
    a: "For work where the fault isn't visible up front — PCB troubleshooting, electronics repair, split builds, firmware and mouse repairs — KeebForge assesses the device and confirms a price before starting. You confirm payment before work begins.",
  },
  {
    q: "Do I need to provide parts or switches?",
    a: "For switch work you can bring your own switches or films, or ask KeebForge to source them. For builds, you provide the parts unless agreed otherwise.",
  },
];

/** Keyboard FAQ. Price figures are injected from the DB via `priceText`. */
export function buildKeyboardFaq(priceText: PriceTextFn): FaqItem[] {
  const hotswap = priceText("hotswap-socket-install");
  const lubing = priceText("krytox-205g0-lubing");
  const combo = priceText("complete-mod-combo");
  const stabFull = priceText("full-stabilizer-service");
  const stabWire = priceText("wire-balancing-only");
  const stabRestore = priceText("restore-old-stabilizers");

  return [
    {
      q: "Do you repair mechanical keyboards?",
      a: "Yes. KeebForge handles mechanical keyboard repairs including switch lubing, stabilizer tuning, soldering and desoldering, hot-swap socket replacement, PCB troubleshooting and firmware work.",
    },
    {
      q: "Do you repair gaming keyboards?",
      a: "Yes. Gaming keyboards use the same switches, stabilizers and PCBs as any mechanical keyboard, and the same repair services apply.",
    },
    {
      q: "Can you repair a keyboard with dead keys?",
      a: "Yes. Dead keys are usually a switch, solder joint, socket or trace fault. We diagnose the keyboard and repair or replace the affected part — a quote is provided after inspection when the cause isn't obvious.",
    },
    {
      q: "Can you repair damaged hot-swap sockets?",
      a: `Yes. Damaged or lifted hot-swap sockets can be replaced.${hotswap ? ` Hot-swap socket install or replacement costs ${hotswap}.` : ""}`,
    },
    {
      q: "Do you offer keyboard switch lubing?",
      a: `Yes.${lubing ? ` Krytox 205g0 lubing costs ${lubing}.` : ""}${combo ? ` The complete mod (lube + film + spring swap) costs ${combo}.` : ""}`,
    },
    {
      q: "Do you offer stabilizer tuning?",
      a: `Yes.${stabFull ? ` Full stabilizer service costs ${stabFull}.` : ""}${stabWire ? ` Wire balancing only costs ${stabWire}.` : ""}${stabRestore ? ` Restoring old stabilizers costs ${stabRestore}.` : ""}`,
    },
    {
      q: "How do I send my keyboard for repair?",
      a: "Place an order on the website, confirm the details and payment, then ship your keyboard to Jammu & Kashmir. The buyer covers shipping in both directions.",
    },
    {
      q: "Do you accept repair requests from outside your city?",
      a: "Yes. KeebForge is a mail-in service and accepts keyboards from anywhere in India. There is no physical walk-in shop — your keyboard is shipped in and shipped back.",
    },
  ];
}

export const MOUSE_FAQ: FaqItem[] = [
  {
    q: "Do you repair gaming mice?",
    a: "Yes. KeebForge repairs gaming mice — worn or double-clicking switches, dead scroll wheels, bad encoders, tired skates, and cable/sensor/connectivity problems.",
  },
  {
    q: "Can you fix a mouse with double-clicking switches?",
    a: "Yes. Double-clicking is almost always a worn switch. We replace the left or right click switches, or the middle and side button switches.",
  },
  {
    q: "Can you replace a mouse encoder?",
    a: "Yes. If the scroll wheel skips, scrolls backwards, or feels dead, the encoder is replaced with one matched to your mouse model.",
  },
  {
    q: "Do you replace mouse feet / skates?",
    a: "Yes. Fresh PTFE skates are fitted and leveled.",
  },
  {
    q: "Do you need to ship the mouse?",
    a: "Yes. KeebForge is a mail-in service from Jammu & Kashmir and accepts mice from anywhere in India. There is no physical walk-in shop.",
  },
  {
    q: "How much does mouse repair cost?",
    a: "Switch replacements, encoder swaps and other mouse work are quoted after inspection. Payment is confirmed before work begins.",
  },
  {
    q: "How do I send my mouse for repair?",
    a: "Place an order on the website, confirm the details, and ship the mouse to Jammu & Kashmir. The buyer covers shipping in both directions.",
  },
];