import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How OutLayer collects, uses and protects information, including data received from Google APIs.',
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

export default function PrivacyPage() {
  return (
    <div className="prose max-w-3xl">
      <h2 className="text-3xl font-bold mb-2 text-accent-text">Privacy Policy</h2>
      <p className="text-muted-foreground mb-8">Effective {EFFECTIVE}</p>

      <div className="space-y-8 text-foreground">
        <Section id="scope" title="Scope">
          <p>
            This policy describes how OutLayer (&ldquo;we&rdquo;, &ldquo;us&rdquo;) handles information in
            connection with the OutLayer website, dashboard, API and related services (the
            &ldquo;Services&rdquo;). By using the Services you agree to this policy. It should be read
            together with our <Link href="/terms">Terms of Service</Link>.
          </p>
        </Section>

        <Section id="collect" title="Information we collect">
          <p>Depending on how you use the Services, we may collect:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Information you provide</strong>, such as account identifiers, the inputs you submit to
              the Services, and any messages you send us.
            </li>
            <li>
              <strong>Usage and technical information</strong>, such as IP address, browser and device
              information, request metadata, and logs of how the Services are used.
            </li>
            <li>
              <strong>Transaction and payment information</strong>, such as balances, charges and the
              records needed to provide and bill for the Services.
            </li>
            <li>
              <strong>Public blockchain information</strong>, such as account names, transactions and
              contract state, which are public by the nature of a blockchain.
            </li>
            <li>
              <strong>Information from third-party services</strong> you choose to connect, as described
              below.
            </li>
          </ul>
        </Section>

        <Section id="keys" title="Keys and secrets">
          <p>
            The Services are designed so that wallet private keys and the secrets you store are protected
            by hardware-isolated environments and are not accessible to our staff in readable form. Secrets
            are encrypted before they are stored and are used only to perform the operations you request.
          </p>
        </Section>

        <Section id="use" title="How we use information">
          <p>We use information to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>provide, operate, maintain and improve the Services;</li>
            <li>process transactions and payments;</li>
            <li>secure the Services, prevent abuse and enforce our terms;</li>
            <li>communicate with you about the Services; and</li>
            <li>comply with legal obligations.</li>
          </ul>
          <p>We do not sell personal information, and we do not use it for advertising.</p>
        </Section>

        <Section id="share" title="How we share information">
          <p>We may share information:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>with service providers that help us operate the Services, such as hosting and network providers;</li>
            <li>with third-party services when you direct us to, for example by calling a connector;</li>
            <li>if required by law, or to protect the rights, safety and security of our users and the Services; and</li>
            <li>in connection with a merger, acquisition or sale of assets, subject to this policy.</li>
          </ul>
        </Section>

        <Section id="connectors" title="Connectors and third-party services">
          <p>
            Connectors act on third-party services on your behalf, such as email providers, banks or trading
            venues. When you use one, the information needed for the request is sent to that service, and its
            own terms and privacy policy govern what it receives.
          </p>
        </Section>

        <Section id="google" title="Google user data">
          <p>
            The Gmail connector lets an agent send email from a Gmail account whose owner has connected it.
            It requests only the <code>https://www.googleapis.com/auth/gmail.send</code> scope, which allows
            sending email on the account&rsquo;s behalf. It does not read, list, modify or delete the
            messages in the mailbox.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Data accessed:</strong> the authorisation you grant, and the content of the messages
              your agent asks to send, such as recipients, subject, body and attachments.
            </li>
            <li>
              <strong>Use:</strong> solely to send the messages your agent requests, within the rules you
              configure for it.
            </li>
            <li>
              <strong>Storage and protection:</strong> the authorisation is stored encrypted and is used only
              inside hardware-isolated environments.
            </li>
            <li>
              <strong>Sharing:</strong> message content is transmitted to Google to deliver it. We do not sell
              Google user data, use it for advertising, or use it to develop, improve or train generalised
              artificial-intelligence or machine-learning models. We do not allow humans to read it, except
              with your consent, for security purposes, or to comply with applicable law.
            </li>
            <li>
              <strong>Revoking access:</strong> you can revoke the connector&rsquo;s access at any time at{' '}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                myaccount.google.com/permissions
              </a>
              .
            </li>
          </ul>
          <p>
            OutLayer&rsquo;s use and transfer to any other app of information received from Google APIs will
            adhere to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section id="cookies" title="Cookies and local storage">
          <p>
            The Services may use cookies, local storage and similar technologies to keep you signed in,
            remember your settings, and understand how the Services are used. You can control these through
            your browser settings; some features may not work without them.
          </p>
        </Section>

        <Section id="retention" title="Retention">
          <p>
            We keep information for as long as needed for the purposes described in this policy, including to
            provide the Services, meet legal and accounting obligations, resolve disputes and enforce our
            agreements. Information recorded on a public blockchain cannot be deleted by us or anyone else.
          </p>
        </Section>

        <Section id="security" title="Security">
          <p>
            We use technical and organisational measures designed to protect information. No method of
            transmission or storage is completely secure, and we cannot guarantee absolute security.
          </p>
        </Section>

        <Section id="rights" title="Your choices and rights">
          <p>
            Depending on where you live, you may have rights to access, correct or delete personal information
            about you, or to object to or restrict its processing. To make a request, contact us at{' '}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We may need to verify that you control the relevant
            account before acting on a request.
          </p>
        </Section>

        <Section id="international" title="International transfers">
          <p>
            The Services are operated using infrastructure in more than one country, and information may be
            processed outside the country where you live.
          </p>
        </Section>

        <Section id="children" title="Children">
          <p>
            The Services are not directed to individuals under 18, and we do not knowingly collect personal
            information from them.
          </p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            We may update this policy from time to time. When we do, we will change the effective date above.
            Continued use of the Services after an update means you accept the revised policy.
          </p>
        </Section>

        <Section id="contact" title="Contact">
          <p>
            Questions about this policy: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>
      </div>
    </div>
  );
}
