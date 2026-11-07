package net.yurii.kasten

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class KastenTest {
    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int): Long =
        Calendar.getInstance().apply { clear(); set(y, mo - 1, d, h, mi, s) }.timeInMillis

    @Test fun ファイル名は作成時刻から決まる() {
        val e = Entry(id = "261107143521", created = at(2026, 11, 7, 14, 35, 21), topic = "", text = "あ")
        assertEquals("D_u20261107-143521.md", Kasten.fileName(e))
        assertEquals("D_u20261107-143521-2.md", Kasten.fileName(e.copy(id = "261107143521-2")))
    }

    @Test fun 文脈と分岐元は本文の前にリンクの行で入る() {
        val a = Entry(id = "261107100000", created = at(2026, 11, 7, 10, 0, 0), topic = "", text = "最初")
        val b = Entry(id = "261107110000", created = at(2026, 11, 7, 11, 0, 0), topic = "", text = "続き [最初](memo:261107100000) を見る", parent = a.id, contexts = listOf(a.id))
        val md = Kasten.render(b, mapOf(a.id to a, b.id to b))
        assertTrue(md.contains("\"created\":\"2026-11-07 11:00\""))
        val body = md.substringAfter("<!-- body -->\n").substringBefore("\n<!-- nav -->")
        assertEquals("[分岐元](D_u20261107-100000.md)\n[文脈](D_u20261107-100000.md)\n\n続き [最初](D_u20261107-100000.md) を見る", body)
    }

    @Test fun 画像は本文の最後に入る() {
        val e = Entry(id = "261107120000", created = at(2026, 11, 7, 12, 0, 0), topic = "", text = "写真", images = listOf("x.JPG"))
        val n = Kasten.imageName(e, 0, "x.JPG")
        assertEquals("kasten-20261107-120000-1.jpg", n)
        assertTrue(Kasten.render(e, mapOf(e.id to e), listOf(n)).contains("写真\n\n![](kasten-20261107-120000-1.jpg)"))
    }
}
