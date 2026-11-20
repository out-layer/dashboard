interface PolicyJsonEditorProps {
  policyJsonText: string;
  onChangeText: (text: string) => void;
  jsonEdited: boolean;
  onReset: () => void;
}

export function PolicyJsonEditor({ policyJsonText, onChangeText, jsonEdited, onReset }: PolicyJsonEditorProps) {
  return (
 <div className="pt-4">
 <div className="flex items-center justify-between mb-2">
 <h3 className="text-xs font-medium text-muted-foreground">Exactly what is encrypted and stored</h3>
        {jsonEdited && (
 <button onClick={onReset} className="text-xs text-accent-text hover:underline">
            Reset from form
          </button>
        )}
      </div>
      <textarea
        value={policyJsonText}
        onChange={(e) => onChangeText(e.target.value)}
        rows={Math.min(20, Math.max(6, policyJsonText.split('\n').length + 1))}
 className="w-full border border-border-strong rounded px-3 py-2 text-xs font-mono bg-card-muted focus:bg-card"
        spellCheck={false}
      />
 <p className="text-xs text-faint-foreground mt-1">
        You can edit JSON directly &mdash; this is what will be submitted.
      </p>
    </div>
  );
}
