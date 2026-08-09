/**
 * DEPRECATED. `dial signup` was replaced by `dial auth login`.
 *
 * The command stays registered rather than being deleted so that a stale skill or
 * cached doc gets an instruction it can act on, instead of commander's bare
 * "unknown command". Exits non-zero: nothing was done.
 */

export type SignupOptions = { force?: boolean; json?: boolean };

const REPLACEMENT = "dial auth login <email>";

export async function runSignup(email: string, opts: SignupOptions): Promise<number> {
  const message = `\`dial signup\` has been replaced by \`${REPLACEMENT}\`. Nothing was sent.`;
  if (opts.json) {
    console.log(
      JSON.stringify({
        ok: false,
        code: "deprecated_command",
        error: message,
        replacement: REPLACEMENT,
        email,
      }),
    );
  } else {
    console.error(message);
    console.error(``);
    console.error(`Run instead:`);
    console.error(`    dial auth login ${email}`);
  }
  return 2;
}
