'use client';

import Link from 'next/link';
import { CodeBlock } from '@/components/ui/code-block';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Signing keys: ed25519 and secp256k1 keys a WASI module signs with and never sees.
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
const PROBE_SECP_MANIFEST = `${REPO}/blob/main/wasi-examples/signing-key-probe/manifests/project-secp.json`;

const MANIFEST_EXAMPLE = `"signing_keys": [
  {"path": "records", "type": "ed25519"},
  {"path": "votes", "type": "ed25519", "caller": "predecessor"},
  {"path": "payouts", "type": "secp256k1", "vault": "vault.alice.near"}
]`;

const WIT = `package outlayer:signing-keys@0.1.0;

interface api {
    /// A NEP-413 signature in the shape a NEAR wallet's \`signMessage\` answers.
    record nep413-signature {
        /// The key's NEAR implicit account: its 32-byte public key, lowercase hex.
        account-id: string,
        /// \`ed25519:\` followed by the base58 of the 32-byte public key.
        public-key: string,
        /// The 64-byte ed25519 signature, standard base64 with padding.
        signature: string,
    }

    /// ed25519: the 32-byte public key.
    /// secp256k1: 64 bytes, x ‖ y — the uncompressed SEC1 point without its 0x04 prefix.
    public-key: func(path: string, vault: option<string>) -> result<list<u8>, string>;

    /// ed25519: RFC 8032 over the raw message bytes, at most 65536; 64 bytes out.
    /// secp256k1: exactly a 32-byte prehash, signed as it is; 65 bytes out, r ‖ s ‖ v.
    sign: func(path: string, vault: option<string>, message: list<u8>) -> result<list<u8>, string>;

    /// NEP-413 (NEAR signMessage) with an ed25519 key; the host builds the signed bytes.
    sign-nep413: func(path: string, vault: option<string>, message: string, recipient: string, nonce: list<u8>, callback-url: option<string>) -> result<nep413-signature, string>;
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

const PROOF_MANIFEST_JSON = `{
  "signing_keys": [
    {"path": "identity", "type": "ed25519"}
  ]
}`;

const PROOF_RS = `use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

// Bindings and the manifest section exactly as in the minimal module above.
mod signing_keys_host {
    wit_bindgen::generate!({
        world: "signing-keys-host",
        path: "wit",
    });
}
use signing_keys_host::outlayer::signing_keys::api as signing_keys;

#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] =
    *include_bytes!("../manifest.json");

// The module fixes what it signs; the verifier chooses only the nonce.
const MESSAGE: &str = "my-signer key proof";
const RECIPIENT: &str = "my-signer";

#[derive(Deserialize)]
struct Input {
    nonce_hex: String, // 32 bytes, chosen by the verifier
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    account_id: String, // hex of the public key: the NEAR implicit account
    public_key: String, // "ed25519:" + base58
    signature: String,  // base64
    message: &'static str,
    recipient: &'static str,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut raw = String::new();
    io::stdin().read_to_string(&mut raw)?;
    let input: Input = serde_json::from_str(&raw)?;
    let nonce = hex::decode(&input.nonce_hex)?;

    // The host builds the NEP-413 bytes, hashes and signs them. An Err: a key
    // that is not ed25519, a nonce that is not 32 bytes, an oversized field.
    let signed = signing_keys::sign_nep413("identity", None, MESSAGE, RECIPIENT, &nonce, None)?;

    let out = Output {
        account_id: signed.account_id,
        public_key: signed.public_key,
        signature: signed.signature,
        message: MESSAGE,
        recipient: RECIPIENT,
    };
    print!("{}", serde_json::to_string(&out)?);
    io::stdout().flush()?;
    Ok(())
}`;

const PROOF_VERIFY_PY = `import base64, hashlib, struct
import base58                          # pip install base58 pynacl
from nacl.signing import VerifyKey

def borsh_string(s): return struct.pack('<I', len(s)) + s

def check_key_proof(answer, nonce):    # nonce: the 32 bytes you sent
    public_key = base58.b58decode(answer["publicKey"].removeprefix("ed25519:"))
    assert answer["accountId"] == public_key.hex()          # the implicit account IS the key
    payload = (borsh_string(b"my-signer key proof") + nonce
               + borsh_string(b"my-signer") + b"\\x00")      # callback_url: None
    digest = hashlib.sha256(struct.pack('<I', 2**31 + 413) + payload).digest()
    VerifyKey(public_key).verify(digest, base64.b64decode(answer["signature"]))  # raises if bad
    return answer["accountId"]`;

const EVM_MANIFEST_JSON = `{
  "signing_keys": [
    {"path": "evm", "type": "secp256k1"}
  ]
}`;

const EVM_RS = `// Cargo.toml adds: sha3 = "0.10"
use sha3::{Digest, Keccak256};

/// The key's EVM address: the last 20 bytes of keccak256 of the 64-byte x ‖ y.
fn evm_address(path: &str) -> Result<String, String> {
    let public_key = signing_keys::public_key(path, None)?; // 64 bytes for a secp256k1 key
    Ok(format!("0x{}", hex::encode(&Keccak256::digest(&public_key)[12..])))
}

/// EIP-191 \`personal_sign\` over a message this module composed itself.
fn personal_sign(path: &str, message: &str) -> Result<String, String> {
    let mut hasher = Keccak256::new();
    hasher.update(format!("\\x19Ethereum Signed Message:\\n{}", message.len()));
    hasher.update(message);
    let prehash: [u8; 32] = hasher.finalize().into();
    let mut signature = signing_keys::sign(path, None, &prehash)?; // r ‖ s ‖ v, v ∈ {0, 1}
    signature[64] += 27; // EVM wants v + 27
    Ok(format!("0x{}", hex::encode(signature)))
}`;

const EVM_VERIFY_PY = `import coincurve
from Crypto.Hash import keccak         # pip install coincurve pycryptodome

def keccak256(data):
    h = keccak.new(digest_bits=256); h.update(data); return h.digest()

def recover_address(message, signature_hex):
    sig = bytes.fromhex(signature_hex.removeprefix("0x"))
    prehash = keccak256(b"\\x19Ethereum Signed Message:\\n" + str(len(message.encode())).encode() + message.encode())
    public_key = coincurve.PublicKey.from_signature_and_message(sig[:64] + bytes([sig[64] - 27]), prehash, hasher=None)
    return "0x" + keccak256(public_key.format(compressed=False)[1:])[12:].hex()

assert recover_address(message, signature) == address`;

const VERIFY_CALL = `# An HTTPS call: the response you kept carries call_id, output and attestation_url
curl -s "https://api.outlayer.ai/attestations/by-call/$CALL_ID"     # the attestation record
outlayer-verify call "$CALL_ID" --input '{"nonce_hex":"…"}' --output '<the output you received>'

# An on-chain run
outlayer-verify tx <near-tx-hash>`;

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
        ed25519 and secp256k1 keys a WASI module signs with, through the{' '}
        <C>outlayer:signing-keys</C> host interface. Any project can declare them. For signing with the custody wallet&apos;s keys
        (EVM, Solana, NEP-413 over the wallet API) see{' '}
        <Link href="/docs/agent-custody#sign-message" className="text-accent-text underline">
          Agent Custody
        </Link>
        . To seal data rather than sign it, see{' '}
        <Link href="/docs/encryption-keys" className="text-accent-text underline">
          Encryption Keys
        </Link>
        : declared and issued by the same rules, in a namespace of their own.
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
            <li>
              Sign for EVM with a secp256k1 key — an EVM address, signatures <C>ecrecover</C> accepts. See{' '}
              <a href="#evm" className="text-accent-text underline">EVM</a>.
            </li>
            <li>
              Let anyone check once that a public key is this project&apos;s, derived in the TEE — see{' '}
              <a href="#prove-key" className="text-accent-text underline">Prove a key is the project&apos;s</a>.
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
              [
                <C key="f">type</C>,
                <span key="a"><C>ed25519</C> | <C>secp256k1</C></span>,
                <span key="m">
                  The key&apos;s algorithm — see{' '}
                  <a href="#key-types" className="text-accent-text underline">Key types</a> — and an input of
                  its derivation (<C>signing-key:v1:{'{type}'}:{'{project|wasm}'}:…</C>), so one secret never
                  serves two algorithms. A path is declared once whatever its type: the same path under the
                  other type would be another key.
                </span>,
              ],
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

        <section id="key-types">
          <AnchorHeading id="key-types">Key types</AnchorHeading>
          <Table
            head={['type', 'public-key', 'sign: input', 'sign: output', 'sign-nep413']}
            rows={[
              [
                <C key="t">ed25519</C>,
                '32 bytes — in hex, a NEAR implicit account; also a Solana address',
                'the raw message bytes, at most 65536 — no prehash, no prefix; sign a digest to cover more',
                '64 bytes, RFC 8032',
                'yes',
              ],
              [
                <C key="t">secp256k1</C>,
                <span key="p">
                  64 bytes <C>x ‖ y</C>: the uncompressed SEC1 point without its <C>0x04</C> prefix, as
                  NEAR&apos;s <C>secp256k1:</C> public keys carry it. The EVM address is the last 20 bytes of
                  keccak256 of these 64 bytes
                </span>,
                <span key="i">
                  exactly a 32-byte prehash, signed as it is — no further hashing; any other length is an{' '}
                  <C>err</C>
                </span>,
                <span key="o">
                  65 bytes <C>r ‖ s ‖ v</C>: ECDSA with an RFC 6979 nonce (one key and one prehash, one
                  signature), <C>r</C> and <C>s</C> big-endian, <C>s</C> low (in the lower half of the group
                  order), <C>v</C> the recovery id 0 or 1 — NEAR&apos;s secp256k1 signature and the input{' '}
                  <C>ecrecover</C> takes. EVM wants <C>v + 27</C>
                </span>,
                <span key="n"><C>err</C></span>,
              ],
            ]}
          />
          <p className="text-foreground">
            The keystore hands the worker 32 bytes for either type: an RFC 8032 seed, or the secp256k1
            secret scalar (big-endian). A scalar that is zero or not below the group order — probability
            about 2<sup>-128</sup> — is not a key, and the run is refused rather than use it.
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
                  <C>ok</C>: the public key — 32 bytes (ed25519) or 64 bytes <C>x ‖ y</C> (secp256k1);{' '}
                  <C>err</C>: the reason
                </span>,
              ],
              [
                <C key="f">sign(path, vault, message)</C>,
                <span key="a">
                  <C>ok</C>: ed25519 — 64 bytes over the raw message, at most 65536 bytes; secp256k1 — 65
                  bytes <C>r ‖ s ‖ v</C> over exactly a 32-byte prehash. <C>err</C>: the reason. See{' '}
                  <a href="#key-types" className="text-accent-text underline">Key types</a>
                </span>,
              ],
              [
                <C key="f">sign-nep413(path, vault, message, recipient, nonce, callback-url)</C>,
                <span key="a">
                  <C>ok</C>: <C>nep413-signature {'{'}account-id, public-key, signature{'}'}</C> from an
                  ed25519 key; <C>err</C>: the reason. See{' '}
                  <a href="#nep413" className="text-accent-text underline">NEP-413</a>
                </span>,
              ],
            ]}
          />
          <p className="text-foreground">
            <C>vault</C> names the key&apos;s declared vault exactly: <C>none</C> for a key declared without
            one, <C>some(&quot;&lt;vault&gt;&quot;)</C> for a key declared with that vault. Any other
            combination, an undeclared <C>path</C>, a key of a type the call does not serve, and a message
            the key&apos;s type does not take are an <C>err</C> carrying the reason, never a trap. A module
            that imports the interface and declares no key gets an <C>err</C> for every path.
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
            <C>sign-nep413(path, vault, message, recipient, nonce, callback-url)</C> signs a NEP-413 message
            with the declared <strong>ed25519</strong> key at <C>path</C>. The host builds the signed bytes
            itself: <C>sha256(borsh(2^31 + 413) ‖ borsh(payload))</C>, the payload{' '}
            <C>{'{'}message: string, nonce: [u8; 32], recipient: string, callback_url: option&lt;string&gt;{'}'}</C>{' '}
            in that order, and signs the 32-byte hash with ed25519. Anything that verifies a wallet&apos;s
            NEP-413 signature verifies this one.
          </p>
          <Table
            head={['nep413-signature', 'Value']}
            rows={[
              [
                <C key="f">account-id</C>,
                "the lowercase hex of the 32-byte public key (64 characters): the key's NEAR implicit account",
              ],
              [<C key="f">public-key</C>, <span key="v"><C>ed25519:</C> + base58 of the 32-byte public key</span>],
              [<C key="f">signature</C>, 'the 64-byte ed25519 signature, standard base64 with padding'],
            ]}
          />
          <p className="text-foreground">
            That is the shape a NEAR wallet&apos;s <C>signMessage</C> answers (<C>accountId</C>,{' '}
            <C>publicKey</C>, <C>signature</C>). An <C>err</C>: a key that is not ed25519, a <C>nonce</C>{' '}
            that is not exactly 32 bytes, a <C>message</C> over 65536 bytes, a <C>recipient</C> or{' '}
            <C>callback-url</C> over 2048 bytes. The <C>nonce</C> is the verifier&apos;s: it chooses it, and
            refuses one it has seen before.
          </p>
          <p className="text-foreground mt-3">
            <strong>The implicit account needs no registration.</strong> A NEP-413 signature verifies against
            the account <C>hex(public key)</C>. A verifier that also looks the key up among the
            account&apos;s access keys over RPC finds it only once the implicit account has been funded;
            checking <C>account-id == hex(public key)</C> holds regardless.
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">A module that proves its key</h3>
          <p className="text-foreground">
            The module fixes <C>message</C> and <C>recipient</C>; the verifier chooses only the nonce. Same{' '}
            <C>Cargo.toml</C> as the minimal module.
          </p>
          <CodeBlock code={PROOF_MANIFEST_JSON} language="json" filename="manifest.json" className="mt-3" />
          <CodeBlock code={PROOF_RS} language="rust" filename="src/main.rs" className="mt-3" />
          <p className="text-foreground mt-3">Verify the answer anywhere:</p>
          <CodeBlock code={PROOF_VERIFY_PY} language="python" className="mt-3" />
          <p className="text-foreground mt-3">
            The same signature built in the guest from <C>sign</C> — for when the payload must be seen — and a
            Python verifier are <C>sign_nep413</C> in the probe&apos;s <Ext href={PROBE_MAIN}>src/main.rs</Ext>{' '}
            and its <Ext href={PROBE_README}>README</Ext>.
          </p>
        </section>

        <section id="evm">
          <AnchorHeading id="evm">EVM (secp256k1)</AnchorHeading>
          <p className="text-foreground">
            A <C>secp256k1</C> key&apos;s EVM address is <C>0x</C> and the last 20 bytes of keccak256 of its
            64-byte public key. <C>sign</C> takes the 32-byte prehash the module computed and answers{' '}
            <C>r ‖ s ‖ v</C> with <C>v</C> 0 or 1; add 27 for EVM. Below, an EIP-191{' '}
            <C>personal_sign</C> over a message the module composed itself:
          </p>
          <CodeBlock code={EVM_MANIFEST_JSON} language="json" filename="manifest.json" className="mt-3" />
          <CodeBlock code={EVM_RS} language="rust" className="mt-3" />
          <p className="text-foreground mt-3">
            Recover the signer anywhere (<C>message</C>, <C>signature</C> and <C>address</C> from the
            module&apos;s output):
          </p>
          <CodeBlock code={EVM_VERIFY_PY} language="python" className="mt-3" />
          <p className="text-foreground mt-3">
            The module hashes what it signs. Never hand <C>sign</C> a digest from the input — see{' '}
            <a href="#security" className="text-accent-text underline">Security rules</a>.
          </p>
        </section>

        <section id="security">
          <AnchorHeading id="security">Security rules</AnchorHeading>
          <div className="bg-destructive/10 border-l-4 border-red-500 p-4 my-4">
            <ul className="list-disc list-inside space-y-3 text-sm text-foreground">
              <li>
                <strong>Never sign caller-supplied bytes or digests verbatim.</strong> An ed25519 key&apos;s
                public key is a real NEAR implicit account (and a Solana address); a secp256k1 key&apos;s is an
                EVM address. A signature over bytes the caller chose is a signature over whatever those bytes
                are — a transaction that empties the account, an authorization, a message the account never
                meant. Sign only messages the module composes itself, from fields it has parsed and checked,
                under a fixed prefix or structure of its own, and compute the digest in the module from those
                bytes; refuse an input that asks for a signature over raw bytes or a digest.
              </li>
              <li>
                <strong>Never sign a caller-supplied digest with a secp256k1 key.</strong> It signs 32 bytes as
                they are, so a caller-chosen digest is the hash of any EVM transaction, EIP-712 permit or{' '}
                <C>personal_sign</C> message the caller likes.
              </li>
              <li>
                <strong>A caller-chosen NEP-413 <C>message</C> and <C>recipient</C> is a login.</strong> The
                NEP-413 tag keeps the bytes from being a transaction, but a signature over a message and
                recipient the caller picked logs in, as the key&apos;s account, to whatever site the caller
                names. Fix them in the module.
              </li>
              <li>
                <strong>Do not hold funds on a signing key.</strong> An ed25519 key can sign NEAR transactions
                for its implicit account and Solana ones for the same public key; a secp256k1 key signs EVM
                transactions for its address. Funds sent there are controlled only by the code, outside every
                wallet policy. Money goes through the{' '}
                <Link href="/docs/agent-custody" className="text-accent-text underline">
                  custody wallet
                </Link>
                .
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

        <section id="prove-key">
          <AnchorHeading id="prove-key">Prove a key is the project&apos;s</AnchorHeading>
          <p className="text-foreground">
            A public key alone does not say who holds its secret. The run&apos;s attestation does: every
            OutLayer run carries an Intel TDX quote whose report data commits to the run&apos;s input, output,
            build (<C>wasm_hash</C>), caller and project — the{' '}
            <Link href="/docs/tee-attestation#task-hash" className="text-accent-text underline">
              task hash
            </Link>
            . A module that puts its public key in its output gets that key attested with it.
          </p>
          <ol className="list-decimal list-inside space-y-2 text-foreground mt-3">
            <li>
              <strong>The module returns its key.</strong> It puts <C>public-key</C> in its output — or, for
              freshness, a signature over a nonce the verifier chose, as the{' '}
              <a href="#nep413" className="text-accent-text underline">key-proof module</a> does with{' '}
              <C>sign-nep413</C> and a <C>message</C> and <C>recipient</C> it fixes itself.
            </li>
            <li>
              <strong>Get the run&apos;s attestation.</strong> An HTTPS <C>/call</C> response carries{' '}
              <C>attestation_url</C>: <C>/attestations/by-call/{'{call_id}'}</C>, relative to the API base (
              <C>https://api.outlayer.ai</C>). It answers once the worker has uploaded the quote. For an
              on-chain run: <C>/attestations/by-tx/{'{tx_hash}'}</C>. The same by-call path on{' '}
              <C>app.outlayer.ai</C> opens the report with its Verify button.
            </li>
            <li>
              <strong>Verify it.</strong> The quote is Intel-signed, its measurements are an approved worker
              build, and its task hash commits to this input and this output. Keep the request and response of
              an HTTPS call: only their hashes are stored.
              <CodeBlock code={VERIFY_CALL} language="bash" className="mt-3" />
              See{' '}
              <Link href="/docs/trust-verification#outlayer-verify" className="text-accent-text underline">
                OutLayer Verify
              </Link>
              .
            </li>
            <li>
              <strong>Read the attested fields.</strong> <C>project_id</C> is the project; the caller —{' '}
              <C>payment_key_owner</C> over HTTPS, <C>caller_account_id</C> on chain — is the account the key
              belongs to; <C>wasm_hash</C> is the build that ran. Audit that build: the attestation proves what
              ran, not that it returned the host&apos;s <C>public-key</C> unaltered.
            </li>
            <li>
              <strong>From then on, a signature by that key is the project&apos;s</strong> for that caller —
              checked against the public key alone, with no attestation per signature.
            </li>
          </ol>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              The attestation names the project by its <C>owner/name</C> id; the key belongs to its on-chain
              uuid. A project deleted and created again under the same name has other keys, so the proof holds
              for the project that ran under that name in that run.
            </li>
            <li>
              A <C>caller: &quot;predecessor&quot;</C> key belongs to the account that called the contract;
              read it from the requesting transaction. Over HTTPS it is the payment key&apos;s owner.
            </li>
            <li>
              A <C>bind: &quot;wasm&quot;</C> key belongs to the build and the caller: the proof is for that{' '}
              <C>wasm_hash</C>, with no project.
            </li>
            <li>
              For an ed25519 key, <C>account-id == hex(public key)</C> ties the NEP-413 answer to the implicit
              account whether or not that account has been funded.
            </li>
          </ul>
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
                  more than 3 keys, a bad <C>path</C> or one declared twice (under any type), an unknown
                  field, a <C>type</C>, <C>bind</C> or <C>caller</C> outside its list
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
              [
                <span key="c">
                  a <C>secp256k1</C> key whose derived scalar is zero or not below the group order
                  (probability about 2<sup>-128</sup>)
                </span>,
                <span key="f">declare the key under another <C>path</C></span>,
              ],
              ['a worker or keystore without signing-key support', 'none from your side'],
            ]}
          />
          <p className="text-foreground">Inside a run, a call answers <C>err</C> for:</p>
          <ul className="list-disc list-inside space-y-1 text-foreground mt-2">
            <li>
              an undeclared <C>path</C>, or a <C>vault</C> argument that is not the key&apos;s declared vault;
            </li>
            <li>
              <C>sign</C> with an ed25519 key: a message over 65536 bytes; with a secp256k1 key: a message
              that is not exactly 32 bytes;
            </li>
            <li>
              <C>sign-nep413</C>: a key that is not ed25519, a <C>nonce</C> that is not exactly 32 bytes, a{' '}
              <C>message</C> over 65536 bytes, a <C>recipient</C> or <C>callback-url</C> over 2048 bytes.
            </li>
          </ul>
          <p className="text-foreground mt-3">
            A GitHub-sourced module whose manifest does not reach the worker runs, and every call answers{' '}
            <C>err</C>.
          </p>
        </section>

        <section id="example">
          <AnchorHeading id="example">Example: signing-key-probe</AnchorHeading>
          <p className="text-foreground">
            <Ext href={PROBE_TREE}>wasi-examples/signing-key-probe</Ext> exercises every host function,
            binding and refusal, with one build per manifest (<C>bind: &quot;project&quot;</C>,{' '}
            <C>bind: &quot;wasm&quot;</C>, a vault key, and secp256k1 keys in{' '}
            <Ext href={PROBE_SECP_MANIFEST}>project-secp</Ext> and <C>wasm-secp</C>). Its <C>sign</C>{' '}
            operation signs whatever bytes — for a secp256k1 key, whatever 32-byte digest — it is handed: that
            is what a probe is for, and exactly what a production module must not do.
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              <Ext href={PROBE_MAIN}>src/main.rs</Ext> — the bindings, <C>sign_nep413</C> (guest-built),{' '}
              <C>host_nep413</C> (<C>sign-nep413</C>) and <C>evm_address</C>
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
