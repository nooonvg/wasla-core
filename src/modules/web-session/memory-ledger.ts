/**
 * `modules/web-session/memory-ledger.ts` — مخازنُّ دخولِ الويبِ في الذاكرةِ.
 *
 * للإسنادِ المرجعيِّ (الاختباراتِ) والعملياتِ أحاديّةِ العمليّةِ. نفسُ عقودِ
 * نسخةِ القاعدةِ، وبنفسِ الذرّيّةِ: القرارُ متزامنٌ في مسارٍ واحدٍ (الذاكرةُ لا
 * تُشارَكُ بينَ عملياتٍ)، والكتابةُ عبرَ `putRow` فتخضعُ الصفوفُ لبوابةِ
 * تكافؤِ الأعمدةِ كأيِّ جدولٍ محرَّكٍ آخرَ — لا إعفاءَ لجدولٍ لهُ كاتبٌ.
 */

import type { Clock } from "../../platform/clock.js";
import type { ReferenceKeys } from "../../platform/persistence/reference-keys.js";
import { putRow } from "../../platform/persistence/row-rules.js";
import type { WebSignInNonceStore } from "./service.js";

/** صفُّ `web_sign_in_nonces` كما يتركهُ الترحيلُ 0023. */
interface NonceRow {
  nonce_hash: string;
  attempt_hash: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

export class InMemoryWebSignInNonceStore implements WebSignInNonceStore {
  private readonly rows = new Map<string, NonceRow>();

  constructor(clock: Clock, keys: ReferenceKeys) {
    keys.attach("web_sign_in_nonces", this.rows);
    this.clock = clock;
  }

  private readonly clock: Clock;

  async issue(nonceHash: string, attemptHash: string, expiresAt: Date): Promise<void> {
    if (this.rows.has(nonceHash)) return;
    putRow("web_sign_in_nonces", this.rows, nonceHash, {
      nonce_hash: nonceHash,
      attempt_hash: attemptHash,
      created_at: this.clock.now().toISOString(),
      expires_at: expiresAt.toISOString(),
      consumed_at: null,
    });
  }

  async consumeIfFresh(nonceHash: string, attemptHash: string): Promise<boolean> {
    const row = this.rows.get(nonceHash);
    if (row === undefined || row.attempt_hash !== attemptHash) return false;
    if (row.consumed_at !== null) return false;
    if (new Date(row.expires_at).getTime() <= this.clock.now().getTime()) return false;
    // التحديثُ عبرَ putRow ليخضعَ الانتقالُ (null → now) لنفسِ بوابةِ الصفوفِ.
    putRow("web_sign_in_nonces", this.rows, nonceHash, {
      ...row,
      consumed_at: this.clock.now().toISOString(),
    });
    return true;
  }
}
