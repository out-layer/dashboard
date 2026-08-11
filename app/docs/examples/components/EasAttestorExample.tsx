import Link from 'next/link';
import { ExampleCard, UseCasesSection, KeyFeaturesSection, TechnicalDetailsSection, HowItWorksSection, LearnMoreSection, SecurityNotesSection } from './';

// Real mainnet runs. The input/output travel base64url-encoded in the URL, so the
// attestation page re-hashes them in the reader's browser and compares against the
// enclave-sealed values on arrival — the links ARE the verification.
const DRY_RUN_URL = 'https://app.outlayer.ai/attestation/293467?network=mainnet&input=eyJtb2RlIjoiZHJ5X3J1biIsImNoYWluIjp7Im5ldHdvcmsiOiJiYXNlIn0sInNjaGVtYSI6eyJkZWZpbml0aW9uIjoidWludDI1NiB0b3RhbFN1cHBseSx1aW50NjQgYmxvY2tOdW1iZXIsc3RyaW5nIHRlZUF0dGVzdGF0aW9uIiwicmV2b2NhYmxlIjp0cnVlLCJ1aWQiOiIweDBlNGRjNzU1M2YwNjM4ZjUyZDcyZmM1ZjkyY2RmMDY0YmQxNGZkZGMyMjE2YTM0MjQxN2E2MmM3YzIyNGVjNTYifSwia2V5X2VudiI6IlBST1RFQ1RFRF9FQVNfS0VZIiwiY29sbGVjdCI6W3sidHlwZSI6ImVyYzIwX3RvdGFsX3N1cHBseSIsInRva2VuIjoiMHg4MzM1ODlmQ0Q2ZURiNkUwOGY0YzdDMzJENGY3MWI1NGJkQTAyOTEzIn0seyJ0eXBlIjoiYmxvY2tfbnVtYmVyIn0seyJ0eXBlIjoidGVlX2F0dGVzdGF0aW9uIiwicmV0dXJucyI6InVybCIsImFwaV9iYXNlIjoiaHR0cHM6Ly9hcHAub3V0bGF5ZXIuYWkifV0sIm1pbl9hZ3JlZSI6MiwiYmxvY2tzX2JlaGluZCI6NH0&output=eyJhdHRlc3RhdGlvbl9kYXRhIjoiMHgwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBlZTA1MmZhMmQxYmUzMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMmY4NTNhMjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDUxNjg3NDc0NzA3MzNhMmYyZjYxNzA3MDJlNmY3NTc0NmM2MTc5NjU3MjJlNjE2OTJmNjE3NDc0NjU3Mzc0NjE3NDY5NmY2ZTczMmY2Mjc5MmQ2MzYxNmM2YzJmNjI2MTM4MzYzMjY2NjMzMzJkMzEzNTM5MzAyZDM0NjU2MTM0MmQ2MTM0MzAzODJkNjY2MTM2MzA2MTMzNjI2NTYxMzEzMzM1MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwiYXR0ZXN0ZXIiOiIweDU2YjViZWQ2YThkZjRmYzE5NDE5MTYwMTMxODY3NDgzNmJkN2M2ZGQiLCJibG9ja19udW1iZXIiOjQ5ODI4NzcwLCJjYWxsZGF0YSI6IjB4ZjE3MzI1ZTcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDIwMGU0ZGM3NTUzZjA2MzhmNTJkNzJmYzVmOTJjZGYwNjRiZDE0ZmRkYzIyMTZhMzQyNDE3YTYyYzdjMjI0ZWM1NjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMGUwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwZWUwNTJmYTJkMWJlMzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDJmODUzYTIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDYwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA1MTY4NzQ3NDcwNzMzYTJmMmY2MTcwNzAyZTZmNzU3NDZjNjE3OTY1NzIyZTYxNjkyZjYxNzQ3NDY1NzM3NDYxNzQ2OTZmNmU3MzJmNjI3OTJkNjM2MTZjNmMyZjYyNjEzODM2MzI2NjYzMzMyZDMxMzUzOTMwMmQzNDY1NjEzNDJkNjEzNDMwMzgyZDY2NjEzNjMwNjEzMzYyNjU2MTMxMzMzNTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImNvbGxlY3RlZCI6W3siYWdyZWVkX2J5IjpbImh0dHBzOi8vbWFpbm5ldC5iYXNlLm9yZyIsImh0dHBzOi8vYmFzZS5kcnBjLm9yZyJdLCJibG9jayI6NDk4Mjg3NzAsImZpZWxkIjoidG90YWxTdXBwbHkiLCJzb3VyY2UiOiJlcmMyMF90b3RhbF9zdXBwbHkiLCJ0b2tlbiI6IjB4ODMzNTg5ZmNkNmVkYjZlMDhmNGM3YzMyZDRmNzFiNTRiZGEwMjkxMyIsInR5cGUiOiJ1aW50MjU2IiwidmFsdWVfaGV4IjoiMHgwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBlZTA1MmZhMmQxYmUzIn0seyJibG9jayI6NDk4Mjg3NzAsImZpZWxkIjoiYmxvY2tOdW1iZXIiLCJzb3VyY2UiOiJibG9ja19udW1iZXIiLCJ0eXBlIjoidWludDY0IiwidmFsdWUiOjQ5ODI4NzcwfSx7ImF0dGVzdGF0aW9uX3VybCI6Imh0dHBzOi8vYXBwLm91dGxheWVyLmFpL2F0dGVzdGF0aW9ucy9ieS1jYWxsL2JhODYyZmMzLTE1OTAtNGVhNC1hNDA4LWZhNjBhM2JlYTEzNSIsImJsb2NrIjo0OTgyODc3MCwiZXhlY3V0aW9uX2lkIjoiYmE4NjJmYzMtMTU5MC00ZWE0LWE0MDgtZmE2MGEzYmVhMTM1IiwiZmllbGQiOiJ0ZWVBdHRlc3RhdGlvbiIsInNvdXJjZSI6InRlZV9hdHRlc3RhdGlvbiIsInR5cGUiOiJzdHJpbmcifV0sImVhcyI6IjB4NDIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMSIsIm1vZGUiOiJkcnlfcnVuIiwic2NoZW1hX3VpZCI6IjB4MGU0ZGM3NTUzZjA2MzhmNTJkNzJmYzVmOTJjZGYwNjRiZDE0ZmRkYzIyMTZhMzQyNDE3YTYyYzdjMjI0ZWM1NiIsInN1Y2Nlc3MiOnRydWV9';

const REGISTER_URL = 'https://app.outlayer.ai/attestation/293469?network=mainnet&input=eyJtb2RlIjoicmVnaXN0ZXJfc2NoZW1hIiwiY2hhaW4iOnsibmV0d29yayI6ImJhc2UifSwic2NoZW1hIjp7ImRlZmluaXRpb24iOiJ1aW50MjU2IHRvdGFsU3VwcGx5LHVpbnQ2NCBibG9ja051bWJlcixzdHJpbmcgdGVlQXR0ZXN0YXRpb24iLCJyZXZvY2FibGUiOnRydWUsInJlc29sdmVyIjoiMHgwIn0sImtleV9lbnYiOiJQUk9URUNURURfRUFTX0tFWSJ9&output=eyJkZWZpbml0aW9uIjoidWludDI1NiB0b3RhbFN1cHBseSx1aW50NjQgYmxvY2tOdW1iZXIsc3RyaW5nIHRlZUF0dGVzdGF0aW9uIiwibW9kZSI6InJlZ2lzdGVyX3NjaGVtYSIsIm5vbmNlIjoyLCJwcmVkaWN0ZWRfc2NoZW1hX3VpZCI6IjB4NTIwNGZmZTdlNzk0ZThhZTc2M2ZlYjFkNDRmNGIwZmIyZWFiMzQ0NDEwMTNhYTQ1MTQ4MzBjYTUyY2YzYTM0NCIsInJlZ2lzdHJhbnQiOiIweDU2YjViZWQ2YThkZjRmYzE5NDE5MTYwMTMxODY3NDgzNmJkN2M2ZGQiLCJzdWNjZXNzIjp0cnVlLCJ0eF9oYXNoIjoiMHg0YzM0N2U1ZWQ2YzEyZmJhN2ZmMDBhMjAzNjY0NmE0NDUwMmMzODMwN2YzM2YwZTMyMmFjY2U2YTlkNTc5MzgxIn0';

const ATTEST_URL = 'https://app.outlayer.ai/attestation/293472?network=mainnet&input=eyJtb2RlIjoiYXR0ZXN0IiwiY2hhaW4iOnsibmV0d29yayI6ImJhc2UifSwic2NoZW1hIjp7ImRlZmluaXRpb24iOiJ1aW50MjU2IHRvdGFsU3VwcGx5LHVpbnQ2NCBibG9ja051bWJlcixzdHJpbmcgdGVlQXR0ZXN0YXRpb24iLCJyZXZvY2FibGUiOnRydWUsInVpZCI6IjB4NTIwNGZmZTdlNzk0ZThhZTc2M2ZlYjFkNDRmNGIwZmIyZWFiMzQ0NDEwMTNhYTQ1MTQ4MzBjYTUyY2YzYTM0NCJ9LCJrZXlfZW52IjoiUFJPVEVDVEVEX0VBU19LRVkiLCJjb2xsZWN0IjpbeyJ0eXBlIjoiZXJjMjBfdG90YWxfc3VwcGx5IiwidG9rZW4iOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMifSx7InR5cGUiOiJibG9ja19udW1iZXIifSx7InR5cGUiOiJ0ZWVfYXR0ZXN0YXRpb24iLCJyZXR1cm5zIjoidXJsIiwiYXBpX2Jhc2UiOiJodHRwczovL2FwcC5vdXRsYXllci5haSJ9XSwibWluX2FncmVlIjoyLCJibG9ja3NfYmVoaW5kIjo0fQ&output=eyJhdHRlc3RhdGlvbl9kYXRhIjoiMHgwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBlZTA1MWVjNjA2ODc2MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMmY4NTNiNzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDUxNjg3NDc0NzA3MzNhMmYyZjYxNzA3MDJlNmY3NTc0NmM2MTc5NjU3MjJlNjE2OTJmNjE3NDc0NjU3Mzc0NjE3NDY5NmY2ZTczMmY2Mjc5MmQ2MzYxNmM2YzJmNjEzMjYyMzU2NDM1MzQzODJkNjU2NjM4NjEyZDM0NjEzMzMzMmQzOTM5NjE2MjJkNjE2MjYxMzE2MjYxNjQ2NDMyNjY2MjYxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwiYXR0ZXN0ZXIiOiIweDU2YjViZWQ2YThkZjRmYzE5NDE5MTYwMTMxODY3NDgzNmJkN2M2ZGQiLCJhdHRlc3Rlcl91cmwiOiJodHRwczovL2Jhc2UuZWFzc2Nhbi5vcmcvYWRkcmVzcy8weDU2YjViZWQ2YThkZjRmYzE5NDE5MTYwMTMxODY3NDgzNmJkN2M2ZGQiLCJibG9ja19udW1iZXIiOjQ5ODI4NzkxLCJjYWxsZGF0YSI6IjB4ZjE3MzI1ZTcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDIwNTIwNGZmZTdlNzk0ZThhZTc2M2ZlYjFkNDRmNGIwZmIyZWFiMzQ0NDEwMTNhYTQ1MTQ4MzBjYTUyY2YzYTM0NDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMGUwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwZWUwNTFlYzYwNjg3NjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDJmODUzYjcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDYwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA1MTY4NzQ3NDcwNzMzYTJmMmY2MTcwNzAyZTZmNzU3NDZjNjE3OTY1NzIyZTYxNjkyZjYxNzQ3NDY1NzM3NDYxNzQ2OTZmNmU3MzJmNjI3OTJkNjM2MTZjNmMyZjYxMzI2MjM1NjQzNTM0MzgyZDY1NjYzODYxMmQzNDYxMzMzMzJkMzkzOTYxNjIyZDYxNjI2MTMxNjI2MTY0NjQzMjY2NjI2MTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImNvbGxlY3RlZCI6W3siYWdyZWVkX2J5IjpbImh0dHBzOi8vbWFpbm5ldC5iYXNlLm9yZyIsImh0dHBzOi8vYmFzZS5kcnBjLm9yZyJdLCJibG9jayI6NDk4Mjg3OTEsImZpZWxkIjoidG90YWxTdXBwbHkiLCJzb3VyY2UiOiJlcmMyMF90b3RhbF9zdXBwbHkiLCJ0b2tlbiI6IjB4ODMzNTg5ZmNkNmVkYjZlMDhmNGM3YzMyZDRmNzFiNTRiZGEwMjkxMyIsInR5cGUiOiJ1aW50MjU2IiwidmFsdWVfaGV4IjoiMHgwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBlZTA1MWVjNjA2ODc2In0seyJibG9jayI6NDk4Mjg3OTEsImZpZWxkIjoiYmxvY2tOdW1iZXIiLCJzb3VyY2UiOiJibG9ja19udW1iZXIiLCJ0eXBlIjoidWludDY0IiwidmFsdWUiOjQ5ODI4NzkxfSx7ImF0dGVzdGF0aW9uX3VybCI6Imh0dHBzOi8vYXBwLm91dGxheWVyLmFpL2F0dGVzdGF0aW9ucy9ieS1jYWxsL2EyYjVkNTQ4LWVmOGEtNGEzMy05OWFiLWFiYTFiYWRkMmZiYSIsImJsb2NrIjo0OTgyODc5MSwiZXhlY3V0aW9uX2lkIjoiYTJiNWQ1NDgtZWY4YS00YTMzLTk5YWItYWJhMWJhZGQyZmJhIiwiZmllbGQiOiJ0ZWVBdHRlc3RhdGlvbiIsInNvdXJjZSI6InRlZV9hdHRlc3RhdGlvbiIsInR5cGUiOiJzdHJpbmcifV0sIm1vZGUiOiJhdHRlc3QiLCJub25jZSI6Mywic2NoZW1hX3VpZCI6IjB4NTIwNGZmZTdlNzk0ZThhZTc2M2ZlYjFkNDRmNGIwZmIyZWFiMzQ0NDEwMTNhYTQ1MTQ4MzBjYTUyY2YzYTM0NCIsInN1Y2Nlc3MiOnRydWUsInR4X2hhc2giOiIweGI5MzgyMTg3ZjczZTBmMTcwZjAyNTljODk5YWRmNTBlZDA2M2Y0ZjVlNjgxYjA1YWQyMjQ3NjhkMDJlZGFkNzcifQ';

const EASSCAN_RESULT = 'https://base.easscan.org/attestation/view/0x2ed9b2c7172a412149e2eeed45dc5a7942b0c36c91b66138650196cf2dec495b';

export function EasAttestorExample() {
  const badges = (
    <>
      <span className="ml-3 text-sm bg-card-muted text-foreground px-3 py-1 rounded">WASI P2</span>
      <span className="ml-2 text-sm bg-destructive/10 text-destructive-text px-3 py-1 rounded">Production</span>
      <span className="ml-2 text-sm bg-card-muted text-foreground px-3 py-1 rounded">Base + EVM</span>
    </>
  );

  return (
    <ExampleCard
      id="eas-attestor"
      title="eas-attestor"
      badges={badges}
      githubUrl="https://github.com/out-layer/eas-attestor"
    >
      <p className="text-foreground mb-4">
        One-click TEE attestations for the <a href="https://attest.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-accent-text">Ethereum Attestation Service</a>.
        A generic engine that reads on-chain data through an RPC quorum, signs an EAS attestation
        inside an Intel TDX enclave, and publishes it on Base (or any supported EVM chain) &mdash;
        with a link to its own hardware proof embedded in the attestation itself.
      </p>

      <div className="bg-card-muted border-l-4 border-border p-4 mb-6">
        <p className="text-sm text-foreground">
          <strong>Live at:</strong> <a href="https://eas.outlayer.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-accent-text">
            eas.outlayer.ai
          </a>
          {' '}&mdash; pick a preset, get a key generated inside the enclave, send its address a
          dollar of gas, attest. No servers, no key management, no infrastructure.
        </p>
      </div>

      <div className="mb-6">
        <h4 className="font-semibold text-foreground mb-3">Why this matters</h4>
        <p className="text-foreground text-sm mb-2">
          An attestation is only as trustworthy as its attester. Normally the attester is a plain
          EOA &mdash; readers trust whoever operates the server that holds the key. This attester is
          different in three ways:
        </p>
        <ul className="text-sm text-foreground space-y-1 list-disc list-inside">
          <li>The signing key was <strong>generated inside the enclave</strong> and has never existed anywhere else &mdash; no human has ever seen it</li>
          <li>The only code that can use it is <strong>pinned by hash</strong> to a public GitHub repo, approved on-chain</li>
          <li>Every attestation <strong>links to the Intel-signed quote</strong> of the exact run that produced it &mdash; the evidence travels with the claim</li>
        </ul>
      </div>

      <HowItWorksSection items={[
        'The web form composes a job: an EAS schema plus data collectors (ERC-20 supply, balance, contract bytecode, block number, a link to the run\'s own TEE quote)',
        'OutLayer compiles the pinned GitHub repo to WASI and executes it inside Intel TDX',
        'The enclave decrypts the attester key — a generated secret that only attested code can access',
        'The guest reads every value from multiple RPC endpoints and requires min_agree of them to match',
        'It ABI-encodes the attestation data, signs the EAS attest() transaction in-guest (k256), and broadcasts it',
        'The platform seals sha256(input), sha256(output) and the WASM hash into an Intel-signed TDX quote',
        'The attestation\'s teeAttestation field links back to that quote — anyone on EAS can follow it'
      ]} />

      <div className="mb-6">
        <h4 className="font-semibold text-foreground mb-3">Key custody &mdash; the design decision</h4>
        <p className="text-foreground text-sm mb-2">
          The attester key is a <Link href="/docs/secrets" className="underline hover:text-accent-text">generated secret</Link>{' '}
          (<code>PROTECTED_EAS_KEY</code>): the enclave keystore creates it, so the browser, the
          operator and OutLayer itself never see the private half. A dry run reveals only the
          derived address &mdash; you fund that address with gas, and the key can attest. The
          private key has never existed outside TEE memory, which is a stronger statement than any
          key-management policy.
        </p>
        <p className="text-foreground text-sm">
          The project (<code>zavodil.near/eas-attestor</code>) is shared: anyone binds <em>their
          own</em> key to it and gets their own attester identity on the same audited code. The
          platform decrypts a key only for the exact WASM whose hash is approved on-chain &mdash;
          the same pattern <Link href="/docs/examples#near-email" className="underline hover:text-accent-text">NEAR Email</Link> uses
          for user mailbox keys.
        </p>
      </div>

      <div className="mb-6">
        <h4 className="font-semibold text-foreground mb-3">A real mainnet run &mdash; verify it yourself</h4>
        <p className="text-foreground text-sm mb-2">
          The full lifecycle on Base mainnet, as one-click verification links. Each link carries the
          run&apos;s input and output in the URL; the attestation page re-hashes them in your
          browser and compares against the enclave-sealed values &mdash; nothing is taken on trust:
        </p>
        <ul className="text-sm text-foreground space-y-1">
          <li>
            1. <a href={DRY_RUN_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--primary-orange)] hover:underline">Dry run</a> &mdash; collects the data and encodes the attestation without broadcasting
          </li>
          <li>
            2. <a href={REGISTER_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--primary-orange)] hover:underline">Schema registration</a> &mdash; registers the EAS schema, signed inside the enclave
          </li>
          <li>
            3. <a href={ATTEST_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--primary-orange)] hover:underline">Attestation</a> &mdash; USDC total supply on Base, published on-chain
          </li>
          <li>
            4. <a href={EASSCAN_RESULT} target="_blank" rel="noopener noreferrer" className="text-[var(--primary-orange)] hover:underline">The result on EAS</a> &mdash; note the <code>teeAttestation</code> field pointing back at its own proof
          </li>
        </ul>
      </div>

      <KeyFeaturesSection items={[
        'Attester key born inside the TEE — generated secret, never seen by anyone',
        'Every read requires an N-of-M RPC quorum (min_agree) — no single RPC provider is trusted',
        'Self-referencing: each attestation embeds the URL of its own Intel-signed quote',
        'Schema-driven: any field layout, registered and predicted (UID) by the engine',
        'Cross-chain reads: attest on Base about state on Ethereum (proof-of-reserves pattern)',
        'One-click verification links — input and output travel in the URL, checks run in the reader\'s browser',
        'Zero infrastructure: pay per call with a payment key, or copy the job JSON and run it from a terminal'
      ]} />

      <SecurityNotesSection items={[
        'Key exfiltration: impossible by construction — the key is decrypted only for on-chain-approved code inside the enclave',
        'RPC manipulation: a wrong value requires min_agree independent endpoints to collude',
        'Operator (us): cannot alter results — the WASM hash and input/output hashes are sealed in the Intel-signed quote; verify with outlayer-verify, no trust in our pages required',
        'Code swap: each execution records the exact repo and commit it ran'
      ]} />

      <UseCasesSection items={[
        'Proof-of-reserves: locked collateral on Ethereum vs minted supply on Base, in one attestation',
        'Token supply and balance snapshots as attested public records',
        'Contract bytecode attestations — is the deployed code the audited code?',
        'Any oracle-style claim where readers should not have to trust the operator',
        'Template for TEE-signed EVM transactions of any kind — the quorum-read + in-guest signing core is reusable'
      ]} />

      <TechnicalDetailsSection items={[
        <><strong>WASI Version:</strong> Preview 2 (<code>wasm32-wasip2</code>)</>,
        <><strong>Language:</strong> Rust, minimal dependencies (hand-rolled ABI encoding and keccak, k256 for signing)</>,
        <><strong>Transactions:</strong> EIP-1559, signed entirely in-guest</>,
        <><strong>Chains:</strong> Base, Base Sepolia, Optimism, Arbitrum, Ethereum, Sepolia</>,
        <><strong>Key:</strong> <code>PROTECTED_EAS_KEY</code> — enclave-generated secret, bound to the shared project</>,
        <><strong>Collectors:</strong> erc20_total_supply, erc20_balance, eth_code, block_number, tee_attestation</>,
        <><strong>Modes:</strong> dry_run / register_schema / attest over the HTTPS API</>
      ]} />

      <LearnMoreSection>
        <ul className="text-sm text-foreground space-y-1">
          <li>
            <a href="https://eas.outlayer.ai" target="_blank" rel="noopener noreferrer" className="text-[var(--primary-orange)] hover:underline">
              Try eas.outlayer.ai (live)
            </a>
          </li>
          <li>
            <a href="https://github.com/out-layer/eas-attestor" target="_blank" rel="noopener noreferrer" className="text-[var(--primary-orange)] hover:underline">
              View Source Code
            </a>
          </li>
          <li>
            <Link href="/docs/secrets" className="text-[var(--primary-orange)] hover:underline">
              Secrets & Generated Keys Docs
            </Link>
          </li>
          <li>
            <Link href="/docs/trust-verification" className="text-[var(--primary-orange)] hover:underline">
              Trust & Verification (outlayer-verify)
            </Link>
          </li>
        </ul>
      </LearnMoreSection>
    </ExampleCard>
  );
}
