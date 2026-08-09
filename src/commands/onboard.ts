/**
 * DEPRECATED. `dial onboard` was replaced by `dial auth verify-otp`, and creating an
 * account now also requires verifying a phone number.
 *
 * The command stays registered rather than being deleted so a stale skill or cached
 * doc gets an instruction it can act on, instead of commander's bare "unknown
 * command". Exits non-zero: nothing was done.
 */

export type OnboardOptions = {
  verificationId?: string;
  code?: string;
  inboundInstruction?: string;
  agents?: string[];
  json?: boolean;
};

const REPLACEMENT = "dial auth verify-otp --code <code>";
const PHONE_NOTE =
  "Creating an account now also requires a verified phone number: after the email code, run `dial auth register-number <phone>`, then `dial auth verify-otp --number --code <code>`.";
const INSTRUCTION_NOTE =
  "`--inbound-instruction` no longer exists — a new number starts with the default prompt; change it with `dial number set`.";

export async function runOnboard(opts: OnboardOptions): Promise<number> {
  const message = `\`dial onboard\` has been replaced by \`${REPLACEMENT}\`. Nothing was done.`;
  const instructionNote = opts.inboundInstruction ? INSTRUCTION_NOTE : undefined;

  if (opts.json) {
    console.log(
      JSON.stringify({
        ok: false,
        code: "deprecated_command",
        error: message,
        replacement: REPLACEMENT,
        note: PHONE_NOTE,
        ...(instructionNote ? { instructionNote } : {}),
      }),
    );
  } else {
    console.error(message);
    console.error(``);
    console.error(`Run instead:`);
    console.error(`    dial auth verify-otp${opts.code ? ` --code ${opts.code}` : ""}`);
    console.error(``);
    console.error(PHONE_NOTE);
    if (instructionNote) {
      console.error(``);
      console.error(instructionNote);
    }
  }
  return 2;
}
