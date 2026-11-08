package net.yurii.kasten

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class VaultTest {
    private fun tmp() = Files.createTempDirectory("kasten").toFile()

    @Test fun ids() {
        assertEquals("1b", Ids.sibling("1a")); assertEquals("2", Ids.sibling("1")); assertEquals("1a2", Ids.sibling("1a1"))
        assertEquals("1a", Ids.child("1")); assertEquals("1a1", Ids.child("1a"))
        assertEquals(listOf("1", "1a", "1a2", "1b", "2", "10"), listOf("10", "2", "1b", "1a2", "1a", "1").sortedWith(Ids.cmp))
        assertTrue(Ids.isId("1a3") && !Ids.isId("20261108073511") && !Ids.isId("a1"))
        assertEquals("1", Ids.parentIn("1a1") { it == "1" })
    }

    @Test fun links() {
        fun ids(t: String) = Links.refs(t).map { it.id }
        assertEquals(listOf("1a", "1b", "2", "3"), ids(":1a,1b、2 と :3"))
        assertEquals(emptyList<String>(), ids("これは : 1a で、リンクではない"))
        assertEquals(listOf("5"), ids("`:3` と ``:4`` と :5"))
        assertEquals(listOf("1", "6"), ids("前 :1\n```\n:4 :5\n```\n後 :6"))
        assertEquals(listOf("1a"), ids("1a: 全体"))
    }

    @Test fun parsesNoteFileMadeByPc() {
        val pc = "---\nfolgezettel: \"1a\"\nsource: \"digital\"\ncreated: \"2026-11-07 12:17:00\"\nupdated: \"2026-11-08 09:04:02\"\ntitle: \"索引問題\"\nkeywords: [\"PKM\",\"索引\"]\nmyprop: \"x\"\n---\n# 索引問題\n\n<p style=\"color:#888\">1a</p>\n\n<!-- body -->\n本文 [:1b](20261107121800.md)  \n2行目  \n<!-- nav -->\n<hr>\n"
        val n = NoteFile.parse("20261107121700", pc)!!
        assertEquals("1a", n.id); assertEquals("索引問題", n.title); assertEquals(listOf("PKM", "索引"), n.keywords)
        assertEquals("本文 :1b\n2行目", n.body)                     // PC が付けたリンク記法と行末の空白は、読むとき外す
        assertEquals("x", n.extra["myprop"]?.trim('"'))
        val back = NoteFile.parse("20261107121700", NoteFile.render(n))!!
        assertEquals(n.copy(), back.copy())                          // 書いて読み直しても同じ
        assertTrue(NoteFile.render(n).contains("myprop: \"x\""))     // 知らない項目も残す
    }

    @Test fun noidAndNonText() {
        val f = "---\nsource: \"digital\"\ncreated: \"2026-11-08 07:35:11\"\nkind: \"rp\"\n---\n# x\n\n<!-- body -->\nだれか: やあ\n<!-- nav -->\n"
        val n = NoteFile.parse("20261108073511", f)!!
        assertTrue(n.noid && !n.editable && n.kind == "rp")
    }

    @Test fun vaultCreateSaveRename() {
        val dir = tmp(); val v = Vault(dir)
        val a = v.create("1", body = "最初 :1a"); val b = v.create("1a", body = "子")
        assertTrue(a.stem != b.stem && a.stem.length == 14)
        assertTrue(File(dir, a.stem + ".md").readText().startsWith("---\nfolgezettel: \"1\"\nsource: \"digital\""))
        val v2 = Vault(dir); v2.load()
        assertEquals(2, v2.notes.size); assertEquals("子", v2.get("1a")!!.body)
        assertEquals(listOf("1a"), v2.childrenOf(v2.get("1")!!).map { it.id })
        assertEquals(listOf("1"), v2.backlinks(v2.get("1a")!!).map { it.id })   // 1 が :1a と書いている
        assertNull(v2.setId(v2.get("1a")!!, "1"))                    // 重なる ID は付けない
        val r = v2.setId(v2.get("1a")!!, "2")!!; assertEquals(b.stem, r.stem)   // ID を変えても、ファイル名は動かない
        assertEquals("1a", v2.freeId("1a", false)); assertEquals("3", v2.freeId("1", false))
        val n = v2.create(null); assertTrue(n.noid)
        v2.delete(n); assertEquals(2, v2.notes.size); assertTrue(File(dir, ".trash").listFiles()!!.size == 1)
        // 同じ秒でもずらす
        val x = v2.create("9"); val y = v2.create("10"); assertNotEquals(x.stem, y.stem)
    }

    @Test fun duplicateIdBecomesNoid() {
        val dir = tmp()
        for (s in listOf("20261108000001", "20261108000002")) File(dir, "$s.md").writeText("---\nfolgezettel: \"1\"\nsource: \"digital\"\ncreated: \"2026-11-08 00:00:01\"\n---\n# 1\n\n<!-- body -->\nx$s\n<!-- nav -->\n")
        val v = Vault(dir); v.load()
        assertEquals(2, v.notes.size); assertEquals(1, v.notes.count { it.noid })   // 消えずに、片方は IDなし
    }

    @Test fun diary() {
        val dir = tmp(); val v = Vault(dir)
        v.saveDiary(Diary("2026-11-08", "", "", "朝は晴れ\n:1a"))
        assertTrue(File(dir, "D_2026-11-08.md").readText().contains("<!-- body -->\n朝は晴れ"))
        val v2 = Vault(dir); v2.load(); assertEquals("朝は晴れ\n:1a", v2.diary("2026-11-08")!!.body)
    }

    @Test fun miniJson() {
        val x = MiniJson.parse("""[{"name":"a b.md","hash":"h","mtime":123,"size":4,"x":[1,true,null]}]""") as List<*>
        assertEquals("a b.md", (x[0] as Map<*, *>)["name"]); assertEquals(123L, (x[0] as Map<*, *>)["mtime"])
        assertEquals("\"a\\\"\\n\"", MiniJson.quote("a\"\n"))
    }

    // 本物のサーバー（server/server.js）と同期する。node が無ければ飛ばす
    @Test fun syncWithRealServer() {
        val node = (System.getenv("PATH") ?: "").split(File.pathSeparator).map { File(it, "node") }.firstOrNull { it.canExecute() }?.path ?: listOf("/home/yurii/.local/bin/node").firstOrNull { File(it).canExecute() }
        val server = File("../../server/server.js").absoluteFile
        org.junit.Assume.assumeTrue(node != null && server.exists())
        val data = tmp(); val port = java.net.ServerSocket(0).use { it.localPort }
        val pb = ProcessBuilder(node, server.path).apply { environment().putAll(mapOf("YURIIKASTEN_DATA" to data.path, "YURIIKASTEN_TOKEN" to "t", "YURIIKASTEN_PORT" to "$port", "YURIIKASTEN_HOST" to "127.0.0.1")); redirectErrorStream(true) }
        val p = pb.start()
        try {
            Thread.sleep(1200)
            val d1 = tmp(); val v1 = Vault(d1); v1.create("1", body = "スマホで書いた"); v1.create(null, body = "未整理")
            val s1 = VaultSync(d1, "http://127.0.0.1:$port", "t", v1.lock).sync()
            assertEquals(2, s1.pushed); assertEquals(2, data.listFiles()!!.count { it.name.endsWith(".md") })
            // 別の端末が取る → 書き換える → こちらが取る
            val d2 = tmp(); VaultSync(d2, "http://127.0.0.1:$port", "t").sync()
            val v2 = Vault(d2); v2.load(); assertEquals("スマホで書いた", v2.get("1")!!.body)
            Thread.sleep(1100); v2.save(v2.get("1")!!.copy(body = "PCで直した")); VaultSync(d2, "http://127.0.0.1:$port", "t").sync()
            val r = VaultSync(d1, "http://127.0.0.1:$port", "t").sync(); assertEquals(1, r.pulled)
            v1.load(); assertEquals("PCで直した", v1.get("1")!!.body)
            // 消す
            v1.delete(v1.get("1")!!); VaultSync(d1, "http://127.0.0.1:$port", "t").sync()
            assertEquals(1, data.listFiles()!!.count { it.name.endsWith(".md") })
            // 合言葉が違う
            assertThrows(IllegalStateException::class.java) { VaultSync(d1, "http://127.0.0.1:$port", "x").sync() }
        } finally { p.destroy() }
    }
}
