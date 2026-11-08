package net.yurii.kasten

import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// ===== 小さな JSON（org.json を使わない。JVM の試験でも動くように）=====
object MiniJson {
    fun parse(s: String): Any? { val p = P(s); p.ws(); return p.value() }
    fun quote(s: String): String {
        val b = StringBuilder("\"")
        for (c in s) when (c) {
            '"' -> b.append("\\\""); '\\' -> b.append("\\\\"); '\n' -> b.append("\\n"); '\r' -> b.append("\\r"); '\t' -> b.append("\\t")
            else -> if (c < ' ') b.append(String.format("\\u%04x", c.code)) else b.append(c)
        }
        return b.append('"').toString()
    }
    private class P(val s: String) {
        var i = 0
        fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
        fun value(): Any? {
            ws(); if (i >= s.length) return null
            return when (s[i]) {
                '{' -> { i++; val m = LinkedHashMap<String, Any?>(); ws(); if (s[i] == '}') { i++; return m }
                    while (true) { ws(); val k = str(); ws(); i++ /* : */; m[k] = value(); ws(); if (s[i] == ',') i++ else { i++; break } }; m }
                '[' -> { i++; val l = ArrayList<Any?>(); ws(); if (s[i] == ']') { i++; return l }
                    while (true) { l += value(); ws(); if (s[i] == ',') i++ else { i++; break } }; l }
                '"' -> str()
                else -> { val j = i; while (i < s.length && s[i] !in ",}] \n\r\t") i++; val t = s.substring(j, i)
                    when (t) { "true" -> true; "false" -> false; "null" -> null; else -> t.toLongOrNull() ?: t.toDoubleOrNull() } }
            }
        }
        fun str(): String {
            i++ /* " */; val b = StringBuilder()
            while (i < s.length && s[i] != '"') {
                if (s[i] == '\\') { i++; when (val c = s[i]) { 'n' -> b.append('\n'); 'r' -> b.append('\r'); 't' -> b.append('\t'); 'u' -> { b.append(s.substring(i + 1, i + 5).toInt(16).toChar()); i += 4 }; else -> b.append(c) } }
                else b.append(s[i])
                i++
            }
            i++; return b.toString()
        }
    }
}

// ===== ID（folgezettel）。PC の lib.js と同じ決まり =====
object Ids {
    private val ID = Regex("[0-9]+[a-z0-9]*")
    private val TOK = Regex("\\d+|[a-z]+")
    fun isId(s: String) = ID.matches(s) && !Regex("\\d{8,}").matches(s)   // 日時の名前は ID ではない
    fun tok(id: String) = TOK.findAll(id).map { it.value }.toList()
    private fun cmpTok(a: String, b: String): Int {
        val an = a[0].isDigit(); val bn = b[0].isDigit()
        return when {
            an && bn -> a.toLong().compareTo(b.toLong())
            !an && !bn -> if (a.length != b.length) a.length - b.length else a.compareTo(b)
            an -> -1 else -> 1
        }
    }
    val cmp = Comparator<String> { x, y ->
        val a = tok(x); val b = tok(y)
        for (i in 0 until minOf(a.size, b.size)) { val c = cmpTok(a[i], b[i]); if (c != 0) return@Comparator c }
        a.size - b.size
    }
    private fun incLetters(s: String): String {
        val c = s.toCharArray(); var i = c.size - 1
        while (i >= 0) { if (c[i] == 'z') { c[i] = 'a'; i-- } else { c[i] = c[i] + 1; return String(c) } }
        return "a" + String(c)
    }
    fun sibling(id: String): String {   // 並列: 1a→1b, 1→2, 1a1→1a2
        val t = tok(id).toMutableList(); if (t.isEmpty()) return "1"
        val l = t.removeAt(t.size - 1); t.add(if (l[0].isDigit()) (l.toLong() + 1).toString() else incLetters(l)); return t.joinToString("")
    }
    fun child(id: String): String {      // 分岐: 1→1a, 1a→1a1
        val t = tok(id); if (t.isEmpty()) return "1"
        return id + if (t.last()[0].isDigit()) "a" else "1"
    }
    fun parentIn(id: String, has: (String) -> Boolean): String? {
        val t = tok(id).toMutableList()
        while (t.size > 1) { t.removeAt(t.size - 1); val p = t.joinToString(""); if (has(p)) return p }
        return null
    }
    fun root(id: String) = tok(id).firstOrNull() ?: id
}

/** 本文の中の :ID リンク（:1a  1a:  :1a,1b,1c）。コード（` ` と ``` ```）・[名](パス) の中は除く */
data class Ref(val from: Int, val to: Int, val id: String)
object Links {
    private val ID = "[0-9]+[a-z0-9]*"
    private val RE = Regex("(?<![0-9A-Za-z])(?:[:：]($ID)(?![0-9A-Za-z])|($ID)[:：](?![0-9]))")
    private val MORE = Regex("^[,，、]($ID)(?![0-9A-Za-z])")
    private val MDLINK = Regex("!?\\[[^\\]\\n]*\\]\\([^)\\s]*\\)")
    fun codeRanges(text: String): List<IntRange> {
        val r = ArrayList<IntRange>(); var pos = 0; var open = -1
        for (line in text.split("\n")) {
            if (Regex("^\\s*(```|~~~)").containsMatchIn(line)) { if (open < 0) open = pos else { r += open..(pos + line.length); open = -1 } }
            pos += line.length + 1
        }
        if (open >= 0) r += open..text.length
        for (m in Regex("(`+)[^`\\n][^\\n]*?\\1(?!`)").findAll(text)) if (r.none { m.range.first in it }) r += m.range
        return r
    }
    fun refs(text: String): List<Ref> {
        val skip = MDLINK.findAll(text).map { it.range }.toList() + codeRanges(text)
        fun hit(a: Int, b: Int) = skip.any { a <= it.last && b > it.first }
        val out = ArrayList<Ref>(); var pos = 0
        while (pos <= text.length) {
            val m = RE.find(text, pos) ?: break
            pos = m.range.last + 1
            if (hit(m.range.first, m.range.last + 1)) continue
            val colon = m.groupValues[1].isNotEmpty()
            val id = if (colon) m.groupValues[1] else m.groupValues[2]
            val from = if (colon) m.range.first + 1 else m.range.first
            out += Ref(from, from + id.length, id)
            if (colon) { // :1a,1b のように複数
                var p = m.range.last + 1
                while (true) { val x = MORE.find(text.substring(p)) ?: break; if (hit(p, p + x.value.length)) break
                    out += Ref(p + 1, p + x.value.length, x.groupValues[1]); p += x.value.length; pos = p }
            }
        }
        return out
    }
}

// ===== ノート =====
data class Note(
    val stem: String,                 // ファイル名（拡張子なし）。作った日時 YYYYMMDDHHmmss
    val id: String?,                  // folgezettel。無ければ IDなし
    val source: String = "digital",   // digital / paper
    val created: String,              // 2026-11-08 07:35:11
    val updated: String,
    val title: String = "",
    val keywords: List<String> = emptyList(),
    val kind: String = "text",
    val body: String = "",
    val extra: Map<String, String> = emptyMap(),   // 読めなかった YAML の項目は、そのまま書き戻す
) {
    val noid get() = id == null
    val paper get() = source == "paper"
    val label get() = (if (paper) "紙 " else "") + (id ?: "")
    val heading get() = title.ifBlank { body.lineSequence().map { it.trim().trimStart('#').trim() }.firstOrNull { it.isNotEmpty() } ?: "（無題）" }
    val editable get() = kind == "text"
}

data class Diary(val date: String, val file: String, val title: String, val body: String)

object Fmt {
    private val created = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
    private val stem = SimpleDateFormat("yyyyMMddHHmmss", Locale.US)
    fun now(t: Long = System.currentTimeMillis()): String = created.format(Date(t))
    fun stemOf(t: Long): String = stem.format(Date(t))
    fun parse(s: String): Long = try { created.parse(if (s.length == 16) "$s:00" else s)!!.time } catch (e: Exception) { 0L }
    /** 日付が変わる時刻は朝 5 時（PC と同じ） */
    fun dayOf(t: Long = System.currentTimeMillis()): String {
        val c = Calendar.getInstance().apply { timeInMillis = t; add(Calendar.HOUR_OF_DAY, -5) }
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }
}

object NoteFile {
    const val BODY = "<!-- body -->\n"
    const val NAV = "\n<!-- nav -->"
    private val STEM = Regex("^\\d{14}(-\\d+)?$")
    fun isStem(s: String) = STEM.matches(s)

    private fun unquote(v: String): String {
        val t = v.trim(); if (t.startsWith("\"")) { val x = MiniJson.parse(t); if (x is String) return x }
        return t.trim('"', '\'')
    }
    private fun list(v: String): List<String> {
        val t = v.trim()
        if (t.startsWith("[")) { val x = MiniJson.parse(t); if (x is List<*>) return x.filterIsInstance<String>() }
        return t.trim('[', ']').split(',', '、').map { it.trim().trim('"', '\'') }.filter { it.isNotEmpty() }
    }
    /** YAML の前置き（--- で囲んだ部分）と、そのあとの本文 */
    fun front(text: String): Pair<Map<String, String>, String>? {
        val m = Regex("^---\\r?\\n([\\s\\S]*?)\\r?\\n---[ \\t]*(?:\\r?\\n|$)").find(text) ?: return null
        val meta = LinkedHashMap<String, String>()
        for (l in m.groupValues[1].split(Regex("\\r?\\n"))) { val i = l.indexOf(':'); if (i > 0 && !l[0].isWhitespace()) meta[l.substring(0, i).trim()] = l.substring(i + 1).trim() }
        return meta to text.substring(m.value.length)
    }
    fun mdToBody(md: String): String {
        var s = md.replace(Regex("<a id=\"c[^\"]*\"></a>"), "").replace(Regex("<span style=\"color:#c0392b\">([^<]*)</span>")) { it.groupValues[1] }
        s = Regex("\\[([^\\]\\n]+)\\]\\(([^)\\s]*)\\)").replace(s) { m ->
            val t = m.groupValues[1]; val r = Links.refs(t)
            if (r.size == 1 && r[0].from <= 1 && r[0].to >= t.length) t else m.value
        }
        return s.split("\n").joinToString("\n") { it.removeSuffix("  ") }.trimEnd('\n')
    }
    fun parse(stem: String, text: String): Note? {
        val (meta, rest) = front(text) ?: return null
        val i = rest.indexOf(BODY); val j = rest.indexOf(NAV)
        val raw = if (i >= 0) rest.substring(i + BODY.length, if (j > i) j else rest.length) else rest
        val fz = meta["folgezettel"]?.let { unquote(it) } ?: ""
        val known = setOf("folgezettel", "source", "created", "updated", "kind", "title", "keywords")
        val created = meta["created"]?.let { unquote(it) }.orEmpty()
        return Note(stem, if (Ids.isId(fz)) fz else null, if (meta["source"]?.let { unquote(it) } == "paper") "paper" else "digital",
            created, meta["updated"]?.let { unquote(it) } ?: created, meta["title"]?.let { unquote(it) }.orEmpty(),
            meta["keywords"]?.let { list(it) } ?: emptyList(), meta["kind"]?.let { unquote(it) } ?: "text", mdToBody(raw),
            meta.filterKeys { it !in known })
    }
    fun render(n: Note): String {
        val sb = StringBuilder("---\n")
        fun put(k: String, v: String) { if (v.isNotEmpty()) sb.append(k).append(": ").append(MiniJson.quote(v)).append('\n') }
        n.id?.let { put("folgezettel", it) }
        put("source", n.source); put("created", n.created); put("updated", n.updated)
        if (n.kind != "text") put("kind", n.kind)
        put("title", n.title)
        if (n.keywords.isNotEmpty()) sb.append("keywords: [").append(n.keywords.joinToString(",") { MiniJson.quote(it) }).append("]\n")
        for ((k, v) in n.extra) sb.append(k).append(": ").append(v).append('\n')
        sb.append("---\n# ").append(n.title.ifBlank { n.id ?: "未整理 ${n.created}" }).append("\n\n").append(BODY).append(n.body).append('\n').append(NAV.trimStart('\n')).append('\n')
        return sb.toString()
    }
    fun diaryParse(date: String, file: String, text: String): Diary {
        val title = Regex("^<!-- pkm-diary \\{\"title\":(\"(?:[^\"\\\\]|\\\\.)*\")").find(text)?.let { MiniJson.parse(it.groupValues[1]) as? String }
            ?: Regex("^D_\\d{4}-\\d{2}-\\d{2}-(.*)\\.md$").find(file)?.groupValues?.get(1).orEmpty()
        val i = text.indexOf(BODY); val j = text.indexOf(NAV)
        return Diary(date, file, title, mdToBody(if (i >= 0) text.substring(i + BODY.length, if (j > i) j else text.length) else text))
    }
    fun diaryRender(d: Diary) = "<!-- pkm-diary {\"title\":${MiniJson.quote(d.title)}} -->\n# ${d.date}${if (d.title.isNotEmpty()) "-" + d.title else ""}\n\n$BODY${d.body}\n${NAV.trimStart('\n')}\n"
}

/** 端末の中の vault（PC と同じ平らなフォルダ）。読み書きと、ノートを作る・IDを付ける・消す */
class Vault(val dir: File) {
    val lock = Any()   // 同期と同時に書かないように
    init { dir.mkdirs() }
    var notes: List<Note> = emptyList(); private set
    var diaries: List<Diary> = emptyList(); private set
    private val used = HashSet<String>()

    fun load() {
        val ns = ArrayList<Note>(); val ds = ArrayList<Diary>(); used.clear()
        val seen = HashSet<String>()
        for (f in (dir.listFiles() ?: emptyArray()).filter { it.isFile }.sortedBy { it.name }) {
            Regex("^(\\d{14})(?:\\D|$)").find(f.name)?.let { used += it.groupValues[1] }
            val m = Regex("^(\\d{14}(?:-\\d+)?)\\.md$").find(f.name)
            if (m != null) {
                val n = NoteFile.parse(m.groupValues[1], f.readText()) ?: continue
                // 同じ ID が重なったものは IDなし にして残す（消えない）
                val key = n.source + ":" + n.id
                ns += if (n.id != null && !seen.add(key)) n.copy(id = null) else n
                continue
            }
            val d = Regex("^D_(\\d{4}-\\d{2}-\\d{2})(?:-.*)?\\.md$").find(f.name)
            if (d != null) ds += NoteFile.diaryParse(d.groupValues[1], f.name, f.readText())
        }
        notes = ns; diaries = ds.sortedByDescending { it.date }
    }
    fun get(id: String, paper: Boolean = false) = notes.firstOrNull { it.id == id && it.paper == paper }
    fun byStem(stem: String) = notes.firstOrNull { it.stem == stem }
    fun freeStem(t: Long = System.currentTimeMillis()): String {
        var x = t; while (true) { val s = Fmt.stemOf(x); if (s !in used && !File(dir, "$s.md").exists()) { used += s; return s }; x += 1000 }
    }
    fun freeId(base: String, paper: Boolean, pending: Set<String> = emptySet()): String { var id = base; while (get(id, paper) != null || id in pending) id = Ids.sibling(id); return id }

    private fun write(n: Note) { synchronized(lock) { File(dir, n.stem + ".md").writeText(NoteFile.render(n)) } }
    fun save(n: Note): Note {
        val x = n.copy(updated = Fmt.now()); write(x)
        notes = (notes.filter { it.stem != n.stem } + x); return x
    }
    /** 新しいノート。id が null なら IDなし */
    fun create(id: String?, paper: Boolean = false, body: String = "", keywords: List<String> = emptyList()): Note {
        val now = Fmt.now()
        return save(Note(freeStem(), id, if (paper) "paper" else "digital", now, now, "", keywords, "text", body))
    }
    fun delete(n: Note) {
        val f = File(dir, n.stem + ".md"); if (!f.exists()) return
        val t = File(dir, ".trash"); t.mkdirs(); f.renameTo(File(t, "${System.currentTimeMillis()}-${f.name}"))
        notes = notes.filter { it.stem != n.stem }
    }
    /** IDを付け替える（ファイル名は日時のまま）。使えない ID・重なる ID は null */
    fun setId(n: Note, id: String?): Note? {
        if (id != null && (!Ids.isId(id) || notes.any { it.stem != n.stem && it.id == id && it.paper == n.paper })) return null
        return save(n.copy(id = id))
    }

    fun parentOf(n: Note): Note? = n.id?.let { id -> Ids.parentIn(id) { get(it, n.paper) != null }?.let { get(it, n.paper) } }
    fun childrenOf(n: Note): List<Note> = n.id?.let { id -> notes.filter { it.paper == n.paper && it.id != null && Ids.parentIn(it.id) { x -> get(x, n.paper) != null } == id }.sortedWith(compareBy(Ids.cmp) { it.id!! }) } ?: emptyList()
    fun backlinks(n: Note): List<Note> = n.id?.let { id -> notes.filter { it.stem != n.stem && it.paper == n.paper && Links.refs(it.body).any { r -> r.id == id } } } ?: emptyList()

    // ===== 日記 =====
    fun diary(date: String) = diaries.firstOrNull { it.date == date }
    fun saveDiary(d: Diary): Diary {
        val file = if (d.file.isNotEmpty()) d.file else "D_${d.date}${if (d.title.isNotEmpty()) "-" + d.title.replace(Regex("[\\\\/:*?\"<>|#%]"), "_") else ""}.md"
        val x = d.copy(file = file); synchronized(lock) { File(dir, file).writeText(NoteFile.diaryRender(x)) }
        diaries = (diaries.filter { it.date != d.date } + x).sortedByDescending { it.date }; return x
    }

    // ===== 並べ替え・探す =====
    enum class Sort { FZ, CREATED, UPDATED }
    fun sorted(list: List<Note>, by: Sort, asc: Boolean): List<Note> {
        val base = when (by) {
            Sort.FZ -> list.sortedWith(compareBy(Ids.cmp) { it.id ?: "~" + it.stem })
            Sort.CREATED -> list.sortedBy { it.created }
            Sort.UPDATED -> list.sortedBy { it.updated }
        }
        return if (asc) base else base.reversed()
    }
    fun search(q: String): List<Note> {
        val k = q.trim().lowercase(Locale.ROOT); if (k.isEmpty()) return notes
        return notes.filter { listOf(it.id.orEmpty(), it.title, it.body, it.keywords.joinToString(" ")).joinToString("\n").lowercase(Locale.ROOT).contains(k) }
    }
    fun keywords(): List<Pair<String, List<Note>>> =
        notes.flatMap { n -> n.keywords.map { it to n } }.groupBy({ it.first }, { it.second }).toList().sortedBy { it.first }
}
