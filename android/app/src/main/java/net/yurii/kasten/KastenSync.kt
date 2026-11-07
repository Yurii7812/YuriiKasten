package net.yurii.kasten

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * YuriiKasten（PC のアプリ）への受け渡し。スマホで書いたメモを、ラズパイの同期サーバーに「未整理のノート」として置く。
 * PC の YuriiKasten は、サーバーと同期して、そのノートを「未整理」に出す。
 * ファイル名は、メモの作成時刻から決める（D_u20261107-143521.md）ので、何度送っても同じノートになる。
 */
object Kasten {
    private fun stemFmt() = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)
    private fun createdFmt() = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US)

    /** u20261107-143521（同じ秒に 2 件あれば、メモの id の末尾の -2 を引き継ぐ） */
    fun stem(e: Entry): String {
        val base = "u" + stemFmt().format(Date(e.created))
        val suffix = Regex("-(\\d+)$").find(e.id)?.groupValues?.get(1)
        return if (suffix != null) "$base-$suffix" else base
    }
    fun fileName(e: Entry) = "D_${stem(e)}.md"
    fun imageName(e: Entry, i: Int, original: String): String {
        val ext = original.substringAfterLast('.', "jpg").lowercase(Locale.US).filter { it.isLetterOrDigit() }.ifEmpty { "jpg" }
        return "kasten-${stem(e).removePrefix("u")}-${i + 1}.$ext"
    }

    /** ノートのファイルの中身。文脈・分岐元は、本文の前にリンクの行として入る（ID が先頭、あとに本文） */
    fun render(e: Entry, all: Map<String, Entry>, imageNames: List<String> = emptyList()): String {
        val meta = """{"created":"${createdFmt().format(Date(e.created))}","keywords":[],"kind":"text","title":""}"""   // 日時には引用符が入らない
        fun link(label: String, id: String): String? = all[id]?.let { "[$label](${fileName(it)})" }
        val head = ArrayList<String>()
        e.parent?.let { p -> link("分岐元", p)?.let { head += it } }
        e.contexts.forEach { c -> link("文脈", c)?.let { head += it } }
        // 本文の中の [表示名](memo:ID) は、取り込んだノートへのリンクにする
        val text = Regex("\\[([^\\]\\n]*)\\]\\(memo:([^)\\s]+)\\)").replace(e.text) { m ->
            val t = all[m.groupValues[2]]; if (t != null) "[${m.groupValues[1]}](${fileName(t)})" else m.groupValues[1]
        }
        val imgs = imageNames.map { "![]($it)" }
        val body = (listOf(head.joinToString("\n")).filter { it.isNotEmpty() } + listOf(text.trim()).filter { it.isNotEmpty() } + listOf(imgs.joinToString("\n")).filter { it.isNotEmpty() }).joinToString("\n\n")
        return "<!-- pkm $meta -->\n\n<!-- body -->\n$body\n<!-- nav -->\n"
    }
}

/** ラズパイの同期サーバーへ送る（HTTP）。メインスレッドでは呼ばない。 */
class KastenServer(url: String, private val token: String) {
    private val base = url.trim().trimEnd('/')

    private fun open(path: String, method: String): HttpURLConnection {
        val c = URL(base + path).openConnection() as HttpURLConnection
        c.requestMethod = method; c.connectTimeout = 8000; c.readTimeout = 20000
        c.setRequestProperty("Authorization", "Bearer $token"); return c
    }
    private fun enc(n: String) = URLEncoder.encode(n, "UTF-8").replace("+", "%20")

    /** サーバーに入れるか確かめる（件数を返す） */
    fun check(): Int {
        val c = open("/api/files", "GET")
        if (c.responseCode == 401) throw IllegalStateException("合言葉が違います")
        if (c.responseCode != 200) throw IllegalStateException("サーバーに入れません (${c.responseCode})")
        return org.json.JSONArray(c.inputStream.bufferedReader().readText()).length()
    }
    fun put(name: String, bytes: ByteArray) {
        val c = open("/api/file/" + enc(name), "PUT"); c.doOutput = true
        c.setFixedLengthStreamingMode(bytes.size); c.outputStream.use { it.write(bytes) }
        if (c.responseCode != 200) throw IllegalStateException("$name を送れません (${c.responseCode})")
    }

    /** まだ送っていないメモ（exported = false）を送る。送れた id を返す */
    fun push(entries: List<Entry>, imageBytes: (String) -> ByteArray?): List<String> {
        val all = entries.associateBy { it.id }
        val done = ArrayList<String>()
        for (e in entries.filter { !it.exported }) {
            val names = ArrayList<String>()
            e.images.forEachIndexed { i, img -> imageBytes(img)?.let { b -> val n = Kasten.imageName(e, i, img); put(n, b); names += n } }
            put(Kasten.fileName(e), Kasten.render(e, all, names).toByteArray(Charsets.UTF_8))
            done += e.id
        }
        return done
    }
}
