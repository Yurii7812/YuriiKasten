package net.yurii.kasten

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 書いた 1 件。Gnosis では 1 件 = 1 ノート（日記トピックは日記の本文に時刻つきで入る）。 */
@androidx.compose.runtime.Immutable
data class Entry(
    val id: String,              // Gnosis のファイル名（拡張子なし）。yyMMddHHmmss（重なれば -2, -3 …）
    val created: Long,
    val topic: String,
    val text: String,
    val images: List<String> = emptyList(),   // アプリの images/ の中のファイル名
    val parent: String? = null,  // Branch の親（スマホで書いたものの id）
    val contexts: List<String> = emptyList(), // Context（スマホで書いたものの id）
    val exported: Boolean = false,
    val edited: Long = 0,
    val noTime: Boolean = false, // 日付を指定して「時刻を入れない」で書いた（PC では時刻を付けずに入る）
    val ups: List<String> = emptyList(),   // 上のトピック（いくつでも。PC のチャットメモと同じ。トピック＝下）
    val pcId: String? = null,    // PC のチャットメモから来たメモの、PC での id（共有。直したり消したりすると、次の USB で PC にも反映される）
)

data class Settings(
    val alarmOn: Boolean = false,
    val alarmMinutes: Int = 60,
    val fromHour: Int = 9,
    val toHour: Int = 23,
    val topics: List<String> = listOf(DIARY),
    val lastTopic: String = ALL,
    val recentTopics: List<String> = emptyList(), // 表示・書き込み先を最後に使った順（APKの横スクロール）
    val writeTopic: String = UNASSIGNED,                 // 全部表示から書くときの書き込み先（前に使ったトピックを引き継ぐ）
    val writeUps: List<String> = emptyList(),           // 現在開いている所属トピックの上位設定
    val writeUpsByTopic: Map<String, List<String>> = emptyMap(), // 所属トピックごとの前回選択
    val topicModes: Map<String, TopicMode> = emptyMap(),
    val ringSeconds: Int = 0,        // アラームを鳴らし続ける長さ（秒）。0 は 1 回だけ鳴らす
    val expandAll: Boolean = false,  // 長いメモを「続きを見る」を押さずに全部見せる
    val folgeView: Boolean = false,  // Folgezettel 表示（Branch の親子を木で見せる）。false は時系列
    val writtenStamp: Boolean = false, // 日付を指定して書いたとき、書いている時刻を入れる（本文の最初に書いた日も入れる）
)

/**
 * トピックの取り込み方（日記以外）。single = PC に取り込むとこのトピックの 1 つのノートに追記する
 * （1 件 = 1 ノートにしない）。stamp = 追記するとき時刻を付け、日が替わったら日付の見出しを入れる。
 * record = 時系列記録（PC の :GnosisRecordNew と同じ。日記のように、その日のノート「2026-10-19-MO-夢」に時刻つきで入る）。
 * single と record は同時に使わない（record が優先）。
 */
data class TopicMode(val single: Boolean = false, val stamp: Boolean = true, val record: Boolean = false)

const val DIARY = "日記"
const val ALL = "__all__"
const val UNASSIGNED = ""
fun normalizedTopic(topic: String) = if (topic == "メモ") UNASSIGNED else topic
fun topicLabel(topic: String) = when (topic) {
    ALL -> "全部"
    UNASSIGNED -> "未所属"
    else -> topic
}
fun visibleEntries(entries: List<Entry>, topic: String) = entries.filter { topic == ALL || it.topic == topic }
fun writingTopic(topic: String) = if (topic == ALL) UNASSIGNED else topic

/** Folgezettel 表示の 1 行: メモ・番号（1, 1a, 1a1 …）・深さ・子があるか。 */
data class FolgeRow(val entry: Entry, val label: String, val depth: Int, val hasChildren: Boolean)

/** 1→a, 26→z, 27→aa（Gnosis の Folgezettel と同じ数え方）。 */
fun folgeLetters(n: Int): String {
    var x = n; val sb = StringBuilder()
    while (x > 0) { x -= 1; sb.insert(0, 'a' + x % 26); x /= 26 }
    return sb.toString()
}

/**
 * Branch の親子（parent）を木にして、上から順に並べる。親が list に無いメモは最上位（古い順に 1, 2, 3 …）。
 * 子は古い順に、数字で終わる番号には a, b …、文字で終わる番号には 1, 2 … を付ける（1 → 1a → 1a1 → 1a1a）。
 * collapsed にあるメモの子孫は並べない（そのメモ自体は並べる）。
 */
fun folgeRows(list: List<Entry>, collapsed: Set<String> = emptySet()): List<FolgeRow> {
    val ids = list.map { it.id }.toSet()
    val kids = list.filter { it.parent != null && it.parent in ids && it.parent != it.id }.groupBy { it.parent!! }
    val roots = list.filter { it.parent == null || it.parent !in ids || it.parent == it.id }.sortedBy { it.created }
    val out = ArrayList<FolgeRow>()
    val seen = HashSet<String>()
    fun walk(e: Entry, label: String, depth: Int) {
        if (!seen.add(e.id)) return
        val cs = kids[e.id].orEmpty().sortedBy { it.created }
        out.add(FolgeRow(e, label, depth, cs.isNotEmpty()))
        if (e.id in collapsed) return
        val numeric = label.last().isDigit()
        cs.forEachIndexed { i, c -> walk(c, label + if (numeric) folgeLetters(i + 1) else (i + 1).toString(), depth + 1) }
    }
    roots.forEachIndexed { i, r -> walk(r, (i + 1).toString(), 0) }
    // 循環などで最上位からたどれなかったメモも落とさない（折りたたんで隠したものは除く）
    val reach = HashSet<String>()
    fun mark(id: String) { if (reach.add(id)) kids[id].orEmpty().forEach { mark(it.id) } }
    roots.forEach { mark(it.id) }
    var n = roots.size
    list.filter { it.id !in reach }.sortedBy { it.created }.forEach { if (it.id !in reach) { mark(it.id); n += 1; walk(it, n.toString(), 0) } }
    return out
}

/** 子を持つメモの id（全部折りたたむときに使う）。 */
fun folgeParents(list: List<Entry>): Set<String> {
    val ids = list.map { it.id }.toSet()
    return list.mapNotNull { it.parent }.filter { it in ids }.toSet()
}

/** トピックの名前を変える（メモ・トピックの一覧・取り込み方・最後に開いたトピック）。日記と、使えない名前・ある名前には変えない。 */
fun renameTopic(entries: List<Entry>, settings: Settings, from: String, to: String): Pair<List<Entry>, Settings>? {
    val t = normalizedTopic(to.trim())
    if (from == DIARY || from == UNASSIGNED || from == ALL || t.isEmpty() || t == from) return null
    if (t in setOf(ALL, DIARY, "全部", "全部表示", "未所属", "トピック未選択", "その他")) return null
    if (t in settings.topics || entries.any { it.topic == t }) return null
    val now = System.currentTimeMillis()
    val es = entries.map { if (it.topic == from) it.copy(topic = t, edited = now, exported = false) else it }
    val modes = settings.topicModes.mapKeys { (k, _) -> if (k == from) t else k }
    val topics = settings.topics.map { if (it == from) t else it }.let { if (from !in settings.topics) it + t else it }
    val prefs = settings.writeUpsByTopic.mapKeys { (k, _) -> if (k == from) t else k }
        .mapValues { (k, v) -> v.map { if (it == from) t else it }.distinct().filter { it != k } }
    return es to settings.copy(topics = topics, topicModes = modes,
        lastTopic = if (settings.lastTopic == from) t else settings.lastTopic,
        writeTopic = if (settings.writeTopic == from) t else settings.writeTopic,
        writeUps = settings.writeUps.map { if (it == from) t else it }.distinct().filter { it != (if (settings.writeTopic == from) t else settings.writeTopic) },
        writeUpsByTopic = prefs)
}

/**
 * 日付を指定して書いたときの本文。writtenStamp（書いている時刻を入れる）がオンなら、PC では時刻（HH:MM）が付くが、
 * それは書いている日の時刻なので、本文の最初に書いた日（「（2026-10-20 に記入）」）を入れる。オフなら本文のまま
 * （時刻も付かない）。
 */
fun backdatedText(text: String, writtenStamp: Boolean, writtenAt: Long): String =
    if (!writtenStamp) text
    else "（" + java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.JAPAN).format(java.util.Date(writtenAt)) + " に記入）" + text

/** 日付を指定して書くメモの日時: その日（0 時）に、書いている時刻を足す（並びとファイル名が重なりにくいように）。 */
fun backdatedTime(day: Long, now: Long): Long {
    val c = java.util.Calendar.getInstance().apply { timeInMillis = now }
    val ms = ((c.get(java.util.Calendar.HOUR_OF_DAY) * 60L + c.get(java.util.Calendar.MINUTE)) * 60L + c.get(java.util.Calendar.SECOND)) * 1000L
    return day + ms
}

/** トピックを消す。このトピックのメモは未所属へ移す（メモは消さない）。日記・全部・未所属は消せない。 */
fun deleteTopic(entries: List<Entry>, settings: Settings, name: String): Pair<List<Entry>, Settings>? {
    if (name == DIARY || name == UNASSIGNED || name == ALL) return null
    val now = System.currentTimeMillis()
    val es = entries.map { if (it.topic == name) it.copy(topic = UNASSIGNED, edited = now, exported = false) else it }
    return es to settings.copy(topics = settings.topics.filter { it != name }, topicModes = settings.topicModes - name,
        lastTopic = if (settings.lastTopic == name) ALL else settings.lastTopic,
        writeTopic = if (settings.writeTopic == name) UNASSIGNED else settings.writeTopic,
        writeUps = settings.writeUps.filter { it != name },
        writeUpsByTopic = (settings.writeUpsByTopic - name).mapValues { (_, v) -> v.filter { it != name } })
}

/** 取り込み済みメモを消すとき、その削除で空になる通常トピックだけを片付ける。 */
fun settingsAfterImportedRemoval(entries: List<Entry>, settings: Settings, removed: Set<String>, records: Set<String> = emptySet()): Settings {
    val occupied = entries.filter { it.id !in removed }.map { it.topic }.toSet()
    val gone = entries.filter { it.id in removed }.map { it.topic }.toSet().filter {
        it !in occupied && it !in records && it !in setOf(DIARY, ALL, UNASSIGNED) && settings.topicModes[it]?.record != true
    }.toSet()
    return settings.copy(topics = settings.topics.filter { it !in gone }, topicModes = settings.topicModes - gone,
        lastTopic = if (settings.lastTopic in gone) ALL else settings.lastTopic,
        writeTopic = if (settings.writeTopic in gone) UNASSIGNED else settings.writeTopic,
        writeUps = settings.writeUps.filter { it !in gone },
        writeUpsByTopic = settings.writeUpsByTopic.filterKeys { it !in gone }.mapValues { (_, v) -> v.filter { it !in gone } })
}

/** 並び list の中で a から b まで（どちら向きでも）の id。範囲選択に使う。 */
fun rangeIds(list: List<String>, a: String, b: String): List<String> {
    val i = list.indexOf(a); val j = list.indexOf(b)
    if (i < 0 || j < 0) return listOf(b)
    return list.subList(minOf(i, j), maxOf(i, j) + 1)
}

/** メモの中の見出し（# で始まる行）の文字。アウトライン引用で選ぶ。 */
fun memoHeadings(text: String): List<String> =
    text.lineSequence().mapNotNull { Regex("^#{1,6}\\s+(.+?)\\s*$").find(it)?.groupValues?.get(1) }
        .map { it.replace("[", "").replace("]", "").replace(")", "") }.filter { it.isNotBlank() }.toList()

/** 検索用に揃える: 全角・半角（NFKC）、大文字・小文字、カタカナ→ひらがな。 */
fun searchKey(s: String): String {
    val n = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFKC).lowercase()
    val b = StringBuilder(n.length)
    for (c in n) b.append(if (c in 'ァ'..'ヶ') c - 0x60 else c)
    return b.toString()
}

/** 空白（全角・半角）で区切った語をすべて含むか（順番は問わない）。空の検索はすべてに当たる。 */
fun matchesQuery(text: String, query: String): Boolean {
    val terms = searchKey(query).split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (terms.isEmpty()) return true
    val t = searchKey(text)
    return terms.all { it in t }
}

/** PC のチャットメモ 1 件（PC が USB で pc_memos.json に書く）。 */
data class PcMemo(val id: String, val topic: String, val t: Long, val text: String, val edited: Long, val ups: List<String> = emptyList())
/** PC の日・時系列記録の日のノート（読むだけ）。 */
data class PcDay(val kind: String, val date: String, val body: String)

/**
 * PC のメモをスマホのメモに合わせる（メモは PC とスマホで共有）。
 * PC に無いもの（PC で消した）は、スマホからも消す。PC にあって無いものは足す（取り込み済みの扱い）。
 * 両方にあるものは、あとから直した方が勝つ（edited の新しい方）。スマホで消したもの（deleted）は足し直さない。
 */
fun mergePcMemos(entries: List<Entry>, memos: List<PcMemo>, deleted: Set<String>): List<Entry> {
    val ids = memos.map { it.id }.toSet()
    val out = entries.filter { it.pcId == null || it.pcId in ids }.toMutableList()
    val byPc = out.filter { it.pcId != null }.associateBy { it.pcId!! }
    for (m in memos) {
        if (m.id in deleted) continue
        val ex = byPc[m.id]
        if (ex == null) out.add(Entry(id = "pc-" + m.id, created = m.t, topic = normalizedTopic(m.topic.ifEmpty { UNASSIGNED }), text = m.text, edited = m.edited, pcId = m.id, ups = m.ups))
        else if (m.edited > ex.edited) out[out.indexOf(ex)] = ex.copy(topic = normalizedTopic(m.topic.ifEmpty { UNASSIGNED }), text = m.text, edited = m.edited, ups = m.ups)
    }
    return out
}

/**
 * データはアプリの中だけ（entries.json と images/）。共有フォルダには置かない。
 * PC の Gnosis が USB（adb の run-as）で直接読み、取り込んだ id を imported.json に書き戻す。
 */
class Store(private val ctx: Context) {
    private val file get() = File(ctx.filesDir, "entries.json")
    private val settingsFile get() = File(ctx.filesDir, "settings.json")
    val imageDir: File by lazy { File(ctx.filesDir, "images").apply { mkdirs() } }

    fun load(): List<Entry> {
        if (!file.exists()) return emptyList()
        val arr = JSONArray(file.readText())
        return (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }
    }

    fun save(list: List<Entry>) {
        val arr = JSONArray()
        list.forEach { arr.put(toJson(it)) }
        val tmp = File(ctx.filesDir, "entries.json.tmp")
        tmp.writeText(arr.toString())
        check(tmp.renameTo(file)) { "メモを保存できませんでした" }
    }

    /** PC の Gnosis が取り込んだ id（PC が書き戻す）。 */
    fun importedIds(entries: List<Entry>? = null): Set<String> {
        val f = File(ctx.filesDir, "imported.json")
        if (!f.exists()) return (entries ?: load()).filter { it.pcId != null }.map { it.id }.toSet()
        return try {
            val imported = JSONObject(f.readText()).optJSONArray("entries") ?: JSONArray()
            val current = (entries ?: load()).associateBy { it.id }
            val pcOnes = current.values.filter { it.pcId != null }.map { it.id }.toSet()   // PC と共有しているメモは、取り込み済みの扱い
            pcOnes + (0 until imported.length()).mapNotNull { i ->
                val old = fromJson(imported.getJSONObject(i))
                val now = current[old.id]
                if (now != null && old.copy(edited = 0, exported = false) == now.copy(edited = 0, exported = false)) old.id else null
            }.toSet()
        } catch (e: Exception) { emptySet() }
    }

    fun loadSettings(): Settings {
        if (!settingsFile.exists()) return Settings()
        val o = JSONObject(settingsFile.readText())
        val topics = o.optJSONArray("topics")?.let { a -> (0 until a.length()).map { a.getString(it) } }
        val last = o.optString("lastTopic", ALL).let { if (it == ALL) ALL else normalizedTopic(it) }
        val oldTopic = normalizedTopic(o.optString("writeTopic", UNASSIGNED))
        val oldUps = o.optJSONArray("writeUps")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
        val rawPrefs = o.optJSONObject("writeUpsByTopic")?.let { prefs ->
            prefs.keys().asSequence().associateWith { key ->
                prefs.optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getString(it) }.distinct().filter { it.isNotEmpty() && it != key } } ?: emptyList()
            }
        } ?: emptyMap()
        // 旧版の共有設定は最後のトピックだけに移行し、他トピックへは引き継がない。
        val byTopic = if (rawPrefs.isEmpty() && oldUps.isNotEmpty()) mapOf(oldTopic to oldUps.filter { it != oldTopic }.distinct()) else rawPrefs
        val current = if (last == ALL) UNASSIGNED else last
        return Settings(
            alarmOn = o.optBoolean("alarmOn", false),
            alarmMinutes = o.optInt("alarmMinutes", 60).coerceAtLeast(1),
            fromHour = o.optInt("fromHour", 9),
            toHour = o.optInt("toHour", 23),
            topics = (listOf(DIARY) + (topics ?: emptyList()).map(::normalizedTopic)).filter { it.isNotEmpty() && it != ALL }.distinct(),
            lastTopic = last,
            recentTopics = o.optJSONArray("recentTopics")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList(),
            writeTopic = if (last == ALL) UNASSIGNED else last,
            writeUps = byTopic[current].orEmpty(),
            writeUpsByTopic = byTopic,
            topicModes = o.optJSONObject("topicModes")?.let { m ->
                m.keys().asSequence().filter { it.isNotEmpty() && it != DIARY }.associateWith { k ->
                    val t = m.getJSONObject(k); TopicMode(t.optBoolean("single", false), t.optBoolean("stamp", true), t.optBoolean("record", false))
                }
            } ?: emptyMap(),
            ringSeconds = o.optInt("ringSeconds", 0).coerceIn(0, 600),
            expandAll = o.optBoolean("expandAll", false),
            folgeView = o.optBoolean("folgeView", false),
            writtenStamp = o.optBoolean("writtenStamp", false),
        )
    }

    /** PC の Gnosis にある時系列記録の名前（PC が \M のときに files/records.json へ書く）。表記揺れを防ぐため、ここから選ぶ。 */
    fun loadRecords(): List<String> {
        val f = File(ctx.filesDir, "records.json")
        if (!f.exists()) return emptyList()
        return try {
            val a = JSONObject(f.readText()).optJSONArray("records") ?: return emptyList()
            (0 until a.length()).map { a.getString(it) }.filter { it.isNotBlank() && it != DIARY }.distinct()
        } catch (e: Exception) { emptyList() }
    }

    /** PC のチャットメモにあるトピック名（USB で取り込むたびに、PC が records.json の topics へ書く）。スマホにも同じトピックが並ぶ。 */
    fun loadPcTopics(): List<String> {
        val f = File(ctx.filesDir, "records.json")
        if (!f.exists()) return emptyList()
        return try {
            val a = JSONObject(f.readText()).optJSONArray("topics") ?: return emptyList()
            (0 until a.length()).map { a.getString(it) }.filter { it.isNotBlank() && it != DIARY }.distinct()
        } catch (e: Exception) { emptyList() }
    }

    /** PC のチャットメモ・日のノート（USB で取り込むたびに、PC が files/pc_memos.json に全部書く）。 */
    fun loadPc(): Pair<List<PcMemo>, List<PcDay>> {
        val f = File(ctx.filesDir, "pc_memos.json")
        if (!f.exists()) return Pair(emptyList(), emptyList())
        return try {
            val o = JSONObject(f.readText())
            val a = o.optJSONArray("memos") ?: JSONArray(); val d = o.optJSONArray("days") ?: JSONArray()
            Pair((0 until a.length()).map { val m = a.getJSONObject(it); PcMemo(m.getString("id"), m.optString("topic", ""), m.optLong("t"), m.optString("text", ""), m.optLong("edited", 0), m.optJSONArray("ups")?.let { u -> (0 until u.length()).map { u.getString(it) } } ?: emptyList()) },
                (0 until d.length()).map { val x = d.getJSONObject(it); PcDay(x.optString("kind", DIARY), x.optString("date", ""), x.optString("body", "")) })
        } catch (e: Exception) { Pair(emptyList(), emptyList()) }
    }
    /** PC で消した、スマホで書いたメモの id（PC が pc_memos.json の removed に書く）。スマホからも消す。 */
    fun loadPcRemoved(): Set<String> {
        val f = File(ctx.filesDir, "pc_memos.json"); if (!f.exists()) return emptySet()
        return try { val a = JSONObject(f.readText()).optJSONArray("removed") ?: return emptySet(); (0 until a.length()).map { a.getString(it) }.toSet() } catch (e: Exception) { emptySet() }
    }
    private val pcDeletedFile get() = File(ctx.filesDir, "pc_deleted.json")
    fun loadPcDeleted(): Set<String> = try {
        val a = JSONObject(pcDeletedFile.readText()).optJSONArray("ids") ?: JSONArray(); (0 until a.length()).map { a.getString(it) }.toSet()
    } catch (e: Exception) { emptySet() }
    /** スマホで消した PC のメモ。次の USB で PC にも反映する（PC がメモを消したら、ここからも外す）。 */
    fun savePcDeleted(ids: Set<String>) { pcDeletedFile.writeText(JSONObject().put("ids", JSONArray(ids.toList())).toString()) }
    /** PC のメモに合わせた一覧（変わらなければ同じ）。 */
    fun syncPc(entries: List<Entry>): List<Entry> {
        val (memos, _) = loadPc(); val gone = loadPcRemoved()
        if (memos.isEmpty() && gone.isEmpty() && entries.none { it.pcId != null }) return entries
        val deleted = loadPcDeleted(); val live = memos.map { it.id }.toSet()
        if (deleted.any { it !in live }) savePcDeleted(deleted.filter { it in live }.toSet())
        return mergePcMemos(entries, memos, deleted).filter { it.id !in gone }   // PC で消したメモは、スマホからも消える
    }

    fun saveSettings(s: Settings) {
        val o = JSONObject()
        o.put("alarmOn", s.alarmOn); o.put("alarmMinutes", s.alarmMinutes)
        o.put("fromHour", s.fromHour); o.put("toHour", s.toHour)
        o.put("topics", JSONArray(s.topics)); o.put("lastTopic", s.lastTopic); o.put("recentTopics", JSONArray(s.recentTopics)); o.put("writeTopic", s.writeTopic); o.put("writeUps", JSONArray(s.writeUps))
        val upperPrefs = JSONObject()
        s.writeUpsByTopic.forEach { (topic, uppers) -> upperPrefs.put(topic, JSONArray(uppers)) }
        o.put("writeUpsByTopic", upperPrefs)
        o.put("ringSeconds", s.ringSeconds); o.put("expandAll", s.expandAll)
        o.put("folgeView", s.folgeView); o.put("writtenStamp", s.writtenStamp)
        // PC の取り込み（\M）もこのファイルを読む（topicModes）
        val modes = JSONObject()
        s.topicModes.forEach { (k, v) -> modes.put(k, JSONObject().put("single", v.single).put("stamp", v.stamp).put("record", v.record)) }
        o.put("topicModes", modes)
        settingsFile.writeText(o.toString())
    }

    companion object {
        private val idFmt = SimpleDateFormat("yyMMddHHmmss", Locale.US)

        fun newId(time: Long, existing: Collection<Entry>): String {
            val base = idFmt.format(Date(time))
            val used = existing.map { it.id }.toSet()
            if (base !in used) return base
            var n = 2
            while ("$base-$n" in used) n++
            return "$base-$n"
        }

        fun toJson(e: Entry): JSONObject = JSONObject().apply {
            put("id", e.id); put("created", e.created); put("topic", e.topic); put("text", e.text)
            put("images", JSONArray(e.images)); put("parent", e.parent ?: JSONObject.NULL)
            put("contexts", JSONArray(e.contexts)); put("exported", e.exported); put("edited", e.edited)
            if (e.noTime) put("notime", true)
            if (e.pcId != null) put("pcId", e.pcId)
            if (e.ups.isNotEmpty()) put("ups", JSONArray(e.ups))
        }

        private fun parentOf(o: JSONObject): String? = if (o.isNull("parent")) null else o.optString("parent").ifEmpty { null }   // 昔の「Branch の親」は、返信先に移す
        fun fromJson(o: JSONObject): Entry {
            fun strs(k: String) = o.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
            return Entry(
                id = o.getString("id"), created = o.getLong("created"), topic = normalizedTopic(o.optString("topic", UNASSIGNED)),
                text = o.optString("text", ""), images = strs("images"),
                parent = null,
                contexts = (strs("contexts") + listOfNotNull(parentOf(o))).distinct(), exported = o.optBoolean("exported", false), edited = o.optLong("edited", 0),
                noTime = o.optBoolean("notime", false), pcId = o.optString("pcId", "").ifEmpty { null }, ups = strs("ups"),
            )
        }
    }
}
