"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import { PASSWORD_RULES } from "@/lib/password";
import { saveNewsletterOpt } from "@/app/account/settings/actions";

interface SettingsPanelProps {
  newsletter: boolean;
  hasPassword: boolean;
}

type ConnectedAccount = {
  id: string;
  providerId: string;
  accountId: string;
  email?: string | null;
};

export function SettingsPanel({ newsletter, hasPassword }: SettingsPanelProps) {
  const router = useRouter();

  const [newsletterOpt, setNewsletterOpt] = useState(newsletter);
  const [newsletterSaving, setNewsletterSaving] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwDone, setPwDone] = useState(false);

  const [connOpen, setConnOpen] = useState(false);
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [unnlinkingId, setUnlinkingId] = useState<string | null>(null);

  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [delPassword, setDelPassword] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState("");

  async function onToggleNewsletter(next: boolean) {
    setNewsletterSaving(true);
    try {
      await saveNewsletterOpt(next);
      setNewsletterOpt(next);
    } catch {
      // keep the prior state on failure
    } finally {
      setNewsletterSaving(false);
    }
  }

  async function loadAccounts() {
    setAccounts(null);
    const res = await authClient.listAccounts();
    if (!res.error) setAccounts(res.data ?? []);
  }

  async function openConnections() {
    setConnOpen(true);
    await loadAccounts();
  }

  async function onUnlink(accountId: string) {
    if (accounts && accounts.length <= 1) return;
    setUnlinkingId(accountId);
    const res = await authClient.unlinkAccount({ accountId });
    if (!res.error) await loadAccounts();
    setUnlinkingId(null);
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwBusy) return;
    setPwError("");
    setPwDone(false);
    if (pwNew !== pwConfirm) {
      setPwError("Passwords do not match.");
      return;
    }
    if (!PASSWORD_RULES.every((r) => r.test(pwNew))) {
      setPwError("New password does not meet the requirements.");
      return;
    }
    setPwBusy(true);
    const res = await authClient.changePassword({
      currentPassword: pwCurrent,
      newPassword: pwNew,
      revokeOtherSessions: true,
    });
    setPwBusy(false);
    if (res.error) {
      setPwError(res.error.message ?? "Unable to change password. Please try again.");
      return;
    }
    setPwDone(true);
    setPwCurrent("");
    setPwNew("");
    setPwConfirm("");
  }

  async function onDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (delBusy) return;
    setDelError("");
    setDelBusy(true);
    const res = await authClient.deleteUser(
      hasPassword
        ? { password: delPassword, callbackURL: "/" }
        : { callbackURL: "/" }
    );
    setDelBusy(false);
    if (res.error) {
      setDelError(res.error.message ?? "Unable to delete your account. Please try again.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="account-stack">
      <section className="account-section">
        <span className="account-kicker">{"// Account Preferences"}</span>

        <div className="account-settings-list">
          <div className="account-settings-item">
            <div>
              <h3>Email Preferences</h3>
              <p>Get updates on new products, restocks, and availability</p>
            </div>
            <label className="account-toggle">
              <input
                type="checkbox"
                checked={newsletterOpt}
                disabled={newsletterSaving}
                onChange={(e) => onToggleNewsletter(e.target.checked)}
              />
              <span className="account-toggle-track" aria-hidden="true" />
              <span>{newsletterOpt ? "Subscribed" : "Unsubscribed"}</span>
            </label>
          </div>

          <div className="account-settings-item">
            <div>
              <h3>Communication</h3>
              <p>Choose how we can reach you. Set your contact details</p>
            </div>
            <Link href="/account/profile" className="btn-ghost btn-sm">
              Manage
            </Link>
          </div>

          <div className="account-settings-item">
            <div>
              <h3>Privacy</h3>
              <p>See how your data is used on KeebForge</p>
            </div>
            <Link href="/privacy-policy" className="btn-ghost btn-sm">
              View policy
            </Link>
          </div>
        </div>
      </section>

      <section className="account-section">
        <span className="account-kicker">{"// Account Security"}</span>

        <div className="account-settings-list">
          <div className="account-settings-item">
            <div>
              <h3>Change Password</h3>
              <p>{hasPassword ? "Update your password to keep your account secure" : "No password set yet. Add one for password sign-in"}</p>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPwOpen(true)}>
              {hasPassword ? "Change" : "Set Password"}
            </button>
          </div>

          <div className="account-settings-item">
            <div>
              <h3>Connected Accounts</h3>
              <p>Manage Google and Discord sign-in methods</p>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={openConnections}>
              Manage
            </button>
          </div>
        </div>
      </section>

      <section className="account-section account-section--danger">
        <span className="account-kicker account-kicker--danger">{"// Danger Zone"}</span>

        <div className="account-danger-zone">
          <div className="account-danger-item">
            <div>
              <h3>Delete Account</h3>
              <p>Permanently delete your account and all associated data</p>
            </div>
            <button type="button" className="btn-ghost btn-sm btn-danger" onClick={() => setDelOpen(true)}>
              Delete Account
            </button>
          </div>
        </div>
      </section>

      {pwOpen && (
        <div className="account-modal-overlay" onClick={() => setPwOpen(false)} role="dialog" aria-modal="true" aria-labelledby="pw-modal-title">
          <div className="account-modal" onClick={(e) => e.stopPropagation()}>
            <header className="account-modal-header">
              <h3 id="pw-modal-title">{hasPassword ? "Change Password" : "Set Password"}</h3>
              <button type="button" className="account-modal-close" onClick={() => setPwOpen(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            <form onSubmit={onChangePassword} className="account-form">
              {hasPassword && (
                <div className="form-row">
                  <label htmlFor="pw-current">Current Password</label>
                  <input
                    id="pw-current"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    placeholder="••••••••••"
                  />
                </div>
              )}

              <div className="form-row">
                <label htmlFor="pw-new">New Password</label>
                <input
                  id="pw-new"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  placeholder="8+ chars, upper, lower, number, symbol"
                />
              </div>

              <div className="form-row">
                <label htmlFor="pw-confirm">Confirm New Password</label>
                <input
                  id="pw-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  placeholder="••••••••••"
                />
              </div>

              <p className="account-password-hint">
                Needs {PASSWORD_RULES.length} things: at least 8 characters, an uppercase letter, a lowercase letter, a number, and a special character.
              </p>

              {pwError && (
                <p className="auth-error" role="alert">
                  {pwError}
                </p>
              )}
              {pwDone && (
                <p className="auth-success" role="status">
                  Password updated successfully.
                </p>
              )}

              <div className="account-modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setPwOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-form-submit" disabled={pwBusy}>
                  {pwBusy ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {connOpen && (
        <div className="account-modal-overlay" onClick={() => setConnOpen(false)} role="dialog" aria-modal="true" aria-labelledby="conn-modal-title">
          <div className="account-modal" onClick={(e) => e.stopPropagation()}>
            <header className="account-modal-header">
              <h3 id="conn-modal-title">Connected Accounts</h3>
              <button type="button" className="account-modal-close" onClick={() => setConnOpen(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            <div className="account-connections">
              {accounts === null ? (
                <div className="account-loading">Loading…</div>
              ) : accounts.length === 0 ? (
                <p className="account-loading">No connected accounts.</p>
              ) : (
                accounts.map((account) => (
                  <div key={account.id} className="account-settings-item">
                    <div>
                      <h3 className="capitalize">{account.providerId === "credential" ? "Email" : account.providerId}</h3>
                      <p>{account.accountId}</p>
                    </div>
                    {accounts.length > 1 ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm btn-danger"
                        onClick={() => onUnlink(account.id)}
                        disabled={unnlinkingId === account.id}
                      >
                        {unnlinkingId === account.id ? "Removing…" : "Remove"}
                      </button>
                    ) : (
                      <span className="account-address-default-text">Connected</span>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="account-modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setConnOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {delOpen && (
        <div className="account-modal-overlay" onClick={() => setDelOpen(false)} role="dialog" aria-modal="true" aria-labelledby="del-modal-title">
          <div className="account-modal" onClick={(e) => e.stopPropagation()}>
            <header className="account-modal-header">
              <h3 id="del-modal-title">Delete Account</h3>
              <button type="button" className="account-modal-close" onClick={() => setDelOpen(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            <form onSubmit={onDeleteAccount} className="account-form">
              <p className="account-password-hint">
                This permanently deletes your account, orders, addresses, and all associated data. This action cannot be undone.
              </p>
              {hasPassword && (
                <div className="form-row">
                  <label htmlFor="del-password">Password</label>
                  <input
                    id="del-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={delPassword}
                    onChange={(e) => setDelPassword(e.target.value)}
                    placeholder="Enter your password to confirm"
                  />
                </div>
              )}
              <div className="form-row">
                <label htmlFor="del-confirm">
                  Type <span className="account-mono">delete</span> to confirm
                </label>
                <input
                  id="del-confirm"
                  type="text"
                  required
                  value={delConfirm}
                  onChange={(e) => setDelConfirm(e.target.value)}
                  placeholder="delete"
                />
              </div>

              {delError && (
                <p className="auth-error" role="alert">
                  {delError}
                </p>
              )}

              <div className="account-modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setDelOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-ghost btn-sm btn-danger"
                  disabled={delBusy || delConfirm !== "delete"}
                >
                  {delBusy ? "Deleting…" : "Permanently Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}