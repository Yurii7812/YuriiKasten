package net.yurii.note

import org.junit.Assert.*
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class CaptureTest {
    @Test fun paperIdSteps() {
        assertEquals("pa-1a2", PaperId.normalize("pa-1A2"))
        assertEquals("1a2", PaperId.normalize(" 1A2 "))
        assertTrue(PaperId.isValid("1a2") && PaperId.isValid("12ab3") && !PaperId.isValid("") && !PaperId.isValid("a1") && !PaperId.isValid("1-"))
        // ↓（子）と → （次の連番）
        assertEquals("1a2a", PaperId.child("1a2"))
        assertEquals("1a1", PaperId.child("1a"))
        assertEquals("1a3", PaperId.nextSibling("1a2"))
        assertEquals("1b", PaperId.nextSibling("1a"))
        assertEquals("2", PaperId.nextSibling("1"))
        assertEquals("1aa", PaperId.nextSibling("1z"))
        assertEquals("1ba", PaperId.nextSibling("1az"))
        assertEquals("1b", PaperId.nextSibling("1a"))
        assertEquals("10", PaperId.nextSibling("9"))
    }

    private val entries = listOf(
        Entry("1", 1, UNASSIGNED, "そのまま\n本文"),
        Entry("2", 2, DIARY, "日記"),
        Entry("3", 3, "仕事", "仕事のメモ"),
    )

    @Test fun importedRemovalKeepsRecordsAndUnimportedTopics() {
        val es = listOf(Entry("a", 1, "済み", "a"), Entry("b", 2, "途中", "b"),
            Entry("c", 3, "途中", "c"), Entry("d", 4, "夢", "d"),
            Entry("e", 5, DIARY, "e"), Entry("f", 6, "PC記録", "f"))
        val settings = Settings(topics = listOf(DIARY, "済み", "途中", "夢", "PC記録", "まだ空"), lastTopic = "済み",
            topicModes = mapOf("済み" to TopicMode(single = true), "夢" to TopicMode(record = true)))
        val out = settingsAfterImportedRemoval(es, settings, setOf("a", "b", "d", "e", "f"), setOf("PC記録"))
        assertEquals(listOf(DIARY, "途中", "夢", "PC記録", "まだ空"), out.topics)
        assertEquals(ALL, out.lastTopic)
        assertFalse("済み" in out.topicModes)
        assertTrue(out.topicModes["夢"]!!.record)
        assertEquals(settings, settingsAfterImportedRemoval(es, settings, emptySet()))
    }

    @Test fun filterAndComposeDestination() {
        assertEquals(entries, visibleEntries(entries, ALL))
        assertEquals(listOf(entries[0]), visibleEntries(entries, UNASSIGNED))
        assertEquals(listOf(entries[1]), visibleEntries(entries, DIARY))
        assertEquals(listOf(entries[2]), visibleEntries(entries, "仕事"))
        assertEquals(emptyList<Entry>(), visibleEntries(entries, "空のトピック"))
        assertEquals(UNASSIGNED, writingTopic(ALL))
        assertEquals(UNASSIGNED, writingTopic(UNASSIGNED))
        assertEquals("仕事", writingTopic("仕事"))
        assertEquals(UNASSIGNED, normalizedTopic("メモ"))
    }

    private fun at(day: Int, hour: Int, minute: Int = 0): Long = Calendar.getInstance().apply {
        clear(); set(2026, Calendar.OCTOBER, day, hour, minute)
    }.timeInMillis

    @Test fun regularHoursOvernightAndFullDay() {
        val original = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo"))
        try {
            assertEquals(at(19, 11), AlarmTiming.next(60, 9, 23, at(19, 10)))
            assertEquals(at(20, 9), AlarmTiming.next(60, 9, 23, at(19, 22, 30)))
            assertEquals(at(19, 9), AlarmTiming.next(60, 9, 23, at(19, 6)))
            assertEquals(at(20, 0, 30), AlarmTiming.next(60, 0, 24, at(19, 23, 30)))
            assertEquals(at(19, 13), AlarmTiming.next(60, 1, 1, at(19, 12)))
            assertEquals(at(19, 22), AlarmTiming.next(60, 22, 6, at(19, 12)))
            assertEquals(at(19, 22), AlarmTiming.next(60, 22, 6, at(19, 5, 30)))
            assertEquals(at(20, 1), AlarmTiming.next(60, 22, 6, at(20, 0)))
            assertFalse(AlarmTiming.inside(9, 23, 23))
            assertTrue(AlarmTiming.inside(22, 6, 2))
            assertFalse(AlarmTiming.inside(22, 6, 12))
            assertTrue(AlarmTiming.inside(0, 24, 0))
            assertTrue(AlarmTiming.inside(1, 1, 12))
        } finally { TimeZone.setDefault(original) }
    }

    @Test fun memoLinks() {
        val text = "前の [買い物リスト](memo:261019100000) と [日記](memo:261019120000) を見る"
        val ids = MEMO_LINK.findAll(text).map { it.groupValues[2] }.toList()
        assertEquals(listOf("261019100000", "261019120000"), ids)
        assertEquals("買い物リスト", MEMO_LINK.find(text)!!.groupValues[1])
        // 普通の Markdown のリンクや URL はメモのリンクではない
        assertNull(MEMO_LINK.find("[サイト](https://example.com)"))
        // 表示名は最初の行を短く、[ ] を含めない
        assertEquals("ab c", linkLabel("\n[ab] c\n2行目"))
    }

    @Test fun searchWithSpaces() {
        val text = "あしたの会議でアイデアを話す"
        assertTrue(matchesQuery(text, "あ　い"))           // 全角の空白で区切ると、すべての語を含むもの
        assertTrue(matchesQuery(text, "会議 アイデア"))
        assertTrue(matchesQuery(text, "  会議   "))
        assertTrue(matchesQuery(text, "あいであ"))          // カタカナとひらがなは同じ
        assertTrue(matchesQuery("ＡＢＣ memo", "abc"))      // 全角・半角、大文字・小文字は同じ
        assertFalse(matchesQuery(text, "会議 予算"))
        assertTrue(matchesQuery(text, ""))
    }

    @Test fun rangeAndHeadings() {
        val order = listOf("a", "b", "c", "d")
        assertEquals(listOf("b", "c", "d"), rangeIds(order, "d", "b"))   // 逆向きでも間を全部
        assertEquals(listOf("b", "c"), rangeIds(order, "b", "c"))
        assertEquals(listOf("x"), rangeIds(order, "zz", "x"))
        assertEquals(listOf("見出し 1", "二つ目"), memoHeadings("本文\n## 見出し 1\n#タグではない\n### 二つ目 \n"))
    }

    @Test fun folgezettelRowsAndCollapse() {
        val es = listOf(
            Entry("r1", 1, "", "1"), Entry("a", 2, "", "1a", parent = "r1"), Entry("a1", 3, "", "1a1", parent = "a"),
            Entry("a1a", 4, "", "1a1a", parent = "a1"), Entry("a2", 5, "", "1a2", parent = "a"), Entry("b", 6, "", "1b", parent = "r1"),
            Entry("r2", 7, "", "2"), Entry("x", 8, "", "親は別のトピック", parent = "gone"),
        )
        val rows = folgeRows(es)
        assertEquals(listOf("1", "1a", "1a1", "1a1a", "1a2", "1b", "2", "3"), rows.map { it.label })
        assertEquals(listOf(0, 1, 2, 3, 2, 1, 0, 0), rows.map { it.depth })
        assertTrue(rows.first { it.entry.id == "a" }.hasChildren)
        // 1a を折りたたむと 1a1・1a1a・1a2 が消える
        assertEquals(listOf("1", "1a", "1b", "2", "3"), folgeRows(es, setOf("a")).map { it.label })
        // 全部折りたたむと最上位だけ
        assertEquals(listOf("1", "2", "3"), folgeRows(es, folgeParents(es)).map { it.label })
        assertEquals("aa", folgeLetters(27))
    }

    @Test fun renameTopicKeepsModesAndRefusesBadNames() {
        val s = Settings(topics = listOf(DIARY, "夢"), topicModes = mapOf("夢" to TopicMode(record = true)), lastTopic = "夢")
        val es = listOf(Entry("1", 1, "夢", "a"), Entry("2", 2, DIARY, "b"))
        val (ne, ns) = renameTopic(es, s, "夢", "ゆめ")!!
        assertEquals(listOf("ゆめ", DIARY), ne.map { it.topic })
        assertEquals(listOf(DIARY, "ゆめ"), ns.topics)
        assertTrue(ns.topicModes["ゆめ"]!!.record)
        assertEquals("ゆめ", ns.lastTopic)
        assertNull(renameTopic(es, s, DIARY, "x"))
        assertNull(renameTopic(es, s, "夢", DIARY))
        assertNull(renameTopic(es, s, "夢", "  "))
    }

    @Test fun backdatedTextStamp() {
        assertEquals("本文", backdatedText("本文", false, 0))
        assertTrue(backdatedText("本文", true, 0).matches(Regex("^（\\d{4}-\\d{2}-\\d{2} に記入）本文$")))
    }

    @Test fun backdatedTimeKeepsTheDay() {
        val day = java.util.Calendar.getInstance().apply { set(2026, 9, 17, 0, 0, 0); set(java.util.Calendar.MILLISECOND, 0) }.timeInMillis
        val now = java.util.Calendar.getInstance().apply { set(2026, 9, 20, 14, 30, 5) }.timeInMillis
        val t = java.util.Calendar.getInstance().apply { timeInMillis = backdatedTime(day, now) }
        assertEquals(17, t.get(java.util.Calendar.DAY_OF_MONTH))
        assertEquals(14, t.get(java.util.Calendar.HOUR_OF_DAY))
        assertEquals(30, t.get(java.util.Calendar.MINUTE))
    }

    @Test fun deleteTopicMovesMemosToUnassigned() {
        val s = Settings(topics = listOf(DIARY, "仕事"), topicModes = mapOf("仕事" to TopicMode(single = true)), lastTopic = "仕事")
        val es = listOf(Entry("1", 1, "仕事", "a"), Entry("2", 2, DIARY, "b"))
        val (ne, ns) = deleteTopic(es, s, "仕事")!!
        assertEquals(listOf(UNASSIGNED, DIARY), ne.map { it.topic })
        assertEquals(listOf(DIARY), ns.topics)
        assertNull(ns.topicModes["仕事"])
        assertEquals(ALL, ns.lastTopic)
        assertNull(deleteTopic(es, s, DIARY))
    }

    @Test fun pcMemosAreShared() {
        val mine = Entry("m1", 1, "夢", "スマホで書いた")
        val shared = Entry("pc-a1", 100, "夢", "古い", pcId = "a1", edited = 5)
        val gone = Entry("pc-a2", 200, "夢", "PCで消えた", pcId = "a2")
        val memos = listOf(PcMemo("a1", "夢", 100, "PCで直した", 50), PcMemo("a3", "", 300, "新しい", 0), PcMemo("a4", "夢", 400, "スマホで消した", 0))
        val out = mergePcMemos(listOf(mine, shared, gone), memos, setOf("a4"))
        assertEquals(listOf("m1", "pc-a1", "pc-a3"), out.map { it.id })
        assertEquals("PCで直した", out[1].text)                         // PC の方が新しい
        assertEquals(UNASSIGNED, out[2].topic)
        val keep = mergePcMemos(listOf(shared.copy(text = "スマホで直した", edited = 99)), listOf(PcMemo("a1", "夢", 100, "PC", 50)), emptySet())
        assertEquals("スマホで直した", keep[0].text)                     // スマホの方が新しい
    }
}
