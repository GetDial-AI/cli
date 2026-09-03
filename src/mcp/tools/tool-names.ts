/**
 * The tool names this server is expected to expose, split into the half it shares with
 * the hosted server and the half only a local install can offer.
 *
 * There are THREE copies of the MCP tool surface, and nothing but a check keeps them in
 * step:
 *
 *   1. the hosted Remote server (`frontend/src/lib/mcp/tools/tool-names.ts` — the twin
 *      of this file, whose contents must equal OPERATIONAL_TOOL_NAMES exactly, in the
 *      same order),
 *   2. this registry,
 *   3. the published Remote/Local matrix in `dial-docs`
 *      (`fern/docs/pages/integrations/tools/mcp.mdx`).
 *
 * A tool added to one and forgotten in another is the drift AGENTS.md forbids, and it is
 * invisible in review because each file reads correctly on its own. Asserting the
 * registry against these lists turns that into a failing build instead.
 *
 * If the two files ever disagree, the fix is the SERVER that is missing a tool — never
 * an edited list.
 */
export const OPERATIONAL_TOOL_NAMES = [
  "get_account_status",
  "list_numbers",
  "purchase_number",
  "set_number_properties",
  "send_message",
  "reply_to_message",
  "start_typing",
  "stop_typing",
  "list_messages",
  "list_groups",
  "place_call",
  "list_calls",
  "get_call",
  "wait_for_event",
] as const;

/**
 * Verbs only the local server has: they touch this machine (onboarding, the listen
 * daemon, local event fan-out), which is why the Local server is a strict superset of
 * the Remote one rather than a different surface.
 */
export const LOCAL_ONLY_TOOL_NAMES = [
  "auth_login",
  "auth_verify_otp",
  "auth_register_number",
  "listen_install",
  "listen_uninstall",
  "listen_status",
  "add_url_target",
  "add_command_target",
  "remove_local_target",
  "list_local_targets",
] as const;
