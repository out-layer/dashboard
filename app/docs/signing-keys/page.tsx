'use client';

import Link from 'next/link';
import { CodeBlock } from '@/components/ui/code-block';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Signing keys: ed25519 keys a WASI module signs with and never sees.
 *
 * Sourced from the out-layer/outlayer repo: `wasi-examples/CONNECTOR_MANIFEST.md`
 * (section `signing_keys`), `worker/wit/deps/signing-keys.wit`,
 * `keystore-worker/src/signing_keys.rs` and `wasi-examples/signing-key-probe/`.
 * Where this page and those files disagree, those files are the original.
 */

const REPO = 'https://github.com/out-layer/outlayer';
const PROBE_TREE = `${REPO}/tree/main/wasi-examples/signing-key-probe`;
const PROBE_MAIN = `${REPO}/blob/main/wasi-examples/signing-key-probe/src/main.rs`;
const PROBE_README = `${REPO}/blob/main/wasi-examples/signing-key-probe/README.md`;
const MANIFEST_DOC = `${REPO}/blob/main/wasi-examples/CONNECTOR_MANIFEST.md`;
const WIT_FILE = `${REPO}/blob/main/worker/wit/deps/signing-keys.wit`;

const MANIFEST_EXAMPLE = `"signing_keys": [
  {"path": "records", "type": "ed25519"},
  {"path": "votes", "type": "ed25519", "caller": "predecessor"},
  {"path": "payouts", "type": "ed25519", "vault": "vault.alice.near"}
]`;

const WIT = `package outlayer:signing-keys@0.1.0;

interface api {
    /// ed25519: the 32-byte public key.
    public-key: func(path: string, vault: option<string>) -> result<list<u8>, string>;

    /// ed25519 (RFC 8032) over the raw message bytes: no prehash, no prefix.
    /// 64-byte signature. At most 65536 bytes of message; sign a digest to cover more.
    sign: func(path: string, vault: option<string>, message: list<u8>) -> result<list<u8>, string>;
}

world signing-keys-host {
    import api;
}`;

const CARGO_TOML = `[package]
name = "my-signer"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "my-signer"
path = "src/main.rs"

[dependencies]
wit-bindgen = "0.36"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
hex = "0.4"

[profile.release]
opt-level = "z"
lto = true
strip = true`;

const MANIFEST_JSON = `{
  "signing_keys": [
    {"path": "records", "type": "ed25519"}
  ]
}`;

const MAIN_RS = `use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

// Bindings for \`outlayer:signing-keys\`, generated from wit/signing-keys.wit.
mod signing_keys_host {
    wit_bindgen::generate!({
        world: "signing-keys-host",
        path: "wit",
    });
}
use signing_keys_host::outlayer::signing_keys::api as signing_keys;

// The manifest, in the \`outlayer.manifest\` custom section: covered by the wasm's sha256.
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] =
    *include_bytes!("../manifest.json");

#[derive(Deserialize)]
struct Input {
    record: String,
}

#[derive(Serialize)]
struct Output {
    public_key: String, // hex, 32 bytes
    signature: String,  // hex, 64 bytes
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut raw = String::new();
    io::stdin().read_to_string(&mut raw)?;
    let input: Input = serde_json::from_str(&raw)?;

    // \`None\`: "records" is declared without a vault. Both calls return
    // Result<_, String>: an undeclared path, a vault that is not the declared
    // one, or a message over 64 KiB is an Err, never a trap.
    let public_key = signing_keys::public_key("records", None)?;
    let signature = signing_keys::sign("records", None, input.record.as_bytes())?;

    let out = Output {
        public_key: hex::encode(public_key),
        signature: hex::encode(signature),
    };
    print!("{}", serde_json::to_string(&out)?);
    io::stdout().flush()?;
    Ok(())
}`;

const BUILD_CHECK = `cargo build --target wasm32-wasip2 --release
W=target/wasm32-wasip2/release/my-signer.wasm
wasm-tools component wit $W | grep 'import outlayer:signing-keys/api'   # the import
wasm-tools print $W | grep -c 'outlayer.manifest'                       # must be at least 1`;

const VERIFY_PY = `from nacl.signing import VerifyKey   # pip install pynacl
VerifyKey(bytes.fromhex(public_key)).verify(b"order #1", bytes.fromhex(signature))  # raises on a bad signature`;

const NEP413_RS = `// Cargo.toml adds: borsh = { version = "1", features = ["derive"] }, sha2 = "0.10"

/// NEP-413's prefix, borsh-serialized as a little-endian u32 before the payload.
const NEP413_TAG: u32 = (1 << 31) + 413;

/// Field order is part of the format: borsh encodes in declaration order.
#[derive(borsh::BorshSerialize)]
struct Nep413Payload {
    message: String,
    nonce: [u8; 32], // the verifier's: it picks it and refuses one it has seen
    recipient: String,
    callback_url: Option<String>,
}

fn nep413_hash(payload: &Nep413Payload) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut bytes = borsh::to_vec(&NEP413_TAG).expect("a u32 serializes");
    bytes.extend(borsh::to_vec(payload).expect("the payload serializes"));
    Sha256::digest(&bytes).into()
}

fn sign_nep413(path: &str, payload: &Nep413Payload) -> Result<(String, Vec<u8>), String> {
    let signature = signing_keys::sign(path, None, &nep413_hash(payload))?;
    let account_id = hex::encode(signing_keys::public_key(path, None)?); // the implicit account
    Ok((account_id, signature))
}`;

function C({ children }: { children: React.ReactNode }) {
  return <code className="bg-card-muted px-1 rounded">{children}</code>;
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
      {children}
    </a>
  );
}

function Table({ head, rows }: { head: React.ReactNode[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto mt-3 mb-4">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left align-top">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground">
          {rows.map((row, r) => (
            <tr key={r} className={r < rows.length - 1 ? 'border-b border-border' : undefined}>
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SigningKeysDocsPage() {
  useHashNavigation();

  return (
    <div className="prose max-w-none">
      <h2 className="text-3xl font-bold mb-6 text-accent-text">Signing Keys</h2>

      <p className="text-foreground mb-6">
        ed25519 keys a WASI module signs with, through the <C>outlayer:signing-keys</C> host
        interface. Any project can declare them. For signing with the custody wallet&apos;s keys
        (EVM, Solana, NEP-413 over the wallet API) see{' '}
        <Link href="/docs/agent-custody#sign-message" className="text-accent-text underline">
          Agent Custody
        </Link>
        .
      </p>

      <div className="space-y-8">
        <section id="overview">
          <AnchorHeading id="overview">What a signing key is</AnchorHeading>
          <p className="text-foreground">
            <strong>A key the module signs with that no one ever sees.</strong> The keystore derives it
            inside the TEE from its master, for this project (or this exact build) and this caller. The
            module names the key by <C>path</C> and the host signs; the module gets back a public key or a
            signature, never the key.
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              The key is derived from what the run <em>is</em> — how its code is run, and its caller —
              never from anything the module says at runtime.
            </li>
            <li>
              The keystore derives it in the same request that decrypts the run&apos;s secrets and hands
              it to the worker for that one run. It lives in that run&apos;s memory only — never in the
              environment, stdin or a log — and is dropped with it. The master never leaves the keystore.
            </li>
            <li>
              Only a <C>wasm32-wasip2</C> component can use it: a WASI P1 module that declares keys is
              refused. See{' '}
              <Link href="/docs/wasi#wasi-preview" className="text-accent-text underline">
                WASI Preview 1 vs Preview 2
              </Link>
              .
            </li>
          </ul>
          <h3 className="text-lg font-semibold mt-4 mb-2">What it is for</h3>
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>
              Sign what the module returns — a record, a result, a receipt — so anyone can check it
              against a published public key without trusting the transport.
            </li>
            <li>
              Give each caller a stable ed25519 identity per project — a NEAR implicit account that can
              sign <a href="#nep413" className="text-accent-text underline">NEP-413</a> messages.
            </li>
          </ul>
        </section>

        <section id="manifest">
          <AnchorHeading id="manifest">Declaring keys in the manifest</AnchorHeading>
          <p className="text-foreground">
            Keys are declared in <C>signing_keys</C> of the project manifest — the{' '}
            <C>outlayer.manifest</C> custom section of the wasm, covered by its sha256:
          </p>
          <CodeBlock code={MANIFEST_EXAMPLE} language="json" filename="manifest.json" className="mt-3" />
          <Table
            head={['Field', 'Allowed', 'Meaning']}
            rows={[
              [
                <C key="f">path</C>,
                <span key="a"><C>[a-z0-9][a-z0-9_-]{'{0,31}'}</C>, unique in the list</span>,
                <span key="m">
                  The key&apos;s name <strong>and an input of its derivation</strong>. The same path gives
                  the same key for as long as its binding holds; another path is another key. Renaming a
                  path loses the key, any address made from its public key, and every signature checked
                  against it. Pick paths once.
                </span>,
              ],
              [<C key="f">type</C>, <C key="a">ed25519</C>, 'The only type.'],
              [
                <C key="f">bind</C>,
                <span key="a"><C>project</C> (default) | <C>wasm</C></span>,
                <span key="m">
                  How the code must be run to get the key, and what the key belongs to besides the caller.
                  See <a href="#binding" className="text-accent-text underline">Binding</a>. There is no
                  repository binding.
                </span>,
              ],
              [
                <C key="f">caller</C>,
                <span key="a"><C>signer</C> (default) | <C>predecessor</C></span>,
                <span key="m">
                  Which account of the run the key belongs to. See{' '}
                  <a href="#caller" className="text-accent-text underline">Signer or predecessor</a>.
                </span>,
              ],
              [
                <C key="f">vault</C>,
                'a NEAR account id',
                <span key="m">
                  Optional, <C>bind: &quot;project&quot;</C> only: derive from that vault&apos;s master
                  instead of the default one.
                </span>,
              ],
            ]}
          />
          <p className="text-foreground">
            <strong>At most 3 keys.</strong> A key with an unknown field is refused, not read with the
            field dropped: a misspelled <C>vault</C> would derive from the default master, a misspelled{' '}
            <C>bind</C> would bind to the project, a misspelled <C>caller</C> to the signer. A{' '}
            <C>type</C>, <C>bind</C> or <C>caller</C> value outside its list is refused the same way.
          </p>
          <p className="text-foreground mt-3">
            <strong>
              <C>vault</C>
            </strong>{' '}
            must belong to the project&apos;s owner: it is a direct sub-account of the owner (
            <C>vault.alice.near</C> for <C>alice.near/app</C>), and its contract&apos;s <C>parent</C> is
            that owner. A vault not named directly under the owner is refused on the two names alone,
            before any chain read. A vault that is missing, unreadable, not the owner&apos;s, unfunded or
            not loadable refuses the run; the default master is never used in its place. A <C>wasm</C> key
            cannot name a vault: code has no owner to own one. Vaults themselves:{' '}
            <Link href="/docs/vaults" className="text-accent-text underline">
              MPC Vaults
            </Link>
            .
          </p>
        </section>

        <section id="binding">
          <AnchorHeading id="binding">Binding: how keys are issued</AnchorHeading>
          <p className="text-foreground">Keys are issued strictly by how the code is run:</p>
          <Table
            head={['bind', 'Issued only to', 'The key belongs to', 'A new version of the code', 'The same key for']}
            rows={[
              [
                <span key="b"><C>project</C> (default)</span>,
                <span key="i">a run through a project whose version is a <C>WasmUrl</C> version</span>,
                "the project's on-chain uuid + the chosen caller",
                'keeps the key',
                'that caller, running any version of that project',
              ],
              [
                <C key="b">wasm</C>,
                'a direct run from a wasm URL, with no project',
                "the code's sha256 + the chosen caller",
                'gets new keys',
                'that caller, running that exact binary directly',
              ],
            ]}
          />
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>
              <strong>A GitHub-sourced run never gets keys</strong> — neither a project version built from
              a repository nor a repository run directly. Publish the code as a wasm URL instead.
            </li>
            <li>
              One key whose <C>bind</C> or <C>caller</C> does not match how the code is run refuses the
              whole run before it starts.
            </li>
            <li>
              One run never holds both kinds. The manifest is part of the wasm, so a binary that declares{' '}
              <C>project</C> keys runs only through a project, and one that declares <C>wasm</C> keys runs
              only directly: declare the one <C>bind</C> that matches how the module will be run.
            </li>
          </ul>
          <h3 className="text-lg font-semibold mt-4 mb-2">
            <C>project</C>
          </h3>
          <p className="text-foreground">
            The key belongs to the project&apos;s on-chain <C>uuid</C>, minted once at{' '}
            <C>create_project</C>, never to its <C>owner/name</C> id. So it survives code upgrades — every
            later version signs with the same key, and whoever publishes versions of the project decides
            what they sign — and it survives a transfer of the project: the id changes, the uuid stays,
            and the keys stay with it. A project deleted and created again under the same name is another
            project with another uuid, and so other keys. Another project, or another caller, gets another
            key. See{' '}
            <Link href="/docs/projects" className="text-accent-text underline">
              Projects
            </Link>
            .
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">
            <C>wasm</C>
          </h3>
          <p className="text-foreground">
            The key belongs to the code, not to a deployer: anyone who runs the exact binary directly gets
            keys for their own callers. A new build is a new key.
          </p>
        </section>

        <section id="caller">
          <AnchorHeading id="caller">Signer or predecessor</AnchorHeading>
          <p className="text-foreground">
            <strong>The caller is part of every key</strong>, and <C>caller</C> says which account of the
            run it is. The platform sets both accounts from the job; neither the code nor the input can.
          </p>
          <Table
            head={['caller', 'Account', 'On chain', 'Over HTTPS']}
            rows={[
              [
                <span key="c"><C>signer</C> (default)</span>,
                <C key="e">NEAR_USER_ACCOUNT_ID</C>,
                "the transaction's signer",
                "the payment key's owner",
              ],
              [
                <C key="c">predecessor</C>,
                <C key="e">NEAR_PREDECESSOR_ID</C>,
                'the account that called the contract: the DAO or wallet contract when one relayed the call, the signer when none did',
                'the signer',
              ],
            ]}
          />
          <p className="text-foreground">
            <strong>
              <C>signer</C>
            </strong>{' '}
            gives the person who signed the transaction one key across everything they do. The price: any
            contract the signer ever transacts with can start a run under the signer&apos;s key with input
            of its own — an <C>ft_transfer_call</C>, a DAO proposal, a wallet contract&apos;s callback all
            execute as the signer. So a module must never treat its input as the signer&apos;s intent.
          </p>
          <p className="text-foreground mt-3">
            <strong>
              <C>predecessor</C>
            </strong>{' '}
            gives the key to whoever actually called — the DAO or wallet contract itself when one relayed
            the call. The key is that contract&apos;s, not the signer&apos;s; on a payment through{' '}
            <C>ft_transfer_call</C> it binds to the token contract. A run that carries no predecessor is
            refused before it starts.
          </p>
          <p className="text-foreground mt-3">
            Both are legitimate; the module author chooses per key. A signer key and a predecessor key for
            one account are two keys. A run with no caller account is refused: the worker&apos;s
            placeholder for a missing account is refused by name.
          </p>
        </section>

        <section id="host-interface">
          <AnchorHeading id="host-interface">The host interface</AnchorHeading>
          <p className="text-foreground">
            <Ext href={WIT_FILE}>worker/wit/deps/signing-keys.wit</Ext> — copy it into your crate as{' '}
            <C>wit/signing-keys.wit</C>:
          </p>
          <CodeBlock code={WIT} language="text" filename="wit/signing-keys.wit" className="mt-3" />
          <Table
            head={['Function', 'Answers']}
            rows={[
              [
                <C key="f">public-key(path, vault)</C>,
                <span key="a">
                  <C>ok</C>: the 32-byte ed25519 public key; <C>err</C>: the reason
                </span>,
              ],
              [
                <C key="f">sign(path, vault, message)</C>,
                <span key="a">
                  <C>ok</C>: a 64-byte RFC 8032 signature over the raw message bytes — no prehash, no
                  prefix; <C>err</C>: the reason. At most 65536 bytes of message; sign a digest to cover
                  more
                </span>,
              ],
            ]}
          />
          <p className="text-foreground">
            <C>vault</C> names the key&apos;s declared vault exactly: <C>none</C> for a key declared without
            one, <C>some(&quot;&lt;vault&gt;&quot;)</C> for a key declared with that vault. Any other
            combination, an undeclared <C>path</C>, and a message over the limit are an <C>err</C> carrying
            the reason, never a trap. A module that imports the interface and declares no key gets an{' '}
            <C>err</C> for every path.
          </p>

          <h3 className="text-lg font-semibold mt-4 mb-2">A minimal Rust module</h3>
          <p className="text-foreground">
            Signs the <C>record</C> it is given with the key <C>records</C>. The <C>outlayer</C> SDK crate can
            sit beside it for storage and env; keep the generated bindings in their own module, as below, so
            the two <C>outlayer</C> names never meet.
          </p>
          <CodeBlock code={MANIFEST_JSON} language="json" filename="manifest.json" className="mt-3" />
          <CodeBlock code={CARGO_TOML} language="toml" filename="Cargo.toml" className="mt-3" />
          <CodeBlock code={MAIN_RS} language="rust" filename="src/main.rs" className="mt-3" />
          <p className="text-foreground mt-3">Build, then check the import and the manifest section:</p>
          <CodeBlock code={BUILD_CHECK} language="bash" className="mt-3" />
          <p className="text-foreground mt-3">
            Publish the wasm as a URL. With <C>bind: &quot;project&quot;</C>, deploy that URL as a project
            version and call the project; the same caller calling any later version gets the same{' '}
            <C>public_key</C>. With <C>bind: &quot;wasm&quot;</C>, run the URL directly with no project.
          </p>
          <p className="text-foreground mt-3">A signature verifies anywhere, for example:</p>
          <CodeBlock code={VERIFY_PY} language="python" className="mt-3" />
        </section>

        <section id="nep413">
          <AnchorHeading id="nep413">NEP-413 (NEAR signMessage)</AnchorHeading>
          <p className="text-foreground">
            <C>sign</C> takes raw bytes, so a module can make a NEP-413 signature with a signing key:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-foreground mt-2">
            <li>
              Build <C>borsh(u32 little-endian 2^31 + 413)</C> followed by{' '}
              <C>borsh(Payload {'{'} message, nonce: [u8; 32], recipient, callback_url: Option {'}'})</C>,
              fields in that order.
            </li>
            <li>Take the sha256 of those bytes.</li>
            <li>
              <C>sign</C> the 32-byte hash.
            </li>
          </ol>
          <p className="text-foreground mt-3">
            <strong>The public key is a NEAR implicit account</strong>: <C>accountId</C> is the lowercase
            hex of the 32-byte public key. It is a real NEAR account and needs no registration, so a NEP-413
            verifier checks the signature against that account like any wallet&apos;s. In NEAR&apos;s key
            format the public key is <C>ed25519:</C> + base58 of the same 32 bytes. The <C>nonce</C> is the
            verifier&apos;s: it chooses it, and refuses one it has seen before.
          </p>
          <CodeBlock code={NEP413_RS} language="rust" className="mt-3" />
          <p className="text-foreground mt-3">
            The full version, answering in a NEAR wallet&apos;s <C>signMessage</C> shape (<C>accountId</C>,{' '}
            <C>publicKey</C>, base64 <C>signature</C>), with a Python verifier, is <C>sign_nep413</C> in the
            probe&apos;s <Ext href={PROBE_MAIN}>src/main.rs</Ext> and its{' '}
            <Ext href={PROBE_README}>README</Ext>.
          </p>
        </section>

        <section id="security">
          <AnchorHeading id="security">Security rules</AnchorHeading>
          <div className="bg-destructive/10 border-l-4 border-red-500 p-4 my-4">
            <ul className="list-disc list-inside space-y-3 text-sm text-foreground">
              <li>
                <strong>Never sign caller-supplied bytes or digests verbatim.</strong> The key&apos;s public
                key is a real NEAR implicit account (and a Solana address): a signature over bytes the caller
                chose is a signature over whatever those bytes are — a transaction that empties the account,
                an authorization, a message the account never meant. Sign only messages the module composes
                itself, from fields it has parsed and checked, under a fixed prefix or structure of its own;
                refuse an input that asks for a signature over raw bytes.
              </li>
              <li>
                <strong>Do not hold funds on a signing key.</strong> It can sign NEAR transactions for its
                implicit account, and Solana ones for the same public key, so funds sent there are controlled
                only by the code, outside every wallet policy. Money goes through the{' '}
                <Link href="/docs/agent-custody" className="text-accent-text underline">
                  custody wallet
                </Link>
                . EVM is not supported: it needs secp256k1.
              </li>
              <li>
                <strong>
                  With <C>caller: &quot;signer&quot;</C>, the input is not the caller&apos;s intent.
                </strong>{' '}
                Any contract the caller interacts with can start a run under the caller&apos;s key with input
                of its own.
              </li>
              <li>
                <strong>
                  With <C>bind: &quot;wasm&quot;</C>, decide what to sign from the input and the code alone
                </strong>{' '}
                — never from secrets, environment variables or configuration. Whoever runs the binary controls
                those, and a user lured into calling someone else&apos;s run of the same code would sign under
                that runner&apos;s configuration.
              </li>
            </ul>
          </div>
          <h3 className="text-lg font-semibold mt-4 mb-2">What is trusted, and what is checked</h3>
          <p className="text-foreground">
            The worker reads the run off the job the coordinator gave it, never off the module, and sends
            the job&apos;s <C>user_account_id</C>, <C>predecessor_id</C>, <C>executed_wasm_sha256</C> and{' '}
            <C>project_id</C> with the key request; a <C>project_id</C> makes it a project run, none a
            direct run. The keystore takes those four fields <strong>on the trust of the worker&apos;s TEE
            attestation</strong>, exactly as it does for secrets. A worker that is not what it attests to be
            can name any caller, any build and any project, and receive their keys.
          </p>
          <p className="text-foreground mt-3">
            The keystore verifies <strong>on chain</strong> only what the chain can answer: for a project
            run, that the sha256 the worker measured on the running code is a <C>WasmUrl</C> version of that
            project and that the project exists with the owner its id names; for a <C>vault</C>, that it
            belongs to that owner. The worker checks every declared <C>bind</C> and <C>caller</C> against the
            run before any secret is decrypted; the keystore checks them again. A direct GitHub build is
            refused by the worker alone: the keystore sees only the hash of the bytes.
          </p>
        </section>

        <section id="refusals">
          <AnchorHeading id="refusals">Refusals</AnchorHeading>
          <p className="text-foreground">Refused before the code runs:</p>
          <Table
            head={['Cause', 'What clears it']}
            rows={[
              [
                <span key="c">a <C>wasm32-wasip1</C> build declares keys</span>,
                <span key="f">build for <C>wasm32-wasip2</C></span>,
              ],
              [
                <span key="c">
                  more than 3 keys, a bad or repeated <C>path</C>, an unknown field, a <C>type</C>,{' '}
                  <C>bind</C> or <C>caller</C> outside its list
                </span>,
                <span key="f">fix <C>manifest.json</C>, publish a new version</span>,
              ],
              [
                'keys declared on a GitHub-sourced run, when the manifest reaches the worker',
                'publish the code as a wasm URL',
              ],
              [<span key="c">a <C>project</C> key on a run with no project</span>, 'run it through its project'],
              [
                <span key="c">a <C>wasm</C> key on a run through a project</span>,
                <span key="f">run the wasm URL directly, or declare the key <C>project</C></span>,
              ],
              [
                <span key="c">a <C>predecessor</C> key on a run that carries no predecessor</span>,
                <span key="f">call through a contract, or declare the key <C>signer</C></span>,
              ],
              [
                'a project run whose running code is not a WasmUrl version of that project, or whose project does not exist or is not owned by the account its id names',
                'deploy the wasm URL as a version of that project',
              ],
              [
                <span key="c">
                  <C>vault</C> on a <C>wasm</C> key; a vault not named directly under the project&apos;s
                  owner, not the owner&apos;s, or not available
                </span>,
                'fix the manifest, or the vault',
              ],
              ['a run with no caller account', 'call with a payment key, or on chain'],
              ['a worker or keystore without signing-key support', 'none from your side'],
            ]}
          />
          <p className="text-foreground">
            Inside a run, <C>public-key</C> and <C>sign</C> answer <C>err</C> for an undeclared <C>path</C>,
            a <C>vault</C> argument that is not the key&apos;s declared vault, or a message over 65536 bytes.
            A GitHub-sourced module whose manifest does not reach the worker runs, and every call answers{' '}
            <C>err</C>.
          </p>
        </section>

        <section id="example">
          <AnchorHeading id="example">Example: signing-key-probe</AnchorHeading>
          <p className="text-foreground">
            <Ext href={PROBE_TREE}>wasi-examples/signing-key-probe</Ext> exercises every host function,
            binding and refusal, with one build per manifest (<C>bind: &quot;project&quot;</C>,{' '}
            <C>bind: &quot;wasm&quot;</C>, and a vault key). Its <C>sign</C> operation signs whatever bytes
            it is handed — that is what a probe is for, and exactly what a production module must not do.
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              <Ext href={PROBE_MAIN}>src/main.rs</Ext> — the bindings, and <C>sign_nep413</C>
            </li>
            <li>
              <Ext href={PROBE_README}>README.md</Ext> — builds, operations, and the NEP-413 recipe with a
              Python verifier
            </li>
            <li>
              <Ext href={MANIFEST_DOC}>CONNECTOR_MANIFEST.md</Ext> — the full manifest reference, section{' '}
              <C>signing_keys</C>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
