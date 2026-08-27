// Global typing for the Razorpay Checkout.js script (loaded by RazorpayScript).
// Declared once here — do NOT redeclare Window.Razorpay in components.

interface RazorpayPrefill {
  name?: string;
  email?: string;
  contact?: string;
}

interface RazorpayOptions {
  key: string;
  amount: number; // paise
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: RazorpayPrefill;
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler?: (response: RazorpayPaymentResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
  };
}

interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, callback: (response: unknown) => void) => void;
}

// Razorpay EMI² Affordability Suite widget (Native Web integration).
// Script: https://cdn.razorpay.com/widgets/affordability/affordability.js
// Docs: https://razorpay.com/docs/payments/payment-gateway/emi²/widget/native-web/
interface AffordabilitySuiteConfig {
  key: string; // public Key ID — never the secret
  amount: number; // paise — must be the final payable amount shown to the customer
  currency?: string;
  theme?: { color?: string };
  display?: {
    offers?: boolean | { offerIds?: string[] };
    emi?: boolean | { issuers?: string[] };
    cardlessEmi?: boolean | { providers?: string[] };
    paylater?: boolean | { providers?: string[] };
    widget?: {
      main?: {
        heading?: { color?: string; fontSize?: string };
        content?: { color?: string; fontSize?: string; backgroundColor?: string };
        discount?: { color?: string };
        link?: { button?: boolean; color?: string; fontSize?: string };
        footer?: { color?: string; fontSize?: string; darkLogo?: boolean };
        isDarkMode?: boolean;
      };
    };
  };
}

interface RazorpayAffordabilitySuiteInstance {
  render: () => void;
}

interface Window {
  RazorpayAffordabilitySuite: new (config: AffordabilitySuiteConfig) => RazorpayAffordabilitySuiteInstance;
}
