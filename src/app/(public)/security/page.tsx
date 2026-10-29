import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SupportSection } from "@/components/support/SupportSection";
import { CopyReportTemplateButton } from "@/components/security/CopyReportTemplateButton";
import { buildMetadata } from "@/lib/seo";

const pageMetadata = buildMetadata({
  title: "Security Research & Responsible Disclosure | KeebForge",
  description:
    "How security researchers can privately report potential vulnerabilities affecting KeebForge.in.",
  path: "/security",
  noIndex: true,
});

export const metadata: Metadata = {
  ...pageMetadata,
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
    },
  },
};

const REPORT_TEMPLATE = `Subject: Security Vulnerability Report — [Short Description]

Vulnerability:
[Short description]

Affected URL / Endpoint:
[URL]

Severity / Impact:
[Impact]

Steps to Reproduce:
1.
2.
3.

Proof of Concept:
[Details/screenshots/request/response]

Security Impact:
[What an attacker could do]

Suggested Fix:
[Optional]

Researcher Contact:
[Email / preferred contact]

Can KeebForge publicly recognize you?
[Yes / No]

If yes, preferred name/handle:
[Name / Handle]`;

export default function SecurityPage() {
  return (
    <main>
      <PageHero
        tag="SECURITY"
        title="Security Research & Responsible Disclosure"
        desc="How security researchers, penetration testers and bug hunters can report potential vulnerabilities affecting KeebForge.in."
      />

      <section className="svc-section">
        <div className="wrap">
          <div className="support-stack">
            <SupportSection title="Reporting security issues" id="security-intro">
              <p>
                This page is intended for security researchers and other
                technical professionals. If you believe you have found a
                vulnerability affecting KeebForge.in, please report it privately
                so we can investigate and address it.
              </p>
              <p>
                Please do not publicly disclose an unresolved vulnerability
                before giving us a reasonable opportunity to investigate and
                respond.
              </p>
            </SupportSection>

            <SupportSection
              title="No bug bounty or monetary rewards"
              id="security-bounty"
            >
              <p>
                <strong>
                  KeebForge does not currently operate a paid bug bounty program
                  and does not offer monetary rewards for vulnerability reports.
                </strong>
              </p>
              <p>
                KeebForge is a small company/project and does not currently have
                a formal bug bounty budget. We genuinely appreciate responsible
                security researchers who take the time to report vulnerabilities
                to us. Your reports help us identify weaknesses, improve the
                security of KeebForge, and protect our users.
              </p>
              <p>
                With your permission, and where appropriate, we may recognize
                researchers through an appreciation post, a certificate of
                appreciation, or recognition using the name or handle you
                provide. Recognition is optional and may depend on the
                circumstances and your preference. We cannot guarantee that
                recognition will be available for every report.
              </p>
            </SupportSection>

            <SupportSection
              title="Responsible disclosure"
              id="security-disclosure"
            >
              <p>
                If you want to help us fix an issue, please follow these
                guidelines:
              </p>
              <ul>
                <li>Report vulnerabilities privately.</li>
                <li>
                  Only test accounts, systems and resources that you own or have
                  explicit authorization to test.
                </li>
                <li>
                  Give KeebForge reasonable time to investigate and address the
                  issue before any public disclosure.
                </li>
                <li>
                  Stop testing once you have enough evidence to demonstrate the
                  vulnerability.
                </li>
                <li>Do not access information belonging to other users.</li>
                <li>Do not modify or delete data.</li>
                <li>Do not disrupt services or degrade availability.</li>
                <li>
                  Do not use social engineering, phishing, spam or physical
                  attacks.
                </li>
                <li>
                  Do not run denial-of-service, resource-exhaustion or
                  destructive testing.
                </li>
                <li>
                  Avoid collecting personal information that is not necessary to
                  demonstrate the issue. Redact personal data from evidence where
                  possible.
                </li>
              </ul>
              <p>
                KeebForge appreciates good-faith security research and asks
                researchers to follow the responsible disclosure guidelines
                described on this page. This page does not create a legal safe
                harbor, immunity from prosecution, or a guarantee of anonymity or
                confidentiality.
              </p>
            </SupportSection>

            <SupportSection title="Safe testing" id="security-testing">
              <p>
                Security testing should be controlled, non-destructive, and
                limited to the minimum needed to demonstrate the vulnerability.
              </p>
              <p>
                If a vulnerability involves access to another user&apos;s
                information, stop once you have established that unauthorized
                access is possible. Report the issue rather than collecting
                additional information. Do not download, copy, modify or retain
                customer data.
              </p>
              <p>
                Use test accounts and test data wherever possible. If you must
                include evidence in a report, redact names, email addresses,
                phone numbers, addresses, payment details and other personal
                information.
              </p>
            </SupportSection>

            <SupportSection title="What to include in a report" id="security-what">
              <p>
                A useful report helps us reproduce and assess the issue quickly.
                Please include as much of the following as applies:
              </p>

              <p>
                <strong>1. Vulnerability title</strong>
              </p>
              <p>A short description of the issue.</p>

              <p>
                <strong>2. Severity / impact</strong>
              </p>
              <p>Explain what an attacker could potentially do.</p>

              <p>
                <strong>3. Affected URL</strong>
              </p>
              <p>
                Provide the affected page, API or endpoint if applicable.
              </p>

              <p>
                <strong>4. Steps to reproduce</strong>
              </p>
              <p>Provide clear, numbered reproduction steps.</p>

              <p>
                <strong>5. Proof of concept</strong>
              </p>
              <p>
                Include screenshots, requests/responses, a short video or
                minimal proof-of-concept code where useful. Please redact
                personal data.
              </p>

              <p>
                <strong>6. Security impact</strong>
              </p>
              <ul>
                <li>What could be accessed?</li>
                <li>What could be modified?</li>
                <li>Who could be affected?</li>
                <li>What permissions are required?</li>
                <li>Is authentication required?</li>
                <li>Does exploitation require user interaction?</li>
              </ul>

              <p>
                <strong>7. Suggested remediation</strong>
              </p>
              <p>
                If you know how the vulnerability could be fixed, you may include
                a recommendation. This is optional.
              </p>
            </SupportSection>

            <SupportSection title="How to report" id="security-contact">
              <p>
                Send security reports to KeebForge&apos;s official contact
                address with{" "}
                <strong>Security Vulnerability Report</strong> in the subject
                line.
              </p>
              <div className="mt-4 rounded-lg border border-[var(--bdr)] bg-[var(--bg1)] p-4">
                <p className="mb-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[var(--t3)]">
                  Security reports
                </p>
                <a
                  href="mailto:contact@keebforge.in?subject=Security%20Vulnerability%20Report"
                  className="break-all font-mono text-sm"
                >
                  contact@keebforge.in
                </a>
                <p className="mt-3 text-xs text-[var(--t3)]">
                  This is the verified KeebForge contact address. A separate
                  security-specific inbox is not currently configured.
                </p>
              </div>
              <p>
                If you are unsure whether your issue qualifies as a security
                vulnerability, you may still contact us and explain the issue.
                We will make reasonable efforts to review and respond to valid
                security reports.
              </p>
              <p>
                We do not guarantee a fixed response time, a fix deadline, a
                reward, public recognition, or CVE assignment.
              </p>
              <p>
                If multiple researchers report the same underlying
                vulnerability, recognition may be given to the first valid
                report received, at KeebForge&apos;s discretion.
              </p>
            </SupportSection>

            <SupportSection title="Report template" id="security-template">
              <p>
                Copy and complete this template. Remove any information that is
                not necessary to demonstrate the issue.
              </p>
              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--bdr)] bg-[var(--bg1)]">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--bdr)] px-3 py-2">
                  <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--t3)]">
                    Template
                  </span>
                  <CopyReportTemplateButton text={REPORT_TEMPLATE} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap p-4 font-mono text-[0.76rem] leading-relaxed text-[var(--t2)]">
                  {REPORT_TEMPLATE}
                </pre>
              </div>
            </SupportSection>

            <SupportSection
              title="Out of scope and unacceptable testing"
              id="security-out-of-scope"
            >
              <p>
                Please do not perform any of the following while researching
                KeebForge:
              </p>
              <ul>
                <li>Denial-of-service or resource-exhaustion attacks.</li>
                <li>Spam or automated scanning that causes significant load.</li>
                <li>
                  Social engineering of KeebForge staff, contractors or
                  customers.
                </li>
                <li>Phishing.</li>
                <li>Physical attacks.</li>
                <li>
                  Attacks against third-party infrastructure or unrelated
                  services.
                </li>
                <li>Destructive actions.</li>
                <li>Deleting or modifying production data.</li>
                <li>
                  Accessing or downloading customer data that is not necessary
                  to demonstrate the issue.
                </li>
                <li>
                  Attempting to compromise unrelated third-party services.
                </li>
              </ul>
              <p>
                If a vulnerability can be demonstrated without accessing personal
                data, please use that approach.
              </p>
            </SupportSection>

            <SupportSection title="Privacy of security reporters" id="security-privacy">
              <p>
                Information you provide in a vulnerability report may be
                processed to investigate the vulnerability, communicate with
                you, fix the issue, maintain security records, and improve
                KeebForge&apos;s security.
              </p>
              <p>
                We do not currently publish a fixed retention period for
                security-report correspondence. We do not promise anonymity or
                confidentiality. See our{" "}
                <a href="/privacy-policy">Privacy Policy</a> for more information
                about how KeebForge handles personal data.
              </p>
            </SupportSection>

            <SupportSection
              title="Technical reference"
              id="security-architecture"
            >
              <p>
                Researchers who need additional context about the
                application&apos;s architecture can review:
              </p>
              <p>
                <strong>Architecture Overview:</strong>
                <br />
                <a
                  href="https://keebforge.in/architecture.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://keebforge.in/architecture.html
                </a>
              </p>
              <p>
                The architecture page provides additional technical context about
                the KeebForge application. It may not reflect every deployment
                detail. No other internal documentation is provided here.
              </p>
            </SupportSection>
          </div>
        </div>
      </section>
    </main>
  );
}
