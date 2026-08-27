import Link from "next/link";
import type { ReactNode } from "react";
import { OAuthButtons } from "./OAuthButtons";

/**
 * Two-column auth card: email form (left) + social sign-in panel (right),
 * shared by /login and /register so the pages match. Legal line sits at the
 * bottom of the card, below both columns.
 */
export function AuthShell({
  socialTitle,
  switchPrompt,
  switchLabel,
  switchHref,
  legal,
  children,
}: {
  socialTitle: string;
  switchPrompt: string;
  switchLabel: string;
  switchHref: "/auth/login" | "/auth/register";
  legal?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-cols">
          <section className="auth-col-form">{children}</section>

          <div className="auth-divider" aria-hidden="true" />

          <aside className="auth-col-social" aria-label="Social sign-in">
            <h2 className="social-title">{socialTitle}</h2>
            <OAuthButtons />

            <div className="or-divider">
              <span>OR</span>
            </div>

            <p className="social-switch-prompt">{switchPrompt}</p>
            <Link href={switchHref} className="btn-social auth-switch-btn">
              {switchLabel} <span aria-hidden="true">→</span>
            </Link>

          </aside>
        </div>

        {legal && <p className="auth-card-legal">{legal}</p>}
      </div>
    </main>
  );
}
