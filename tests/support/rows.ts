/**
 * Row fixtures shared by the parity suites.
 *
 * `tests/uniqueness-parity.test.ts` probes every uniqueness rule and
 * `tests/check-parity.test.ts` probes every `CHECK`; both need the same valid
 * rows, and a valid row is exactly the thing that must not be written twice.
 * Two copies would drift, and a drifted fixture in a parity suite reports
 * parity that was never measured, so the factories live here once.
 *
 * Every factory returns a row the live schema accepts as-is. A check case takes
 * one and breaks one field, so anything that has to be true for the row to be
 * stored at all belongs here rather than in a case.
 */
import { randomUUID } from "node:crypto";
import { makeEvent } from "../../src/platform/eventing/envelope.js";
import type { Persistence } from "../../src/platform/persistence/backends.js";
import { NO_SCOPE } from "../../src/platform/persistence/transaction.js";

/** What a probed write did. `accepted` is always a parity failure. */
export type Verdict =
  | { readonly refused: false }
  | { readonly refused: true; readonly kind: "error"; readonly detail: string }
  | { readonly refused: true; readonly kind: "outcome"; readonly detail: string };

export async function refuse(write: () => Promise<unknown>): Promise<Verdict> {
  try {
    await write();
    return { refused: false };
  } catch (error) {
    return {
      refused: true,
      kind: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export const NOW = "2026-01-01T00:00:00.000Z";
export const LATER = "2026-02-01T00:00:00.000Z";

export function identity(id: string, legacy: string | null = null) {
  return {
    identity_id: id,
    status: "active" as const,
    canonical_identity_id: null,
    display_name: "Parity",
    created_at: NOW,
    updated_at: NOW,
    source_system: "parity",
    legacy_id: legacy,
  };
}

export function organization(id: string, legacy: string | null = null) {
  return {
    organization_id: id,
    name: `Parity ${id.slice(0, 8)}`,
    status: "active" as const,
    country_code: "SA",
    created_at: NOW,
    updated_at: NOW,
    source_system: "parity",
    legacy_id: legacy,
  };
}

/**
 * The tenant a child row names.
 *
 * Five tables reference `organization`, and until the foreign-key parity cycle
 * the reference backend accepted all five with no tenant row present — so the
 * fixtures that used a fixed tenant id never created one. Postgres refused
 * every one of those writes, which is why this helper exists rather than the
 * rule being relaxed.
 */
export async function seedTenant(store: Persistence, organizationId: string): Promise<void> {
  await store.organization.insert(organization(organizationId), NO_SCOPE);
}

export async function seedCountry(store: Persistence): Promise<void> {
  await store.geography.upsertCountry(
    { country_code: "SA", name: "Saudi Arabia", default_currency: "SAR", status: "active" },
    NO_SCOPE,
  );
}

/** An identity with a principal on it, which most identity-side rules need. */
export async function seedPrincipal(
  store: Persistence,
): Promise<{ identityId: string; principalId: string }> {
  const identityId = randomUUID();
  const principalId = randomUUID();
  await store.identity.insertIdentity(identity(identityId), NO_SCOPE);
  await store.identity.insertPrincipal(
    { principal_id: principalId, identity_id: identityId, created_at: NOW, service_name: null, issues_for_channels: [] },
    NO_SCOPE,
  );
  return { identityId, principalId };
}

export async function seedWallet(store: Persistence): Promise<string> {
  const walletId = randomUUID();
  await store.money.insertWallet(
    {
      wallet_id: walletId,
      owner_type: "organization",
      owner_id: randomUUID(),
      currency: "SAR",
      status: "active",
      created_at: NOW,
    },
    NO_SCOPE,
  );
  return walletId;
}

export async function seedAuthorization(
  store: Persistence,
  walletId: string,
  reference: string,
  amount = 1_000,
): Promise<string> {
  const authorizationId = randomUUID();
  await store.money.insertAuthorization(
    {
      authorization_id: authorizationId,
      wallet_id: walletId,
      amount_minor: amount,
      captured_minor: 0,
      refunded_minor: 0,
      currency: "SAR",
      status: "authorized",
      business_reference: reference,
      created_at: NOW,
      expires_at: LATER,
      captured_at: null,
      voided_at: null,
      void_reason: null,
    },
    NO_SCOPE,
  );
  return authorizationId;
}

/**
 * An event row in the outbox.
 *
 * Both queue tables carry a foreign key to `outbox(event_id)`, which is the
 * schema saying a delivery cannot exist for an event CORE never published. The
 * memory store does not enforce it, so a fixture inventing an event id passes
 * there and fails on Postgres — a difference this file exists to notice rather
 * than work around.
 */
export async function seedEvent(store: Persistence): Promise<string> {
  const event = makeEvent({
    event_type: "core.fulfillment.completed",
    version: 1,
    producer: "core",
    occurred_at: new Date(NOW),
    correlation_id: "corr-parity",
    entity_type: "fulfillment",
    entity_id: randomUUID(),
    payload: {},
  });
  await store.outbox.append(event, NO_SCOPE);
  return event.event_id;
}

/**
 * A hold whose captured amount the ledger actually accounts for.
 *
 * Written in three steps because `payment_authorization_ledger_agrees` refuses
 * an authorization claiming a capture the ledger cannot show: insert the hold
 * empty, record the movement, then raise the aggregate. Doing it in one insert
 * is what the trigger is there to stop.
 */
export async function seedCapturedAuthorization(
  store: Persistence,
  walletId: string,
  amount = 1_000,
): Promise<string> {
  const reference = `hold:${randomUUID()}`;
  const authorizationId = await seedAuthorization(store, walletId, reference, amount);
  const transactionId = randomUUID();
  // One transaction, because the ledger balance rule is checked at COMMIT and
  // the header, its entries and the raised aggregate have to reach it together.
  await store.boundary.run(async (scope) => {
    await store.money.insertTransaction(
      {
        transaction_id: transactionId,
        kind: "capture",
        business_reference: `capture:${authorizationId}`,
        authorization_id: authorizationId,
        occurred_at: NOW,
        entries: [
          {
            entry_id: randomUUID(),
            transaction_id: transactionId,
            account_reference: `wallet:${walletId}`,
            amount_minor: -amount,
            currency: "SAR",
          },
          {
            entry_id: randomUUID(),
            transaction_id: transactionId,
            account_reference: "clearing:captured",
            amount_minor: amount,
            currency: "SAR",
          },
        ],
      },
      scope,
    );
    const held = await store.money.getAuthorization(authorizationId);
    if (!held) throw new Error("seed failed: authorization vanished");
    await store.money.updateAuthorization(
      { ...held, captured_minor: amount, status: "captured", captured_at: NOW },
      scope,
    );
  });
  return authorizationId;
}

export async function seedPlan(store: Persistence, code: string): Promise<string> {
  const planId = randomUUID();
  await store.subscription.insertPlan(
    {
      plan_id: planId,
      code,
      name: "Parity plan",
      currency: "SAR",
      amount_minor: 1_000,
      billing_interval: "month",
      interval_count: 1,
      status: "active",
      created_at: NOW,
      activated_at: NOW,
      retired_at: null,
    },
    NO_SCOPE,
  );
  return planId;
}

export async function seedSubscription(store: Persistence): Promise<string> {
  const walletId = await seedWallet(store);
  const planId = await seedPlan(store, `parity-${randomUUID().slice(0, 8)}`);
  const subscriptionId = randomUUID();
  await store.subscription.insertSubscription(
    {
      subscription_id: subscriptionId,
      owner_type: "organization",
      owner_id: randomUUID(),
      plan_id: planId,
      wallet_id: walletId,
      status: "active",
      created_at: NOW,
      cancelled_at: null,
      cancel_reason: null,
      ended_at: null,
    },
    NO_SCOPE,
  );
  return subscriptionId;
}

export function period(
  subscriptionId: string,
  overrides: Partial<{
    period_id: string;
    sequence: number;
    starts_at: string;
    ends_at: string;
    status: "pending" | "settled" | "uncollectible" | "voided";
    authorization_id: string | null;
    settled_at: string | null;
    amount_minor: number;
  }> = {},
) {
  return {
    period_id: overrides.period_id ?? randomUUID(),
    subscription_id: subscriptionId,
    sequence: overrides.sequence ?? 1,
    starts_at: overrides.starts_at ?? NOW,
    ends_at: overrides.ends_at ?? LATER,
    currency: "SAR",
    amount_minor: overrides.amount_minor ?? 1_000,
    status: overrides.status ?? "pending",
    authorization_id: overrides.authorization_id ?? null,
    created_at: NOW,
    settled_at: overrides.settled_at ?? null,
    uncollectible_reason: null,
  };
}

export async function seedRecipient(store: Persistence, organizationId: string, identityId: string) {
  const recipientId = randomUUID();
  await store.notification.insertRecipient(
    {
      recipient_id: recipientId,
      organization_id: organizationId,
      event_type: "core.fulfillment.completed",
      identity_id: identityId,
      channel: "telegram",
      active: true,
      created_at: NOW,
    },
    NO_SCOPE,
  );
  return recipientId;
}

export function notification(
  recipientId: string,
  organizationId: string,
  overrides: Partial<{ event_id: string; idempotency_key: string }> = {},
) {
  return {
    notification_id: randomUUID(),
    event_id: overrides.event_id ?? randomUUID(),
    recipient_id: recipientId,
    organization_id: organizationId,
    channel: "telegram" as const,
    address: "12345",
    template: "fulfillment_completed" as const,
    subject: null,
    body: "parity",
    data: {},
    idempotency_key: overrides.idempotency_key ?? `parity-${randomUUID()}`,
    status: "pending" as const,
    attempts: 0,
    last_error: null,
    provider_message_id: null,
    claim_token: null,
    claimed_at: null,
    next_attempt_at: NOW,
    created_at: NOW,
    accepted_at: null,
    delivered_at: null,
    failed_at: null,
  };
}

export function fulfillment(
  organizationId: string,
  orderReference: string,
  jobReference: string | null,
) {
  return {
    fulfillment_id: randomUUID(),
    organization_id: organizationId,
    market_order_reference: orderReference,
    move_job_reference: jobReference,
    payment_authorization_id: null,
    status: "coordinating" as const,
    settlement_state: "none" as const,
    created_at: NOW,
    completed_at: null,
    closure_reason: null,
    executed_after_cancellation_at: null,
    executed_after_cancellation_job_reference: null,
  };
}

export function eventSubscription(subscriber: string, eventType: string) {
  return {
    subscription_id: randomUUID(),
    subscriber,
    event_type: eventType,
    endpoint_url: "https://example.invalid/hook",
    signing_secret: "parity-secret-parity-secret",
    active: true,
    created_at: NOW,
  };
}

export function delivery(eventId: string, subscriptionId: string) {
  return {
    delivery_id: randomUUID(),
    event_id: eventId,
    subscription_id: subscriptionId,
    status: "pending" as const,
    attempts: 0,
    last_error: null,
    last_status: null,
    next_attempt_at: NOW,
    created_at: NOW,
    delivered_at: null,
    claimed_at: null,
    reclaims: 0,
    claim_token: null,
  };
}

export function signal(organizationId: string, sourceReference: string) {
  return {
    reputation_signal_id: randomUUID(),
    organization_id: organizationId,
    subject_type: "identity" as const,
    subject_id: randomUUID(),
    signal_kind: "service_rating" as const,
    rating_value: 5,
    source_system: "market",
    source_reference: sourceReference,
    occurred_at: NOW,
    recorded_at: NOW,
    correlation_id: "corr-parity",
    retracted_at: null,
    retraction_reason: null,
  };
}


export function wallet(id: string = randomUUID()) {
  return {
    wallet_id: id,
    owner_type: "organization" as const,
    owner_id: randomUUID(),
    currency: "SAR",
    status: "active" as const,
    created_at: NOW,
  };
}

export function authorization(walletId: string, id: string = randomUUID()) {
  return {
    authorization_id: id,
    wallet_id: walletId,
    amount_minor: 1_000,
    captured_minor: 0,
    refunded_minor: 0,
    currency: "SAR",
    status: "authorized" as const,
    business_reference: `hold:${id}`,
    created_at: NOW,
    expires_at: LATER,
    captured_at: null,
    voided_at: null,
    void_reason: null,
  };
}

export function country(code = "SA") {
  return { country_code: code, name: "Saudi Arabia", default_currency: "SAR", status: "active" as const };
}

export function region(id: string = randomUUID()) {
  return {
    region_id: id,
    country_code: "SA",
    code: `R-${id.slice(0, 8)}`,
    name: "Makkah",
    status: "active" as const,
  };
}

export function city(regionId: string, id: string = randomUUID()) {
  return {
    city_id: id,
    region_id: regionId,
    country_code: "SA",
    name: "Jeddah",
    latitude: 21.4858,
    longitude: 39.1925,
    status: "active" as const,
  };
}

export function serviceArea(cityId: string, id: string = randomUUID()) {
  return {
    service_area_id: id,
    city_id: cityId,
    country_code: "SA",
    name: "North Jeddah",
    centre_latitude: 21.6,
    centre_longitude: 39.2,
    radius_metres: 15_000,
    status: "active" as const,
  };
}

export function plan(id: string = randomUUID()) {
  return {
    plan_id: id,
    code: `parity-${id.slice(0, 8)}`,
    name: "Parity plan",
    currency: "SAR",
    amount_minor: 1_000,
    billing_interval: "month" as const,
    interval_count: 1,
    status: "active" as const,
    created_at: NOW,
    activated_at: NOW,
    retired_at: null,
  };
}

export function subscription(planId: string, walletId: string, id: string = randomUUID()) {
  return {
    subscription_id: id,
    owner_type: "organization" as const,
    owner_id: randomUUID(),
    plan_id: planId,
    wallet_id: walletId,
    status: "active" as const,
    created_at: NOW,
    cancelled_at: null,
    cancel_reason: null,
    ended_at: null,
  };
}

export function transaction(walletId: string, id: string = randomUUID()) {
  return {
    transaction_id: id,
    kind: "credit" as const,
    business_reference: `credit:${id}`,
    authorization_id: null,
    occurred_at: NOW,
    entries: [
      {
        entry_id: randomUUID(),
        transaction_id: id,
        account_reference: `wallet:${walletId}`,
        amount_minor: 1_000,
        currency: "SAR",
      },
      {
        entry_id: randomUUID(),
        transaction_id: id,
        account_reference: "clearing:topup",
        amount_minor: -1_000,
        currency: "SAR",
      },
    ],
  };
}

export function auditEntry() {
  return {
    actor_type: "system" as const,
    actor_id: null,
    action: "parity.probe",
    entity_type: "fulfillment",
    entity_id: randomUUID(),
    correlation_id: "corr-parity",
    metadata: {},
  };
}

/** A country, a region under it and a city in that region — the geography chain. */
export async function seedGeography(
  store: Persistence,
): Promise<{ regionId: string; cityId: string }> {
  await seedCountry(store);
  const theRegion = region();
  await store.geography.insertRegion(theRegion, NO_SCOPE);
  const theCity = city(theRegion.region_id);
  await store.geography.insertCity(theCity, NO_SCOPE);
  return { regionId: theRegion.region_id, cityId: theCity.city_id };
}

/** An organization with a country behind it, which its foreign key requires. */
export async function seedOrganization(store: Persistence): Promise<string> {
  await seedCountry(store);
  const id = randomUUID();
  await store.organization.insert(organization(id), NO_SCOPE);
  return id;
}
