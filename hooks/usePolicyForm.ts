import { useState, useMemo } from 'react';
import { PolicyForm, DEFAULT_POLICY, buildPolicyRules } from '@/lib/wallet-policy';

export interface UsePolicyFormOptions {
  apiKeyHash?: string;
  /** The policy the form was loaded from: what it holds beyond the form's fields is kept on save. */
  storedPolicy?: unknown;
  /** Callback to add approval (or other fields) to the built policy. */
  augmentPolicy?: (base: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * A policy as a form and as the JSON that will be stored. The JSON is the
 * form's own until it is edited by hand; from then on it is the hand's, until
 * it is reset.
 */
export function usePolicyForm(options: UsePolicyFormOptions = {}) {
  const { apiKeyHash, augmentPolicy, storedPolicy } = options;

  const [policyForm, setPolicyForm] = useState<PolicyForm>(DEFAULT_POLICY);
  const [editedJsonText, setEditedJsonText] = useState('');
  const [jsonEdited, setJsonEdited] = useState(false);

  const builtPolicyJson = useMemo(() => {
    let policy = buildPolicyRules(policyForm, apiKeyHash, storedPolicy);
    if (augmentPolicy) {
      policy = augmentPolicy(policy);
    }
    return policy;
  }, [policyForm, apiKeyHash, augmentPolicy, storedPolicy]);

  const builtJsonText = useMemo(() => JSON.stringify(builtPolicyJson, null, 2), [builtPolicyJson]);
  const policyJsonText = jsonEdited ? editedJsonText : builtJsonText;

  const resetJson = () => setJsonEdited(false);

  return {
    policyForm,
    setPolicyForm,
    builtPolicyJson,
    policyJsonText,
    setPolicyJsonText: setEditedJsonText,
    jsonEdited,
    setJsonEdited,
    resetJson,
  };
}
