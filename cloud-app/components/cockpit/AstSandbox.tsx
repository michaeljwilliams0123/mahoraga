"use client";

type AstSandboxProps = {
  code: string;
  onChange: (value: string) => void;
};

export function AstSandbox({ code, onChange }: AstSandboxProps) {
  return (
    <div className="cockpit-sandbox">
      <div className="cockpit-sandbox-head">
        <span>AST_MUTATOR_RULE_SANDBOX.ts</span>
        <span className="cockpit-pill warn">MANUAL_OVERRIDE_LOCAL</span>
      </div>
      <textarea
        className="cockpit-sandbox-editor"
        value={code}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-label="AST rule sandbox"
      />
    </div>
  );
}
