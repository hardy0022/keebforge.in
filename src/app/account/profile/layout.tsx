import type { Metadata } from "next";

/**
 * The page itself is a client component, so its title lives here.
 */
export const metadata: Metadata = {
  title: "My Account | KeebForge",
  robots: { index: false, follow: false },
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
