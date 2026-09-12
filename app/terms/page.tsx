import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern the use of OutLayer.',
};

const EFFECTIVE = '11 September 2026';
const CONTACT = 'security@outlayer.ai';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3">
      <h3 className="text-xl font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="prose max-w-3xl">
      <h2 className="text-3xl font-bold mb-2 text-accent-text">Terms of Service</h2>
      <p className="text-muted-foreground mb-8">Effective {EFFECTIVE}</p>

      <div className="space-y-8 text-foreground">
        <Section id="acceptance" title="Acceptance">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the OutLayer website,
            dashboard, API, smart contracts, connectors and related services (the &ldquo;Services&rdquo;). By
            using the Services you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>.
            If you use the Services on behalf of an organisation, you agree to these Terms on its behalf. If you
            do not agree, do not use the Services.
          </p>
        </Section>

        <Section id="eligibility" title="Eligibility">
          <p>
            You must be at least 18 years old and able to form a binding contract. You may not use the Services
            if you are located in, or a resident of, a jurisdiction subject to comprehensive sanctions, or if you
            are a person with whom dealings are prohibited under applicable sanctions laws. You are responsible
            for complying with the laws that apply to you.
          </p>
        </Section>

        <Section id="services" title="The Services">
          <p>
            The Services provide verifiable computation and custody tools for software agents, including
            priced integrations with third-party services. The Services are under active development and may
            change, be suspended or be discontinued at any time, in whole or in part, without notice.
          </p>
        </Section>

        <Section id="accounts" title="Accounts, keys and wallets">
          <p>
            You are responsible for your blockchain accounts, keys and credentials and for all activity that
            occurs under them. Keep them secure. We cannot recover lost keys or reverse transactions. Actions an
            agent takes within the permissions you configure are your actions.
          </p>
        </Section>

        <Section id="fees" title="Fees">
          <p>
            Some Services are charged for, at the prices published for them at the time of use. Charges may
            apply to a request even when a third-party service does not complete it. Except where required by
            law or stated in the Services, fees are non-refundable. You are responsible for any taxes that apply
            to your use of the Services.
          </p>
        </Section>

        <Section id="acceptable-use" title="Acceptable use">
          <p>You agree not to use the Services to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>violate any law, regulation or third-party right;</li>
            <li>send unsolicited, deceptive or abusive messages, or impersonate any person or entity;</li>
            <li>
              access any service, market or product you are not permitted to use in your jurisdiction, or evade
              restrictions that apply to you;
            </li>
            <li>interfere with, disrupt, attack or probe the Services or other users without authorisation; or</li>
            <li>breach the terms of any third-party service you connect.</li>
          </ul>
          <p>We may investigate and take action, including suspending access, for violations of these Terms.</p>
        </Section>

        <Section id="third-party" title="Third-party services">
          <p>
            The Services may interact with third-party services, including email providers, financial
            institutions, blockchains and trading venues. Your use of them is governed by their own terms. We do
            not control and are not responsible for third-party services, their availability, their actions or
            any losses they cause.
          </p>
        </Section>

        <Section id="content" title="Your content">
          <p>
            You retain your rights in the content, code, inputs and data you provide. You grant us a licence to
            host, process and transmit them as necessary to provide the Services to you.
          </p>
        </Section>

        <Section id="no-advice" title="No advice; risks">
          <p>
            Nothing in the Services is financial, investment, legal or tax advice. Digital assets, trading and
            prediction markets involve significant risk, including the loss of all funds. Software, smart
            contracts, cryptographic systems and third-party services may contain errors or be compromised. You
            use the Services at your own risk.
          </p>
        </Section>

        <Section id="ip" title="Intellectual property">
          <p>
            Open-source components of OutLayer are licensed under their respective licences. Except for those
            licences and the rights expressly granted in these Terms, we reserve all rights in the Services.
          </p>
        </Section>

        <Section id="disclaimer" title="Disclaimer of warranties">
          <p>
            THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY
            KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
            PURPOSE, TITLE AND NON-INFRINGEMENT, TO THE FULLEST EXTENT PERMITTED BY LAW.
          </p>
        </Section>

        <Section id="liability" title="Limitation of liability">
          <p>
            TO THE FULLEST EXTENT PERMITTED BY LAW, WE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA OR DIGITAL ASSETS,
            ARISING OUT OF OR RELATING TO THE SERVICES. OUR TOTAL LIABILITY FOR ANY CLAIM IS LIMITED TO THE FEES
            YOU PAID US FOR THE SERVICES IN THE THREE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM.
          </p>
        </Section>

        <Section id="indemnity" title="Indemnification">
          <p>
            You agree to indemnify and hold us harmless from any claims, losses and expenses, including
            reasonable legal fees, arising out of your use of the Services, your content or your breach of these
            Terms.
          </p>
        </Section>

        <Section id="termination" title="Suspension and termination">
          <p>
            You may stop using the Services at any time. We may suspend or terminate your access at any time,
            including for a breach of these Terms. Provisions that by their nature should survive termination
            will survive it.
          </p>
        </Section>

        <Section id="changes" title="Changes">
          <p>
            We may update these Terms from time to time. When we do, we will change the effective date above.
            Continued use of the Services after an update means you accept the revised Terms.
          </p>
        </Section>

        <Section id="general" title="General">
          <p>
            These Terms are the entire agreement between you and us about the Services. If any provision is found
            unenforceable, the rest remains in effect. Our failure to enforce a provision is not a waiver of it.
          </p>
        </Section>

        <Section id="contact" title="Contact">
          <p>
            Questions about these Terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>
      </div>
    </div>
  );
}
