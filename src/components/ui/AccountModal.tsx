"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/** Keep in sync with the `modal-out` duration in globals.css. */
const EXIT_MS = 150;

export function AccountModal({
  kicker,
  title,
  subtitle,
  className = "",
  titleId,
  onClose,
  children,
}: {
  /** Small monospace eyebrow above the title, e.g. "// Shipping Address". */
  kicker?: string;
  title: string;
  subtitle?: string;
  /** Extra class on the dialog box, for size/layout variants. */
  className?: string;
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);

  // Callers hand us a fresh closure on every render, so it must not be an
  // effect dependency: re-running that effect re-focuses the close button,
  // yanking the caret out of whichever field is being typed into.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const requestClose = useCallback(() => {
    setClosing(true);
    exitTimer.current = setTimeout(() => onCloseRef.current(), EXIT_MS);
  }, []);

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  useEffect(() => {
    const lastFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    // Lock the page behind the dialog. Compensating for the scrollbar keeps the
    // layout from shifting as it disappears.
    const { body, documentElement } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const gap = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      lastFocused?.focus();
    };
  }, [requestClose]);

  return (
    <div
      className={cn("account-modal-overlay", closing && "is-closing")}
      onClick={requestClose}
    >
      <div
        className={cn("account-modal", className, closing && "is-closing")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="account-modal-header">
          <div className="account-modal-heading">
            {kicker && <span className="account-kicker">{kicker}</span>}
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p className="account-modal-sub">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="account-modal-close"
            onClick={requestClose}
            aria-label="Close"
            ref={closeRef}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
