package net.yurii.note

/**
 * 紙のノートの番号（PC の python/paper_pkm.py と同じ規則）。`1a2` の形（数字と小文字）。
 * 題と画像の名前も、この番号そのもの（印は付けない。2026-11-04 の決め）。
 * 画面は、矢印（またはボタン）で「前の番号の子」「次の連番」を付ける。
 */
object PaperId {
    private val BODY = Regex("^[0-9]+([a-z]+[0-9]+)*[a-z]*$")

    /** 前後の空白を除き、小文字にする（`1A2` → `1a2`）。 */
    fun normalize(raw: String): String = raw.trim().lowercase()

    /** 番号として正しいか。 */
    fun isValid(id: String): Boolean = BODY.matches(id)

    /** 前の番号の子（`1a2` → `1a2a`、`1a` → `1a1`）。 */
    fun child(id: String): String = id + (if (id.last().isDigit()) "a" else "1")

    /** 次の連番（`1a2` → `1a3`、`1a` → `1b`、`1z` → `1aa`）。 */
    fun nextSibling(id: String): String {
        val m = Regex("([a-z]+|[0-9]+)$").find(id) ?: return id
        val tail = m.groupValues[1]
        val next = if (tail[0].isDigit()) (tail.toBigInteger() + java.math.BigInteger.ONE).toString() else incrementLetters(tail)
        return id.substring(0, m.range.first) + next
    }

    private fun incrementLetters(letters: String): String {
        val c = letters.toCharArray()
        var i = c.size - 1
        while (i >= 0) {
            if (c[i] != 'z') { c[i] = c[i] + 1; return String(c) }
            c[i] = 'a'
            i--
        }
        return "a" + String(c)
    }
}
