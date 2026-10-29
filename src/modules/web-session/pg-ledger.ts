/**
 * `modules/web-session/pg-ledger.ts` — مخزنُّ دخولِ الويبِ على PostgreSQL.
 *
 * القرارُ (من فازَ بالمحاولةِ) يُتَّخَذُ حيثُ الصفُّ واحدٌ: تحديثٌ مشروطٌ واحدٌ
 * والقرارُ في المحرّكِ نفسِهِ.
 */

import { runner, type Queryable } from "../../platform/persistence/postgres.js";
import type { MiniAppInitDataStore } from "./service.js";

export class PgWebSignInNonceStore {
  constructor(private readonly pool: Queryable, private readonly clock: { now(): Date }) {}

  async issue(nonceHash: string, attemptHash: string, expiresAt: Date): Promise<void> {
    await runner(this.pool).query(
      `INSERT INTO web_sign_in_nonces (nonce_hash, attempt_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (nonce_hash) DO NOTHING`,
      [nonceHash, attemptHash, this.now().toISOString(), expiresAt.toISOString()],
    );
  }

  private now(): Date {
    // ساعةُ الحقنِ لا ساعةَ الجدارِ: الاختبارُ يجمّدها، والإنتاجُ يستقبلُها.
    // `created_at` عمودٌ بلا قيمةٍ يُرسِلُها المستدعي، فلا يُطبَّقُ افتراضُ
    // القاعدةِ عليها هنا — تُكتبُ قيمتُها صراحةً من الزمنِ المُعطى.
    return this.clock.now();
  }

  /**
   * أولُ استهلاكٍ يفوزُ ذرّيًّا: مستهلَكٌ أو منتهيًا أو مجهولًا — كلُّها رفضٌ واحدٌ.
   *
   * الصلاحيّةُ تُقاسُ بساعةِ الحقنِ لا بساعةِ القاعدةِ: الاختبارُ يجمّدُ الزمنَ
   * ليجتازَ حدودَ الصلاحيّةِ (قبلَ النهايةِ وبعدَها)، والإنتاجُ يستقبلُ ساعةً
   * حقيقيّةً — وقرارُ «منتهيًا» قرارُ الخدمةِ لا قرارَ المحرّكِ. القرارُ نفسُهُ
   * يبقى ذرّيًّا في المحرّكِ: شرطٌ واحدٌ في تحديثٍ واحدٍ.
   */
  async consumeIfFresh(nonceHash: string, attemptHash: string): Promise<boolean> {
    const at = this.now().toISOString();
    // nonce ومحاولةً معًا في شرطٍ واحدٍ: الفائزُ هو من فتحَ المحاولةَ بنفسِهِ
    // ولم ينتهِ — لا متصفّحٌ آخرَ مهما كانَ رمزُهُ صحيحَ التوقيعِ.
    const result = await runner(this.pool).query(
      `UPDATE web_sign_in_nonces
       SET consumed_at = $3
       WHERE nonce_hash = $1 AND attempt_hash = $2
         AND consumed_at IS NULL AND expires_at > $3
       RETURNING nonce_hash`,
      [nonceHash, attemptHash, at],
    );
    return result.rowCount === 1;
  }
}

/**
 * `PgMiniAppProofStore` — مخزنُّ أدلّةِ المصغّرِ على PostgreSQL (D-XR-13 · ترحيلُ
 * 0025).
 *
 * القرارُ (أولُ من استعملَ الدليلَ) يُتَّخَذُ حيثُ الصفُّ الواحدُ: إدراجٌ واحدٌ
 * مشروطٌ بعدمِ الوجودِ (`ON CONFLICT DO NOTHING`) — فالموجودُ سلفًا دليلٌ
 * استُهلِكَ، والفائزُ في التزامنِ من تُرجِعَ الإدراجةُ صفًّا.
 */
export class PgMiniAppProofStore implements MiniAppInitDataStore {
  constructor(private readonly pool: Queryable, private readonly clock: { now(): Date }) {}

  async consumeIfFirstUse(proofFingerprint: string): Promise<boolean> {
    const result = await runner(this.pool).query(
      `INSERT INTO mini_app_init_data_proofs (proof_hash, created_at)
       VALUES ($1, $2)
       ON CONFLICT (proof_hash) DO NOTHING
       RETURNING proof_hash`,
      [proofFingerprint, this.clock.now().toISOString()],
    );
    return result.rowCount === 1;
  }
}
