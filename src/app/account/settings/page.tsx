import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Settings | KeebForge",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/login");

  await requireUser();

  return (
    <div className="account-settings">
      <section className="account-section">
        <header className="account-section-header">
          <h2 className="account-section-title">Settings</h2>
          <p className="account-section-desc">Manage your account preferences</p>
        </header>

        <div className="account-settings-list">
          <div className="account-settings-item">
            <div>
              <h3>Email Preferences</h3>
              <p>Manage newsletter and notification subscriptions</p>
            </div>
            <Link href="/account/email-preferences" className="btn-ghost btn-sm">
              Manage
            </Link>
          </div>

          <div className="account-settings-item">
            <div>
              <h3>Communication</h3>
              <p>Choose how you want to be contacted</p>
            </div>
            <Link href="/account/communication" className="btn-ghost btn-sm">
              Manage
            </Link>
          </div>

          <div className="account-settings-item">
            <div>
              <h3>Privacy</h3>
              <p>Manage your data and privacy settings</p>
            </div>
            <Link href="/account/privacy" className="btn-ghost btn-sm">
              Manage
            </Link>
          </div>
        </div>
      </section>

      <section className="account-section">
        <header className="account-section-header">
          <h2 className="account-section-title">Danger Zone</h2>
          <p className="account-section-desc">Irreversible actions</p>
        </header>

        <div className="account-danger-zone">
          <div className="account-danger-item">
            <div>
              <h3>Delete Account</h3>
              <p>Permanently delete your account and all associated data</p>
            </div>
            <button type="button" className="btn-ghost btn-sm btn-danger">
              Delete Account
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}