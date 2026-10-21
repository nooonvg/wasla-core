import { AUTHENTICATED } from "../../platform/http/authentication.js";
import { objectBody } from "../../platform/http/body.js";
import { keyed } from "../../platform/http/retry.js";
import type { Router } from "../../platform/http/router.js";
import { requirePrincipal } from "../identity-access/http.js";
import type { AuthenticatedPrincipal, IdentityService } from "../identity-access/service.js";
import type { OrganizationService } from "./service.js";

export function registerOrganizationRoutes(
  router: Router<AuthenticatedPrincipal>,
  organizations: OrganizationService,
  identity: IdentityService,
): void {
  router.post(
    "/v1/organizations",
    objectBody(
      { name: "name", kind: "text", required: true },
      { name: "country_code", kind: "text", required: true },
    ),
    AUTHENTICATED,
    keyed(
      "an organization is identified by the id CORE mints and nothing else — two organizations may share a name and a country — so a repeat creates a second tenant that no later read can tell from the first",
    ),
    async (ctx) => {
    // Creating a tenant is the platform's act, not a tenant's (B-46): an
    // `org_admin` holds `organization.write` for *its own* organization, and an
    // organization that does not exist yet is nobody's.
    await requirePrincipal(ctx, identity, "platform.operate");
    // `await`: both of these are async, and a promise handed back as a body is
    // serialised as `{}` — the empty answer milestone 27 measured here.
    const organization = await organizations.create({
      name: ctx.input.requiredText("name"),
      country_code: ctx.input.requiredText("country_code"),
      correlation_id: ctx.correlation_id,
    });
    return { status: 201, body: organization };
  });

  router.get("/v1/organizations/:organization_id", [], AUTHENTICATED, async (ctx) => {
    const organizationId = ctx.params["organization_id"]!;
    await requirePrincipal(ctx, identity, "organization.read", organizationId);
    return { status: 200, body: await organizations.require(organizationId) };
  });
}
