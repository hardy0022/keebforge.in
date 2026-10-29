export type FaqItem = { q: string; a: string };

export const GENERAL_FAQ: FaqItem[] = [
  {
    q: "What services does KeebForge offer?",
    a: "KeebForge offers mechanical keyboard and gaming mouse services: switch lubing and filming, spring swap, stabilizer tuning, soldering and desoldering, hot-swap socket repair, Mill-Max installation, PCB troubleshooting and repair, custom keyboard builds, firmware upload, and mouse switch, encoder, skate and diagnostics work.",
  },
  {
    q: "Do you repair mechanical keyboards and gaming mice?",
    a: "Yes. Dead keys, rattling stabilizers, scratchy switches, damaged sockets, PCB faults, double-clicking mouse switches, encoder issues, worn skates/cables, and sensor/connectivity problems are repaired at component level where possible.",
  },
  {
    q: "How do I send my keyboard or mouse for service?",
    a: "Place an order/request on the relevant page (Services/Mods/Workshop), confirm details, and ship your device to Jammu & Kashmir. KeebForge is a mail-in service with no physical walk-in shop. The buyer covers shipping in both directions unless agreed otherwise.",
  },
  {
    q: "Do you accept orders from outside your city / across India?",
    a: "Yes — mail-in service accepted from anywhere in India.",
  },
  {
    q: "How long does a repair take?",
    a: "Turnaround is generally 5–7 business days from when your device is checked into the workshop queue, depending on complexity and queue length. It is an estimate, not a guarantee, and can change if parts are unavailable or more faults are found.",
  },
  {
    q: "How is payment handled?",
    a: "Payments are processed securely by Razorpay. Payment is typically confirmed before work begins to book parts and secure the order. Fixed-price services are billed at listed rates; other work is quoted after inspection and confirmed before payment begins. Failed or cancelled payments do not create a charge. Refunds, if approved, go back to the original payment method through Razorpay. KeebForge does not store your card or UPI details.",
  },
  {
    q: "Can I place an order without creating an account?",
    a: "Yes, guest checkout is supported for eligible orders. You can also create an account to save addresses and track orders more easily.",
  },
  {
    q: "How do I create an account, and what does it store?",
    a: "Create an account from the sign-in page using email and password, or optionally with Google or Discord. An account stores your name, email, hashed password, optional profile details, saved addresses and cart, and links your orders to your profile. Guest checkout remains available without an account.",
  },
  {
    q: "How do I track my order?",
    a: "Use the Track Order page with your order number. Tracking shows the order's public status and progress without exposing your contact details or address.",
  },
  {
    q: "What is the difference between standard, made-to-order and clearance products?",
    a: "Standard products are stocked brand-new items. Made-to-order products are built or configured after you order, so lead times and minor cosmetic variation can differ. Clearance items may be open-box, used, refurbished, display units, or older stock, and the condition is shown on the listing. Return and refund rules are not the same for each category.",
  },
  {
    q: "Can I cancel my order?",
    a: "There is no self-service cancellation button. Contact us with your order number as soon as possible. Quote requests involve no payment. Custom, made-to-order and repair work cannot be cancelled for change of mind once work has begun. For product orders, contact us before dispatch; if we can stop the order, we will explain what can be refunded. If we cancel because we cannot fulfil an order, we refund the unfulfilled part, subject to applicable law.",
  },
  {
    q: "What if my order arrives damaged, incorrect or defective?",
    a: "Contact us as soon as possible — ideally within 48 hours of delivery — and include your order number and clear photos or a short video. Keep the item and packaging until we confirm next steps, and do not attempt a repair yourself first. We assess these cases individually; options can include replacement parts, rework, a replacement, or a refund. Your rights under applicable consumer law are not limited.",
  },
  {
    q: "What warranty do repairs and products have?",
    a: "Product warranty is whatever is stated on the product listing or provided by the manufacturer. For repairs, any warranty offered is stated in your quote or order confirmation; we do not currently publish a standard repair-warranty period. Workmanship defects covered by our rework policy are corrected at no extra labour cost. Warranty does not cover new damage, misuse, liquid damage, normal wear, or work outside the agreed scope.",
  },
  {
    q: "What should I know before sending a device for repair?",
    a: "Give accurate device, model/PCB, fault-history and prior-repair details, and back up anything you need because repairs or firmware work may reset profiles or onboard settings. Diagnosis can be uncertain and more faults may be found after inspection; we will confirm any revised quote before additional chargeable work. You bear the risk of loss or damage in transit to us, so use a tracked and, where possible, insured courier. Turnaround times are estimates and some devices may not be economically repairable.",
  },
  {
    q: "What does 'quoted after inspection' mean?",
    a: "For work where the fault isn't visible up front (PCB troubleshooting, electronics repair, complex builds, firmware, mouse repairs), we assess the device and confirm a price before starting. Your confirmation/payment approval is needed before work begins.",
  },
  {
    q: "Do I need to provide parts or switches?",
    a: "For switch work you can bring your own switches/films or ask KeebForge to source them. For builds, parts provision is as agreed otherwise.",
  },
  {
    q: "What is your returns/refunds policy?",
    a: "Custom work, made-to-order products and repairs cannot be cancelled or returned for change of mind once work has begun; covered workmanship issues are resolved by rework. A product return and refund policy, including for clearance/used items, has not yet been published — contact us before ordering if that matters. Damaged, incorrect or defective items are assessed case by case, and your rights under applicable consumer law are not limited. See our Returns & Refunds page and Terms & Conditions for details.",
  },
  {
    q: "What personal data does KeebForge collect?",
    a: "We collect the information needed to fulfil orders/services (name, email, phone, addresses), account details if you register, payment identifiers via Razorpay, images you upload for diagnostics or reviews (via Cloudinary), and technical/session data for security. Analytics services also collect page and performance data. See our Privacy Policy for full details.",
  },
  {
    q: "Do you store contact form messages?",
    a: "The contact form is delivered to us by email through Resend — it is not stored in our application database. Any photos you attach are uploaded to Cloudinary and referenced in that email. The email and photos remain in our inbox and provider systems until deleted.",
  },
  {
    q: "Who do you share my data with?",
    a: "Only with service providers necessary to operate: Razorpay for payments, Resend for email delivery, Delhivery for shipping quotes/labels/tracking, Cloudinary for images, Supabase for managed database and realtime tracking, Vercel for hosting and analytics, Umami Cloud for analytics, and Google Tag Manager only if configured. Google or Discord are used only if you choose OAuth sign-in. We do not sell your personal data.",
  },
  {
    q: "Do you use cookies or analytics?",
    a: "Yes. Essential cookies are used for authentication, cart and secure guest payment. Umami Cloud, Vercel Analytics and Vercel Speed Insights load automatically; Google Tag Manager loads only if configured. We sanitise URLs where supported so payment tokens are not sent. There is currently no in-site consent banner or analytics opt-out — you can block cookies or scripts through your browser settings or extensions.",
  },
  {
    q: "How can I access, correct, or delete my data?",
    a: "You can view and update your profile and saved addresses in your account, and manage your newsletter preference in Settings. You can delete your account from Settings > Danger Zone. For access requests or deletion of specific records, email contact@keebforge.in. There is no automated self-serve data-export tool.",
  },
  {
    q: "What happens to my orders and photos if I delete my account?",
    a: "Account deletion removes your user record, profile, linked sign-in accounts, sessions, saved addresses, cart and preferences. It does not delete orders, payments, refunds, repair records, order messages or warranty records — these are retained but unlinked from your account, and they still contain the name, email, phone and address details captured with the order. Reviews may remain, including the author name you provided. Uploaded images on Cloudinary are not automatically deleted. Email us if you want specific remaining records reviewed for deletion.",
  },
  {
    q: "Are my reviews and review photos public?",
    a: "Published reviews and any photos you attach may be displayed publicly on the site. Reviews may be moderated, and you should not upload content that is unlawful, misleading, defamatory, infringing, or someone else's private information. You keep ownership of your review content and grant KeebForge a non-exclusive, royalty-free licence to store, display, reproduce and moderate it. Reviews can remain after account deletion, with the profile link removed but the display name you provided possibly still visible.",
  },
  {
    q: "Can I nominate someone to act for me on privacy requests?",
    a: "There is no dedicated nomination feature right now. If you want to nominate someone to exercise your privacy rights, email contact@keebforge.in and we will explain what we can currently accept and what verification we need. Formal nomination handling is under legal review.",
  },
  {
    q: "Is KeebForge for children?",
    a: "Our services are not directed to children. Under the DPDP Act a child is someone under 18. We do not knowingly collect children's data, and we do not currently operate age verification or verifiable parental consent. Contact contact@keebforge.in if you believe a child has provided personal data.",
  },
  {
    q: "How do I contact you about privacy or a grievance?",
    a: "Email contact@keebforge.in with \"Privacy request\" in the subject. KeebForge has not currently designated a separate Data Protection Officer or Grievance Officer; whether a formal designation is required is under legal review.",
  },
];
