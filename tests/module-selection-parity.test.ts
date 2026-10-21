/**
 * Selection parity for the module read paths — milestone 22.
 *
 * Milestone 21 asked one question of the three eventing queues: do the two
 * backends pick the same rows, in the same order, for the same call? It found
 * that the reference queues did not sort at all. This file asks the same
 * question of everything else that returns a list — notifications, money,
 * subscriptions, identities, memberships, organizations, fulfillments — and
 * the answer had the same shape: the Postgres repositories sort, the reference
 * repositories returned insertion order, and the two agreed only because the
 * fixtures happened to insert rows in the order the SQL would have sorted them
 * into.
 *
 * So the population here is built **deliberately out of order**: every batch is
 * inserted newest-first, or in reverse code order, and several rows share a
 * timestamp so the tiebreak is exercised too. A store that returns insertion
 * order now returns the reverse of the right answer, and a sort key that is not
 * total now has a tie to get wrong.
 *
 * Three properties, the same ones milestone 21 settled on:
 *
 *  1. Each case declares how many rows it expects, asserted against the
 *     reference backend **without a database**, so a case that silently
 *     selects nothing fails instead of passing vacuously.
 *  2. Representative cases also declare the order they must return, computed
 *     from the fixture definitions rather than read back out of a store, so
 *     "both backends agree" cannot mean "both are wrong in the same way".
 *  3. A premise test proves the two backends hold the same population before
 *     any selection runs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixedClock } from "../src/platform/clock.js";
import {
  memoryPersistence,
  postgresPersistence,
  type Persistence,
} from "../src/platform/persistence/backends.js";
import { NO_SCOPE } from "../src/platform/persistence/transaction.js";
import { makeEvent } from "../src/platform/eventing/envelope.js";
import { LATER, delivery, eventSubscription, seedCountry } from "./support/rows.js";

const url = process.env.DATABASE_URL;
const START = new Date("2026-05-01T00:00:00.000Z");
const MINUTE = 60_000;

/** Deterministic ids, so the two populations can be compared by id at all. */
const id = (n: number): string => `00000000-0000-4000-9000-${n.toString(16).padStart(12, "0")}`;
/**
 * An outbox row with a pinned id.
 *
 * `notification.event_id` carries a foreign key to `outbox(event_id)` — the
 * schema saying CORE cannot notify anyone about an event it never published —
 * and the reference backend now enforces it too, so the fixture has to publish
 * the event. The id is pinned rather than generated because the two populations
 * are compared by id.
 */
async function publish(store: Persistence, eventId: string): Promise<void> {
  await store.outbox.append(
    {
      ...makeEvent({
        event_type: "core.fulfillment.completed",
        version: 1,
        producer: "core",
        occurred_at: new Date(START),
        correlation_id: "corr-parity",
        entity_type: "fulfillment",
        entity_id: eventId,
        payload: {},
      }),
      event_id: eventId,
    },
    NO_SCOPE,
  );
}

const at = (minutes: number): string => new Date(START.getTime() + minutes * MINUTE).toISOString();

interface Population {
  readonly regions: readonly string[];
  readonly cities: readonly string[];
  readonly areas: readonly string[];
  readonly organizations: readonly string[];
  readonly identities: readonly string[];
  readonly links: readonly string[];
  readonly memberships: readonly string[];
  readonly principalId: string;
  readonly walletId: string;
  readonly authorizations: readonly string[];
  readonly transactions: readonly string[];
  readonly plans: readonly string[];
  readonly subscriptions: readonly string[];
  readonly subscriptionOwnerId: string;
  readonly periodId: string;
  readonly usage: readonly string[];
  readonly recipients: readonly string[];
  readonly notifications: readonly string[];
  readonly fulfillments: readonly string[];
}

/**
 * Builds the population through the repositories' own APIs.
 *
 * Every batch is inserted in the **opposite** order to the one its listing must
 * return. That is the whole point: a store that returns insertion order is
 * indistinguishable from a store that sorts, until the two orders differ.
 */
async function populate(store: Persistence): Promise<Population> {
  await seedCountry(store);

  // Geography, inserted in the reverse of every key the SQL sorts by: countries
  // by descending code, regions by descending code, cities and service areas by
  // descending name with a duplicate name so the id tiebreak is exercised.
  for (const code of ["QA", "KW", "BH"]) {
    await store.geography.upsertCountry(
      { country_code: code, name: `Country ${code}`, default_currency: "SAR", status: "active" },
      NO_SCOPE,
    );
  }
  const regions = [id(501), id(502), id(503)];
  const regionCodes = ["R-C", "R-B", "R-A"];
  for (let index = 0; index < regions.length; index += 1) {
    await store.geography.insertRegion(
      {
        region_id: regions[index] as string,
        country_code: "SA",
        code: regionCodes[index] as string,
        name: `Region ${index}`,
        status: "active",
      },
      NO_SCOPE,
    );
  }
  const cities = [id(511), id(512), id(513)];
  const cityNames = ["Taif", "Jeddah", "Jeddah"];
  for (let index = 0; index < cities.length; index += 1) {
    await store.geography.insertCity(
      {
        city_id: cities[index] as string,
        region_id: regions[0] as string,
        country_code: "SA",
        name: cityNames[index] as string,
        latitude: 21.4858,
        longitude: 39.1925,
        status: "active",
      },
      NO_SCOPE,
    );
  }
  const areas = [id(521), id(522), id(523)];
  const areaNames = ["West", "North", "North"];
  for (let index = 0; index < areas.length; index += 1) {
    await store.geography.insertServiceArea(
      {
        service_area_id: areas[index] as string,
        city_id: cities[0] as string,
        country_code: "SA",
        name: areaNames[index] as string,
        centre_latitude: 21.6,
        centre_longitude: 39.2,
        radius_metres: 15_000,
        status: "active",
      },
      NO_SCOPE,
    );
  }

  // Organizations: created newest-first, ids ascending.
  const organizations = [id(1), id(2), id(3)];
  const orgCreated = [at(30), at(20), at(20)]; // the last two tie on created_at
  for (let index = 0; index < organizations.length; index += 1) {
    await store.organization.insert(
      {
        organization_id: organizations[index] as string,
        name: `Parity ${index}`,
        status: "active",
        country_code: "SA",
        created_at: orgCreated[index] as string,
        updated_at: orgCreated[index] as string,
        source_system: "parity",
        legacy_id: null,
      },
      NO_SCOPE,
    );
  }

  // Identities, again newest-first with a tie at the end.
  const identities = [id(11), id(12), id(13)];
  const identityCreated = [at(30), at(20), at(20)];
  for (let index = 0; index < identities.length; index += 1) {
    await store.identity.insertIdentity(
      {
        identity_id: identities[index] as string,
        status: "active",
        canonical_identity_id: null,
        display_name: `Parity ${index}`,
        created_at: identityCreated[index] as string,
        updated_at: identityCreated[index] as string,
        source_system: "parity",
        legacy_id: null,
      },
      NO_SCOPE,
    );
  }

  // Links on the first identity, inserted newest-first.
  const links = [id(21), id(22), id(23)];
  const linkCreated = [at(30), at(20), at(10)];
  for (let index = 0; index < links.length; index += 1) {
    await store.identity.insertLink(
      {
        identity_link_id: links[index] as string,
        identity_id: identities[0] as string,
        channel_type: "telegram",
        external_id: `parity-${index}`,
        verified_at: null,
        created_at: linkCreated[index] as string,
      },
      NO_SCOPE,
    );
  }

  const principalId = id(31);
  await store.identity.insertPrincipal(
    {
      principal_id: principalId,
      identity_id: identities[0] as string,
      created_at: at(0),
      service_name: null, issues_for_channels: [],
    },
    NO_SCOPE,
  );

  // One membership per organization, inserted newest-first.
  const memberships = [id(41), id(42), id(43)];
  const membershipCreated = [at(30), at(20), at(10)];
  for (let index = 0; index < memberships.length; index += 1) {
    await store.identity.insertMembership(
      {
        membership_id: memberships[index] as string,
        principal_id: principalId,
        organization_id: organizations[index] as string,
        roles: ["org_member"],
        created_at: membershipCreated[index] as string,
      },
      NO_SCOPE,
    );
  }

  // Money: one wallet, four authorizations inserted newest-first with a tie.
  const walletId = id(51);
  await store.money.insertWallet(
    {
      wallet_id: walletId,
      owner_type: "organization",
      owner_id: organizations[0] as string,
      currency: "SAR",
      status: "active",
      created_at: at(0),
    },
    NO_SCOPE,
  );
  const authorizations = [id(61), id(62), id(63), id(64)];
  const authorizationCreated = [at(40), at(30), at(20), at(20)];
  for (let index = 0; index < authorizations.length; index += 1) {
    await store.money.insertAuthorization(
      {
        authorization_id: authorizations[index] as string,
        wallet_id: walletId,
        amount_minor: 1_000,
        captured_minor: 0,
        refunded_minor: 0,
        currency: "SAR",
        status: "authorized",
        business_reference: `hold:${index}`,
        created_at: authorizationCreated[index] as string,
        expires_at: LATER,
        captured_at: null,
        voided_at: null,
        void_reason: null,
      },
      NO_SCOPE,
    );
  }

  // Ledger: three balanced transactions, inserted newest-first. Each goes
  // through a boundary because `insertTransaction` refuses to run outside one:
  // the balance trigger is deferred to COMMIT, so a header and its entries have
  // to reach it together.
  const transactions = [id(71), id(72), id(73)];
  const occurred = [at(30), at(20), at(10)];
  for (let index = 0; index < transactions.length; index += 1) {
    const transactionId = transactions[index] as string;
    await store.boundary.run(async (scope) => {
      await store.money.insertTransaction(
        {
          transaction_id: transactionId,
          kind: "credit",
          business_reference: `credit:${index}`,
          authorization_id: null,
          occurred_at: occurred[index] as string,
          entries: [
            {
              entry_id: id(80 + index * 2),
              transaction_id: transactionId,
              account_reference: `wallet:${walletId}`,
              amount_minor: 1_000,
              currency: "SAR",
            },
            {
              entry_id: id(81 + index * 2),
              transaction_id: transactionId,
              account_reference: "clearing:topup",
              amount_minor: -1_000,
              currency: "SAR",
            },
          ],
        },
        scope,
      );
    });
  }

  // Plans, inserted in reverse code order. A plan is published as a draft and
  // activated afterwards because `plan_grant_immutable` freezes the grants of a
  // plan that has already been offered — the fixture has to obey the rule the
  // store enforces rather than work around it.
  const plans = [id(91), id(92), id(93)];
  const codes = ["parity-c", "parity-b", "parity-a"];
  const draft = (index: number) => ({
    plan_id: plans[index] as string,
    code: codes[index] as string,
    name: `Plan ${index}`,
    currency: "SAR",
    amount_minor: 1_000,
    billing_interval: "month" as const,
    interval_count: 1,
    created_at: at(0),
    retired_at: null,
  });
  for (let index = 0; index < plans.length; index += 1) {
    await store.subscription.insertPlan(
      { ...draft(index), status: "draft", activated_at: null },
      NO_SCOPE,
    );
  }
  // Grants on the first plan only, inserted in reverse feature-key order.
  for (const featureKey of ["seats", "reports", "api"]) {
    await store.subscription.insertGrant(
      { plan_id: plans[0] as string, feature_key: featureKey, limit_value: 10 },
      NO_SCOPE,
    );
  }
  for (let index = 0; index < plans.length; index += 1) {
    await store.subscription.updatePlan(
      { ...draft(index), status: "active", activated_at: at(0) },
      NO_SCOPE,
    );
  }

  // Subscriptions for one owner, inserted newest-first with a tie.
  const subscriptionOwnerId = organizations[0] as string;
  const subscriptions = [id(101), id(102), id(103)];
  const subscriptionCreated = [at(30), at(20), at(20)];
  for (let index = 0; index < subscriptions.length; index += 1) {
    await store.subscription.insertSubscription(
      {
        subscription_id: subscriptions[index] as string,
        owner_type: "organization",
        owner_id: subscriptionOwnerId,
        plan_id: plans[index] as string,
        wallet_id: walletId,
        status: "active",
        created_at: subscriptionCreated[index] as string,
        cancelled_at: null,
        cancel_reason: null,
        ended_at: null,
      },
      NO_SCOPE,
    );
  }

  // Periods on the first subscription, inserted highest-sequence-first.
  const periods = [id(111), id(112), id(113)];
  for (let index = 0; index < periods.length; index += 1) {
    const sequence = periods.length - index;
    await store.subscription.insertPeriod(
      {
        period_id: periods[index] as string,
        subscription_id: subscriptions[0] as string,
        sequence,
        starts_at: at(1000 * sequence),
        ends_at: at(1000 * sequence + 500),
        currency: "SAR",
        amount_minor: 1_000,
        status: "pending",
        authorization_id: null,
        created_at: at(0),
        settled_at: null,
        uncollectible_reason: null,
      },
      NO_SCOPE,
    );
  }
  const periodId = periods[periods.length - 1] as string;

  // Usage on the lowest-sequence period, inserted newest-first with a tie.
  const usage = [id(121), id(122), id(123)];
  // Inside the period's window, which `usage_within_period` enforces; still
  // newest-first, with a tie.
  const recorded = [at(1030), at(1020), at(1020)];
  for (let index = 0; index < usage.length; index += 1) {
    await store.subscription.insertUsage(
      {
        usage_id: usage[index] as string,
        period_id: periodId,
        feature_key: "seats",
        quantity: 1,
        usage_reference: `parity-${index}`,
        recorded_at: recorded[index] as string,
        correlation_id: null,
      },
      NO_SCOPE,
    );
  }

  // Notification recipients, inserted newest-first.
  const recipients = [id(131), id(132)];
  const recipientCreated = [at(30), at(20)];
  for (let index = 0; index < recipients.length; index += 1) {
    await store.notification.insertRecipient(
      {
        recipient_id: recipients[index] as string,
        organization_id: organizations[0] as string,
        event_type: "core.fulfillment.completed",
        // A different identity per recipient: the unique key is
        // (organization, event type, identity, channel), so two recipients for
        // one identity would collide rather than exercise the listing.
        identity_id: identities[index] as string,
        channel: "telegram",
        active: true,
        created_at: recipientCreated[index] as string,
      },
      NO_SCOPE,
    );
  }

  // Notifications, inserted newest-first with a tie in the middle.
  const notifications = [id(141), id(142), id(143), id(144)];
  const notificationCreated = [at(40), at(30), at(30), at(10)];
  const notificationDue = [at(40), at(5), at(30), at(10)];
  for (let index = 0; index < notifications.length; index += 1) {
    await publish(store, id(150 + index));
    await store.notification.queue(
      {
        notification_id: notifications[index] as string,
        event_id: id(150 + index),
        recipient_id: recipients[0] as string,
        organization_id: organizations[0] as string,
        channel: "telegram",
        address: "12345",
        template: "fulfillment_completed",
        subject: null,
        body: "parity",
        data: {},
        idempotency_key: `parity-${index}`,
        status: "pending",
        attempts: 0,
        last_error: null,
        provider_message_id: null,
        claim_token: null,
        claimed_at: null,
        next_attempt_at: notificationDue[index] as string,
        created_at: notificationCreated[index] as string,
        accepted_at: null,
        delivered_at: null,
        failed_at: null,
      },
      NO_SCOPE,
    );
  }

  // Fulfillments, inserted newest-first with a tie.
  const fulfillments = [id(161), id(162), id(163)];
  const fulfillmentCreated = [at(30), at(20), at(20)];
  for (let index = 0; index < fulfillments.length; index += 1) {
    await store.fulfillment.insert(
      {
        fulfillment_id: fulfillments[index] as string,
        organization_id: organizations[0] as string,
        market_order_reference: `order-${index}`,
        move_job_reference: null,
        payment_authorization_id: null,
        status: "coordinating",
        settlement_state: "none",
        created_at: fulfillmentCreated[index] as string,
        completed_at: null,
        closure_reason: null,
        executed_after_cancellation_at: null,
        executed_after_cancellation_job_reference: null,
      },
      NO_SCOPE,
    );
  }

  return {
    regions,
    cities,
    areas,
    organizations,
    identities,
    links,
    memberships,
    principalId,
    walletId,
    authorizations,
    transactions,
    plans,
    subscriptions,
    subscriptionOwnerId,
    periodId,
    usage,
    recipients,
    notifications,
    fulfillments,
  };
}

interface Case {
  /** What the case selects, used as the test name. */
  readonly what: string;
  /** How many rows it must return. A range where the exact count is not the point. */
  readonly expected: number | readonly [number, number];
  /**
   * The order the reference backend must return, when the case is one of the
   * listings whose order this cycle is about. Computed from the fixtures, not
   * read back out of a store.
   */
  readonly order?: (population: Population) => readonly string[];
  run(store: Persistence, population: Population): Promise<readonly string[]>;
}

const within = (count: number, expected: number | readonly [number, number]): boolean =>
  typeof expected === "number" ? count === expected : count >= expected[0] && count <= expected[1];

const CASES: readonly Case[] = [
  {
    what: "geography.listCountries()",
    expected: 4,
    async run(store) {
      return (await store.geography.listCountries()).map((row) => row.country_code);
    },
    order: () => ["BH", "KW", "QA", "SA"],
  },
  {
    what: "geography.listRegions()",
    expected: 3,
    order: (p) => [p.regions[2] as string, p.regions[1] as string, p.regions[0] as string],
    async run(store) {
      return (await store.geography.listRegions("SA")).map((row) => row.region_id);
    },
  },
  {
    what: "geography.listCities()",
    expected: 3,
    // Two cities share a name; the id decides which comes first.
    order: (p) => [p.cities[1] as string, p.cities[2] as string, p.cities[0] as string],
    async run(store, population) {
      return (await store.geography.listCities(population.regions[0] as string)).map(
        (row) => row.city_id,
      );
    },
  },
  {
    what: "geography.listServiceAreas()",
    expected: 3,
    order: (p) => [p.areas[1] as string, p.areas[2] as string, p.areas[0] as string],
    async run(store) {
      return (await store.geography.listServiceAreas()).map((row) => row.service_area_id);
    },
  },
  {
    what: "geography.listServiceAreas('SA')",
    expected: 3,
    async run(store) {
      return (await store.geography.listServiceAreas("SA")).map((row) => row.service_area_id);
    },
  },
  {
    what: "organization.list()",
    expected: 3,
    // created_at ascending, then id: inserted 30, 20, 20 — so the two that tie
    // come first in id order and the oldest-inserted row comes last.
    order: (p) => [p.organizations[1] as string, p.organizations[2] as string, p.organizations[0] as string],
    async run(store) {
      return (await store.organization.list()).map((row) => row.organization_id);
    },
  },
  {
    what: "identity.listIdentities()",
    expected: 3,
    order: (p) => [p.identities[1] as string, p.identities[2] as string, p.identities[0] as string],
    async run(store) {
      return (await store.identity.listIdentities()).map((row) => row.identity_id);
    },
  },
  {
    what: "identity.listLinksForIdentity()",
    expected: 3,
    order: (p) => [p.links[2] as string, p.links[1] as string, p.links[0] as string],
    async run(store, population) {
      return (await store.identity.listLinksForIdentity(population.identities[0] as string)).map(
        (row) => row.identity_link_id,
      );
    },
  },
  {
    what: "identity.listMemberships()",
    expected: 3,
    order: (p) => [p.memberships[2] as string, p.memberships[1] as string, p.memberships[0] as string],
    async run(store, population) {
      return (await store.identity.listMemberships(population.principalId)).map(
        (row) => row.membership_id,
      );
    },
  },
  {
    what: "money.listAuthorizations() for one wallet",
    expected: 4,
    order: (p) => [
      p.authorizations[2] as string,
      p.authorizations[3] as string,
      p.authorizations[1] as string,
      p.authorizations[0] as string,
    ],
    async run(store, population) {
      return (await store.money.listAuthorizations(population.walletId)).map(
        (row) => row.authorization_id,
      );
    },
  },
  {
    what: "money.allAuthorizations()",
    expected: 4,
    async run(store) {
      return (await store.money.allAuthorizations()).map((row) => row.authorization_id);
    },
  },
  {
    what: "money.transactions()",
    expected: 3,
    order: (p) => [p.transactions[2] as string, p.transactions[1] as string, p.transactions[0] as string],
    async run(store) {
      return (await store.money.transactions()).map((row) => row.transaction_id);
    },
  },
  {
    what: "money.transactions() — the entries inside the first transaction",
    expected: 2,
    async run(store) {
      const [first] = await store.money.transactions();
      return (first?.entries ?? []).map((entry) => entry.entry_id);
    },
  },
  {
    what: "subscription.listPlans()",
    expected: 3,
    // By code: the plans were inserted c, b, a.
    order: (p) => [p.plans[2] as string, p.plans[1] as string, p.plans[0] as string],
    async run(store) {
      return (await store.subscription.listPlans()).map((row) => row.plan_id);
    },
  },
  {
    what: "subscription.listPlans('active')",
    expected: 3,
    async run(store) {
      return (await store.subscription.listPlans("active")).map((row) => row.plan_id);
    },
  },
  {
    what: "subscription.listGrants()",
    expected: 3,
    async run(store, population) {
      return (await store.subscription.listGrants(population.plans[0] as string)).map(
        (row) => row.feature_key,
      );
    },
  },
  {
    what: "subscription.listSubscriptionsForOwner()",
    expected: 3,
    order: (p) => [
      p.subscriptions[1] as string,
      p.subscriptions[2] as string,
      p.subscriptions[0] as string,
    ],
    async run(store, population) {
      return (
        await store.subscription.listSubscriptionsForOwner("organization", population.subscriptionOwnerId)
      ).map((row) => row.subscription_id);
    },
  },
  {
    what: "subscription.listSubscriptionsByStatus(['active'])",
    expected: 3,
    async run(store) {
      return (await store.subscription.listSubscriptionsByStatus(["active"])).map(
        (row) => row.subscription_id,
      );
    },
  },
  {
    what: "subscription.listPeriods()",
    expected: 3,
    async run(store, population) {
      return (await store.subscription.listPeriods(population.subscriptions[0] as string)).map(
        (row) => String(row.sequence),
      );
    },
  },
  {
    what: "subscription.latestPeriod()",
    expected: 1,
    async run(store, population) {
      const latest = await store.subscription.latestPeriod(population.subscriptions[0] as string);
      return latest ? [String(latest.sequence)] : [];
    },
  },
  {
    what: "subscription.listUsage()",
    expected: 3,
    order: (p) => [p.usage[1] as string, p.usage[2] as string, p.usage[0] as string],
    async run(store, population) {
      return (await store.subscription.listUsage(population.periodId)).map((row) => row.usage_id);
    },
  },
  {
    what: "notification.listRecipients()",
    expected: 2,
    order: (p) => [p.recipients[1] as string, p.recipients[0] as string],
    async run(store) {
      return (await store.notification.listRecipients()).map((row) => row.recipient_id);
    },
  },
  {
    what: "notification.recipientsFor() an event type",
    expected: 2,
    async run(store, population) {
      return (
        await store.notification.recipientsFor(
          "core.fulfillment.completed",
          population.organizations[0] as string,
        )
      ).map((row) => row.recipient_id);
    },
  },
  {
    what: "notification.byStatus('pending')",
    expected: 4,
    // created_at ascending with an id tiebreak on the pair that shares 30.
    order: (p) => [
      p.notifications[3] as string,
      p.notifications[1] as string,
      p.notifications[2] as string,
      p.notifications[0] as string,
    ],
    async run(store) {
      return (await store.notification.byStatus("pending")).map((row) => row.notification_id);
    },
  },
  {
    what: "notification.forEvent()",
    expected: 1,
    async run(store) {
      return (await store.notification.forEvent(id(150))).map((row) => row.notification_id);
    },
  },
  {
    what: "notification.list() — newest first, which is the opposite order",
    expected: 4,
    order: (p) => [
      p.notifications[0] as string,
      p.notifications[2] as string,
      p.notifications[1] as string,
      p.notifications[3] as string,
    ],
    async run(store) {
      return (await store.notification.list({})).map((row) => row.notification_id);
    },
  },
  {
    what: "notification.list() under a limit of two",
    expected: 2,
    // The limit is the reason the order has to be total: these are the two rows
    // a caller sees at all.
    order: (p) => [p.notifications[0] as string, p.notifications[2] as string],
    async run(store) {
      return (await store.notification.list({ limit: 2 })).map((row) => row.notification_id);
    },
  },
  {
    what: "notification.claimDue() — oldest due first",
    expected: 3,
    async run(store) {
      return (await store.notification.claimDue(new Date(START.getTime() + 35 * MINUTE), 10, 30_000)).map(
        (row) => row.notification_id,
      );
    },
  },
  {
    what: "notification.claimDue() under a limit of one",
    expected: 1,
    // Due at minute 5, 10, 30 and 40: the earliest due row, not the earliest
    // created one and not the first inserted one.
    order: (p) => [p.notifications[1] as string],
    async run(store) {
      return (await store.notification.claimDue(new Date(START.getTime() + 35 * MINUTE), 1, 30_000)).map(
        (row) => row.notification_id,
      );
    },
  },
  {
    what: "fulfillment.all()",
    expected: 3,
    order: (p) => [p.fulfillments[1] as string, p.fulfillments[2] as string, p.fulfillments[0] as string],
    async run(store) {
      return (await store.fulfillment.all()).map((row) => row.fulfillment_id);
    },
  },
];

describe("module selection parity: every case discriminates", () => {
  it("returns the number of rows each case says it should, on the reference backend", async () => {
    const wrong: string[] = [];
    for (const probe of CASES) {
      const store = memoryPersistence(new FixedClock(START));
      const population = await populate(store);
      const result = await probe.run(store, population);
      if (!within(result.length, probe.expected)) {
        wrong.push(`${probe.what}: got ${result.length}, expected ${String(probe.expected)}`);
      }
    }
    expect(
      wrong,
      "a case no longer picks out the part of the population it was written for, so it has stopped discriminating",
    ).toEqual([]);
  });

  it("returns the declared order, not the order the rows were inserted in", async () => {
    // The half that does not need a database and does not need the other
    // backend: the population is inserted in the reverse of every listing's
    // order, so a store returning insertion order fails here on its own.
    const wrong: string[] = [];
    for (const probe of CASES) {
      if (!probe.order) continue;
      const store = memoryPersistence(new FixedClock(START));
      const population = await populate(store);
      const result = await probe.run(store, population);
      const expected = probe.order(population);
      if (JSON.stringify(result) !== JSON.stringify([...expected])) {
        wrong.push(`${probe.what}: got ${result.join(",")}, expected ${expected.join(",")}`);
      }
    }
    expect(
      wrong,
      "a reference listing returned rows in an order other than the one its SQL declares",
    ).toEqual([]);
  });
});

describe.runIf(url)("module selection parity: both backends select the same rows in the same order", () => {
  let pool: { end(): Promise<void>; query(text: string): Promise<unknown> } | undefined;

  beforeAll(async () => {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: url }) as never;
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function fresh(): Promise<{ memory: Persistence; postgres: Persistence; population: Population }> {
    await pool?.query(
      `truncate reputation_signal, notification, notification_recipient, membership,
                session, principal, identity_link, identity, fulfillment, ledger_entry,
                ledger_transaction, payment_authorization, wallet, usage_record,
                subscription_period, subscription, plan_grant, plan, event_delivery,
                event_subscription, inbound_event, organization, outbox, inbox,
                idempotency_key, audit_entry, service_area, city, region, country
       restart identity cascade`,
    );
    const memory = memoryPersistence(new FixedClock(START));
    const postgres = postgresPersistence(pool as never, new FixedClock(START));
    const population = await populate(memory);
    await populate(postgres);
    return { memory, postgres, population };
  }

  for (const probe of CASES) {
    it(`agrees on ${probe.what}`, async () => {
      const { memory, postgres, population } = await fresh();
      const fromMemory = await probe.run(memory, population);
      const fromPostgres = await probe.run(postgres, population);
      expect(
        within(fromMemory.length, probe.expected),
        `${probe.what}: the reference backend returned ${fromMemory.length} rows, so the case stopped discriminating before the comparison`,
      ).toBe(true);
      expect(
        [...fromPostgres],
        "the two backends selected different rows, or the same rows in a different order: one of the two listings is wrong and production runs the Postgres one",
      ).toEqual([...fromMemory]);
    });
  }

  it("holds the same population on both backends before any selection runs", async () => {
    const { memory, postgres } = await fresh();
    const shape = async (store: Persistence): Promise<unknown[]> => [
      (await store.organization.list()).length,
      (await store.identity.listIdentities()).length,
      (await store.money.allAuthorizations()).length,
      (await store.money.transactions()).length,
      (await store.subscription.listPlans()).length,
      (await store.notification.list({})).length,
      (await store.fulfillment.all()).length,
    ];
    const memoryShape = await shape(memory);
    expect(memoryShape, "the population is empty").toEqual([3, 3, 4, 3, 3, 4, 3]);
    expect(await shape(postgres), "the two backends do not hold the same population").toEqual(
      memoryShape,
    );
  });
});

/**
 * The notification dispatcher is a fourth lease queue, and it had the defect
 * milestone 21 fixed in the other three: its reference `reclaimExpired` took
 * whatever the `Map` handed it. A batch claim stamps one lease expiry on every
 * row, so the cases above cannot see it — this scenario staggers the leases the
 * same way milestone 21 did.
 */
async function staggeredNotifications(store: Persistence): Promise<{ ids: string[]; freed: string[] }> {
  await seedCountry(store);
  const organizationId = id(201);
  await store.organization.insert(
    {
      organization_id: organizationId,
      name: "Staggered",
      status: "active",
      country_code: "SA",
      created_at: at(0),
      updated_at: at(0),
      source_system: "parity",
      legacy_id: null,
    },
    NO_SCOPE,
  );
  const identityId = id(202);
  await store.identity.insertIdentity(
    {
      identity_id: identityId,
      status: "active",
      canonical_identity_id: null,
      display_name: "Staggered",
      created_at: at(0),
      updated_at: at(0),
      source_system: "parity",
      legacy_id: null,
    },
    NO_SCOPE,
  );
  const recipientId = id(203);
  await store.notification.insertRecipient(
    {
      recipient_id: recipientId,
      organization_id: organizationId,
      event_type: "core.fulfillment.completed",
      identity_id: identityId,
      channel: "telegram",
      active: true,
      created_at: at(0),
    },
    NO_SCOPE,
  );

  const ids = [id(211), id(212), id(213)];
  for (let index = 0; index < ids.length; index += 1) {
    await publish(store, id(220 + index));
    await store.notification.queue(
      {
        notification_id: ids[index] as string,
        event_id: id(220 + index),
        recipient_id: recipientId,
        organization_id: organizationId,
        channel: "telegram",
        address: "12345",
        template: "fulfillment_completed",
        subject: null,
        body: "staggered",
        data: {},
        idempotency_key: `staggered-${index}`,
        status: "pending",
        attempts: 0,
        last_error: null,
        provider_message_id: null,
        claim_token: null,
        claimed_at: null,
        next_attempt_at: at(index),
        created_at: at(index),
        accepted_at: null,
        delivered_at: null,
        failed_at: null,
      },
      NO_SCOPE,
    );
  }

  const claimed = await store.notification.claimDue(new Date(START.getTime() + 10 * MINUTE), 3, 30_000);
  const tokens = new Map(claimed.map((row) => [row.notification_id, row.claim_token]));
  // The middle row is failed back to pending and claimed again later, so its
  // lease is the last to run out even though it was queued second.
  await store.notification.markRetrying(
    ids[1] as string,
    tokens.get(ids[1] as string) as string,
    "staggered lease",
    new Date(START.getTime() + 20 * MINUTE),
    null,
  );
  await store.notification.claimDue(new Date(START.getTime() + 25 * MINUTE), 1, 30_000);
  await store.notification.reclaimExpired(new Date(START.getTime() + 90 * MINUTE), 9, 2);
  const freed = (await store.notification.list({}))
    .filter((row) => row.last_error !== null && row.last_error.startsWith("abandoned attempt"))
    .map((row) => row.notification_id);
  return { ids, freed: [...freed].sort() };
}

describe("module selection parity: the notification dispatcher recovers the longest-overdue claims", () => {
  it("frees the two oldest leases, not the two oldest rows", async () => {
    const store = memoryPersistence(new FixedClock(START));
    const { ids, freed } = await staggeredNotifications(store);
    expect(
      freed,
      "a limited recovery freed the rows in insertion order: the dispatcher is recovering by when a row was queued rather than by how long its claim has been abandoned",
    ).toEqual([ids[0], ids[2]].sort());
  });
});

describe.runIf(url)("module selection parity: both backends recover the same notification claims", () => {
  let pool: { end(): Promise<void>; query(text: string): Promise<unknown> } | undefined;

  beforeAll(async () => {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: url }) as never;
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("agrees on notification.reclaimExpired under a limit", async () => {
    await pool?.query(
      `truncate reputation_signal, notification, notification_recipient, membership,
                session, principal, identity_link, identity, fulfillment, ledger_entry,
                ledger_transaction, payment_authorization, wallet, usage_record,
                subscription_period, subscription, plan_grant, plan, event_delivery,
                event_subscription, inbound_event, organization, outbox, inbox,
                idempotency_key, audit_entry, service_area, city, region, country
       restart identity cascade`,
    );
    const fromMemory = await staggeredNotifications(memoryPersistence(new FixedClock(START)));
    const fromPostgres = await staggeredNotifications(
      postgresPersistence(pool as never, new FixedClock(START)),
    );
    expect(
      fromMemory.freed.length,
      "the scenario stopped discriminating: a limited recovery freed something other than two rows",
    ).toBe(2);
    expect(
      fromPostgres.freed,
      "the two backends recovered different abandoned claims: one of the two recovery orders is wrong and production runs the Postgres one",
    ).toEqual(fromMemory.freed);
  });
});

/**
 * The discovery this cycle made, recorded as its own gate.
 *
 * Milestone 21 ordered the `select` inside every queue claim. It did not notice
 * that `update ... returning` hands the rows back in the order it updated them
 * — a heap scan — not the order the `select` chose. The selection was right and
 * the batch a worker then processed was in storage order, which matched the due
 * order only because the fixtures inserted rows in the order they came due.
 * Inverting the insertion order is what made it visible: `notification.claimDue`
 * returned its three rows in insertion order on Postgres and in due order on
 * the reference backend.
 *
 * The scenario below inverts insertion order for the other three queues, whose
 * claims had the same shape. All three now carry the due rank out of the
 * selection and sort the returned batch by it.
 */
async function queuesFilledBackwards(
  store: Persistence,
  clock: FixedClock,
): Promise<{ outbox: string[]; inbound: string[]; deliveries: string[] }> {
  // Newest first: the clock runs backwards over the inserts, so `created_at`
  // and `received_at` descend as the rows arrive.
  clock.advance(START.getTime() + 2 * MINUTE - clock.now().getTime());
  const outbox: string[] = [];
  const inbound: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const out = {
      ...makeEvent({
        event_type: "core.fulfillment.completed",
        version: 1,
        producer: "core",
        occurred_at: clock.now(),
        correlation_id: `backwards-${index}`,
        entity_type: "fulfillment",
        entity_id: id(400 + index),
        payload: {},
      }),
      event_id: id(410 + (2 - index)),
    };
    await store.outbox.append(out, NO_SCOPE);
    outbox.unshift(out.event_id);
    const inn = {
      ...makeEvent({
        event_type: "move.job.completed",
        version: 1,
        producer: "move",
        occurred_at: clock.now(),
        correlation_id: `backwards-in-${index}`,
        entity_type: "job",
        entity_id: id(420 + index),
        payload: {},
      }),
      event_id: id(430 + (2 - index)),
    };
    await store.inbound.accept(inn);
    inbound.unshift(inn.event_id);
    clock.advance(-MINUTE);
  }

  const subscription = {
    ...eventSubscription("module-selection-parity", "core.fulfillment.completed"),
    subscription_id: id(440),
  };
  await store.delivery.insertSubscription(subscription);
  const deliveries: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const row = {
      ...delivery(outbox[2 - index] as string, subscription.subscription_id),
      delivery_id: id(450 + (2 - index)),
      created_at: at(2 - index),
      next_attempt_at: at(2 - index),
    };
    await store.delivery.queue(row);
    deliveries.unshift(row.delivery_id);
  }

  return { outbox, inbound, deliveries };
}

describe("module selection parity: a claim returns its batch in the order it claimed it", () => {
  it("serves the reference queues oldest-due first even when the rows arrived newest first", async () => {
    const clock = new FixedClock(START);
    const store = memoryPersistence(clock);
    const filled = await queuesFilledBackwards(store, clock);
    const now = new Date(START.getTime() + 10 * MINUTE);
    expect(
      (await store.outbox.claimDue(now, 10)).map((record) => record.event.event_id),
      "the outbox served its rows in the order they were appended rather than the order they came due",
    ).toEqual(filled.outbox);
    expect(
      (await store.inbound.claimDue(now, 10)).map((record) => record.event.event_id),
      "the inbound log served its rows in arrival order rather than due order",
    ).toEqual(filled.inbound);
    expect(
      (await store.delivery.claimDue(now, 10)).map((row) => row.delivery_id),
      "the delivery queue served its rows in insertion order rather than due order",
    ).toEqual(filled.deliveries);
  });
});

describe.runIf(url)("module selection parity: both backends return a claimed batch in the same order", () => {
  let pool: { end(): Promise<void>; query(text: string): Promise<unknown> } | undefined;

  beforeAll(async () => {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: url }) as never;
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("agrees on the order of an outbox, inbound and delivery claim", async () => {
    await pool?.query(
      `truncate event_delivery, event_subscription, inbound_event, outbox, inbox
       restart identity cascade`,
    );
    const memoryClock = new FixedClock(START);
    const memory = memoryPersistence(memoryClock);
    const filled = await queuesFilledBackwards(memory, memoryClock);
    const postgresClock = new FixedClock(START);
    await queuesFilledBackwards(postgresPersistence(pool as never, postgresClock), postgresClock);
    const postgres = postgresPersistence(pool as never, new FixedClock(START));
    const now = new Date(START.getTime() + 10 * MINUTE);

    const fromMemory = [
      (await memory.outbox.claimDue(now, 10)).map((record) => record.event.event_id),
      (await memory.inbound.claimDue(now, 10)).map((record) => record.event.event_id),
      (await memory.delivery.claimDue(now, 10)).map((row) => row.delivery_id),
    ];
    expect(
      fromMemory,
      "the scenario stopped discriminating: a queue claimed something other than its three rows",
    ).toEqual([filled.outbox, filled.inbound, filled.deliveries]);
    const fromPostgres = [
      (await postgres.outbox.claimDue(now, 10)).map((record) => record.event.event_id),
      (await postgres.inbound.claimDue(now, 10)).map((record) => record.event.event_id),
      (await postgres.delivery.claimDue(now, 10)).map((row) => row.delivery_id),
    ];
    expect(
      fromPostgres,
      "Postgres returned a claimed batch in a different order from the reference backend: the batch a worker processes is in storage order, and production runs the Postgres one",
    ).toEqual(fromMemory);
  });
});
