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
              your agent asks to send, such as recipients, subject, body and attachments. Nothing is read
              back out of your mailbox: a send-only scope returns no message, no address book and no profile
              data. The only derived data we hold is a count of messages sent per day, which your own limit is
              measured against; it is a number and a date, with no content and no recipients in it.
            </li>
            <li>
              <strong>Use:</strong> solely to send the messages your agent requests, within the rules you
              configure for it. Neither the authorisation nor message content is used for any other purpose,
              including advertising, credit or lending decisions, or profiling.
            </li>
            <li>
              <strong>Storage and protection:</strong> the authorisation is encrypted in your browser, before
              it reaches any server of ours, to a key held by a hardware-isolated environment (an Intel TDX
              confidential virtual machine). Only code whose hash your record authorises, attested by Intel,
              receives the key to decrypt it; our operators cannot. Message content exists only in that
              environment&rsquo;s memory for the duration of the send.
            </li>
            <li>
              <strong>Retention and deletion:</strong> the encrypted authorisation is kept until you delete
              the record or revoke the connector at Google &mdash; either alone ends access. Message content
              is not retained once the send returns. Deleting the record removes it from the contract&rsquo;s
              state; because the record lives on a public blockchain, the transaction that stored the
              ciphertext remains in that chain&rsquo;s history, where it stays undecryptable and, once you
              have revoked at Google, of no use to anyone.
            </li>
            <li>
              <strong>Sharing:</strong> message content is transmitted to Google to deliver it. We do not sell
              Google user data or transfer it to data brokers, advertisers or any other third party, and we do
              not use it for advertising. We do not use it to develop, improve or train artificial-intelligence
              or machine-learning models, and we do not transfer it to any third-party service that would use
              it to train theirs. We do not allow humans to read it, except with your consent, for security
              purposes, or to comply with applicable law.
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
