import type { ReferenceKeys } from "../../platform/persistence/reference-keys.js";
import {
  journalMapWrite,
  type TransactionBoundary,
  type TransactionScope,
} from "../../platform/persistence/transaction.js";
import { type UnitOfWork, withTransaction } from "../../platform/eventing/unit-of-work.js";
import type { Clock } from "../../platform/clock.js";
import type { AuditLog } from "../../platform/audit/audit.js";
import { invalid, notFound } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import type { Organization } from "./domain.js";
import { putRow } from "../../platform/persistence/row-rules.js";
import { orderedBy } from "../../platform/persistence/list-order.js";

export interface OrganizationRepository {
  insert(organization: Organization, scope: TransactionScope): Promise<void>;
  get(organizationId: string): Promise<Organization | undefined>;
  list(): Promise<Organization[]>;
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private rows = new Map<string, Organization>();

  /**
   * `organization` is referenced by five tables — memberships, fulfillments,
   * notifications, notification recipients and reputation signals — so this
   * registration is what lets any of them be checked in memory.
   */
  constructor(keys?: ReferenceKeys) {
    keys?.attach("organization", this.rows);
  }
  /**
   * `organization_legacy_idx`: one row per (source_system, legacy_id) where a
   * legacy id exists. Two rows for one imported organization would split its
   * memberships and money across two ids that the source system considers one.
   */
  async insert(organization: Organization, scope?: TransactionScope): Promise<void> {
    if (organization.legacy_id !== null) {
      for (const existing of this.rows.values()) {
        if (existing.organization_id === organization.organization_id) continue;
        if (
          existing.legacy_id === organization.legacy_id &&
          existing.source_system === organization.source_system
        ) {
          throw new Error(
            'duplicate key value violates unique constraint "organization_legacy_idx"',
          );
        }
      }
    }
    journalMapWrite(scope, this.rows, organization.organization_id);
    putRow("organization", this.rows, organization.organization_id, organization);
  }
  async get(organizationId: string): Promise<Organization | undefined> {
    return this.rows.get(organizationId);
  }
  async list(): Promise<Organization[]> {
    return orderedBy(this.rows.values(), (row) => row.created_at, (row) => row.organization_id);
  }
}

export class OrganizationService {
  constructor(
    private readonly repo: OrganizationRepository,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
    private readonly boundary: TransactionBoundary,
  ) {}

  async create(input: {
    name: string;
    country_code: string;
    correlation_id: string;
    source_system?: string;
    legacy_id?: string | null;
  }): Promise<Organization> {
    const organization = this.build(input);
    // No event: tenancy is read through the API, not published (ADR 0009).
    // The transaction exists for the audit entry — a tenant that exists with
    // no record of being created is the gap B-9 was about.
    await withTransaction({ boundary: this.boundary, audit: this.audit }, (uow) => {
      this.stageCreate(uow, organization, input.correlation_id, null);
    });
    return organization;
  }

  /**
   * XR-8.9: a person opens an organization of their own — a store, in MARKET's
   * words (D-XR-10). The organization and whatever `within` stages (the
   * owner's `org_admin` membership) commit together or not at all, and the
   * audit row names the person who asked rather than `system`.
   */
  async openOwn(
    input: { name: string; country_code: string; correlation_id: string; owner_principal_id: string },
    within: (uow: UnitOfWork, organization: Organization) => Promise<unknown>,
  ): Promise<Organization> {
    const organization = this.build(input);
    await withTransaction({ boundary: this.boundary, audit: this.audit }, async (uow) => {
      this.stageCreate(uow, organization, input.correlation_id, input.owner_principal_id);
      await within(uow, organization);
    });
    return organization;
  }

  private stageCreate(
    uow: UnitOfWork,
    organization: Organization,
    correlationId: string,
    actorPrincipalId: string | null,
  ): void {
    uow.stage((scope) => this.repo.insert(organization, scope));
    uow.audit({
      actor_type: actorPrincipalId === null ? "system" : "principal",
      actor_id: actorPrincipalId,
      action: "organization.created",
      entity_type: "organization",
      entity_id: organization.organization_id,
      correlation_id: correlationId,
      metadata: { country_code: organization.country_code },
    });
  }

  private build(input: {
    name: string;
    country_code: string;
    source_system?: string;
    legacy_id?: string | null;
  }): Organization {
    if (!input.name.trim()) throw invalid("name is required");
    if (!/^[A-Z]{2}$/.test(input.country_code)) throw invalid("country_code must be ISO 3166-1 alpha-2");
    const now = this.clock.now().toISOString();
    return {
      organization_id: newId(),
      name: input.name.trim(),
      status: "active",
      country_code: input.country_code,
      created_at: now,
      updated_at: now,
      source_system: input.source_system ?? "wasla-core",
      legacy_id: input.legacy_id ?? null,
    };
  }

  async require(organizationId: string): Promise<Organization> {
    const organization = await this.repo.get(organizationId);
    if (!organization) throw notFound("organization not found");
    return organization;
  }
}
