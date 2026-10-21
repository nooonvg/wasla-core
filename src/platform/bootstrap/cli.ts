/**
 * Operator surface for provisioning a credential.
 *
 * A CLI for the same reason replay is one, and for a stronger one: this is the
 * path that exists *because* `POST /v1/sessions` now refuses a caller holding
 * nothing. An HTTP route that provisions the first credential would be the hole
 * milestone 31 closed, wearing a different name. What this command needs is
 * database access, which is strictly more than the ability to send a request,
 * and which anybody who could run it already has.
 *
 * Usage:
 *
 *   DATABASE_URL=… npm run bootstrap:credential -- \
 *     --service-name market --organization <organization_id> [--roles service] \
 *     [--issue-for telegram,web]
 *
 * `--roles` defaults to `service`, which is what a channel adapter needs:
 * `session.issue` to obtain sessions for the people it authenticated on its own
 * channel, plus `events.submit`, `fulfillment.request`, `fulfillment.read` and
 * `identity.read`. `platform_admin` has to be asked for explicitly, because the
 * default of a provisioning command must be the weaker credential.
 *
 * `--issue-for` names the person-facing channels the service authenticates
 * people on (B-42). Without it the credential holds `session.issue` and may
 * issue on no channel at all — the same "weaker by default" rule.
 *
 * The token is written to stdout once, inside the JSON report, and cannot be
 * recovered afterwards: only its hash is stored. Re-running the command mints a
 * new session rather than reprinting the old one.
 */
import { Pool } from "pg";
import { createCoreApp } from "../../app.js";
import { systemClock } from "../clock.js";
import { postgresPersistence } from "../persistence/backends.js";
import {
  ISSUABLE_CHANNEL_TYPES,
  ROLE_PERMISSIONS,
  type IssuableChannelType,
  type Role,
} from "../../modules/identity-access/domain.js";
import { provisionServiceCredential } from "./credential.js";

export const USAGE = `Usage:
  DATABASE_URL=... npm run bootstrap:credential -- --service-name <name> --organization <id> [--roles service] [--issue-for telegram,web]

  --service-name  the named system the credential belongs to (required)
  --organization  an organization that already exists (required)
  --roles         comma separated, default "service"
  --issue-for     comma separated channels the service may issue sessions on
                  (${ISSUABLE_CHANNEL_TYPES.join(", ")}), default none

The access token is printed once and cannot be recovered afterwards.`;

export interface ParsedArgs {
  serviceName: string;
  organizationId: string;
  roles: readonly Role[];
  issuesFor: readonly IssuableChannelType[];
}

/** A usage error, thrown rather than exited on — see `replay/cli.ts` for why. */
export class CliUsageError extends Error {
  readonly exitCode = 2;
}

function fail(message: string): never {
  throw new CliUsageError(message);
}

const KNOWN_ROLES = Object.keys(ROLE_PERMISSIONS) as readonly Role[];

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (!arg.startsWith("--")) fail(`unexpected argument: ${arg}`);
    const name = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) fail(`--${name} needs a value`);
    values.set(name, next);
    index += 1;
  }

  const serviceName = values.get("service-name");
  if (serviceName === undefined || serviceName.trim() === "") {
    fail("--service-name is required: the credential is provisioned for a named system");
  }
  const organizationId = values.get("organization");
  if (organizationId === undefined) {
    // No default, and no invented tenant: the roles a credential holds mean
    // nothing except relative to an organization that already exists.
    fail("--organization is required: the credential is a membership of an existing organization");
  }

  const roles = (values.get("roles") ?? "service")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean) as Role[];
  if (roles.length === 0) fail("--roles must name at least one role");
  for (const role of roles) {
    if (!KNOWN_ROLES.includes(role)) {
      fail(`--roles contains an unknown role: ${role} (known: ${KNOWN_ROLES.join(", ")})`);
    }
  }

  const issueFor = values.get("issue-for");
  const issuesFor = (issueFor ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean) as IssuableChannelType[];
  if (issueFor !== undefined && issuesFor.length === 0) {
    fail("--issue-for must name at least one channel when given");
  }
  for (const channel of issuesFor) {
    if (!(ISSUABLE_CHANNEL_TYPES as readonly string[]).includes(channel)) {
      fail(
        `--issue-for contains a channel a service may not issue on: ${channel} (allowed: ${ISSUABLE_CHANNEL_TYPES.join(", ")})`,
      );
    }
  }

  return { serviceName: serviceName.trim(), organizationId, roles, issuesFor: [...new Set(issuesFor)] };
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  // Before `parseArgs`, which would otherwise reject `--help` as a flag missing
  // a value: asking a provisioning command what it does must not be an error.
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const parsed = parseArgs(argv);
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    fail("DATABASE_URL is required: this command provisions a row, it does not call an API");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const app = createCoreApp({
      clock: systemClock,
      persistence: postgresPersistence(pool, systemClock),
    });
    const credential = await provisionServiceCredential(app, {
      service_name: parsed.serviceName,
      organization_id: parsed.organizationId,
      roles: parsed.roles,
      issues_for_channels: parsed.issuesFor,
      correlation_id: `bootstrap-${parsed.serviceName}-${systemClock.now().toISOString()}`,
    });
    process.stdout.write(`${JSON.stringify(credential, null, 2)}\n`);
    return 0;
  } finally {
    await pool.end();
  }
}
