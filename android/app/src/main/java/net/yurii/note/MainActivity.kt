package net.yurii.note

import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.platform.ViewConfiguration
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import android.widget.Toast
import androidx.core.content.FileProvider
import android.os.Build
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import androidx.core.app.NotificationManagerCompat
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class IncomingShare(val text: String, val uris: List<Uri>)

@Suppress("DEPRECATION")
private fun readIncomingShare(intent: Intent?): IncomingShare? {
    if (intent == null || intent.action !in listOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) return null
    val text = listOfNotNull(intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
        .filter { it.isNotBlank() }.distinct().joinToString("\n")
    val streams = mutableListOf<Uri>()
    intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let { streams.add(it) }
    intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { streams.addAll(it) }
    intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { streams.add(it) } }
    val files = streams.distinct()
    return if (text.isBlank() && files.isEmpty()) null else IncomingShare(text, files)
}

private fun isPicture(name: String) = listOf(".png",".jpg",".jpeg",".gif",".webp",".bmp",".avif").any { name.endsWith(it, true) }
private fun openSharedFile(ctx: android.content.Context, store: Store, name: String) {
    try {
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", File(store.imageDir,name))
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"
        ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    } catch (e: Exception) {
        Toast.makeText(ctx,"ファイルを開けませんでした",Toast.LENGTH_SHORT).show()
    }
}

class MainActivity : ComponentActivity() {
    private val promptState = mutableStateOf(false)
    private val incomingShare = mutableStateOf<IncomingShare?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(statusBarStyle = androidx.activity.SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = androidx.activity.SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT))
        promptState.value = intent?.getBooleanExtra(Alarm.EXTRA_PROMPT, false) == true
        incomingShare.value = readIncomingShare(intent)
        setContent {
            // 長押しを短めに（標準は約 0.5 秒。メモの長押しが遅く感じるため）
            val vc = LocalViewConfiguration.current
            val quick = remember(vc) { object : ViewConfiguration by vc { override val longPressTimeoutMillis: Long get() = 280L } }
            CompositionLocalProvider(LocalViewConfiguration provides quick) {
                MaterialTheme(colorScheme = YuriiNoteColors) {
                    Surface(Modifier.fillMaxSize()) { CaptureScreen(Store(this), promptState, incomingShare) }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        incomingShare.value = readIncomingShare(intent)
        if (intent.getBooleanExtra(Alarm.EXTRA_PROMPT, false)) promptState.value = true
    }

    override fun onResume() {
        super.onResume()
        if (Alarm.takePrompt(this)) promptState.value = true
    }
}

/** ライトテーマ（PC の YuriiNote と同じ、白地に青）。文字は真っ黒にせず、背景との差は十分に取る。 */
private val YuriiNoteColors = lightColorScheme(
    primary = Color(0xFF3B5BDB), onPrimary = Color.White,
    primaryContainer = Color(0xFFE3E9FF), onPrimaryContainer = Color(0xFF1E2F7A),
    secondary = Color(0xFFB7791F), onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFF1D6), onSecondaryContainer = Color(0xFF5A3A00),
    tertiary = Color(0xFF2F9E44), onTertiary = Color.White,
    background = Color.White, onBackground = Color(0xFF2B2D33),
    surface = Color.White, onSurface = Color(0xFF2B2D33),
    surfaceVariant = Color(0xFFF1F3FA), onSurfaceVariant = Color(0xFF5F6578),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF8F9FD),
    surfaceContainer = Color(0xFFF3F5FB), surfaceContainerHigh = Color(0xFFEEF1F9),
    surfaceContainerHighest = Color(0xFFE8ECF6),
    outline = Color(0xFF9AA1B5), outlineVariant = Color(0xFFE0E4F0),
    error = Color(0xFFC0392B),
)

private val timeFmt = SimpleDateFormat("HH:mm", Locale.JAPAN)
private val dayFmt = SimpleDateFormat(I18n.dayPat(true), Locale.getDefault())
private fun dayKey(t: Long) = ((t + java.util.TimeZone.getDefault().getOffset(t)) / 86_400_000L).toString()   // 日付の見出し用。SimpleDateFormat を毎回作らない（重い）

private fun short(s: String, n: Int = 24): String {
    val one = MEMO_LINK.replace(s) { it.groupValues[1] }.replace('\n', ' ').trim()
    return if (one.length <= n) one.ifEmpty { "（画像）" } else one.take(n) + "…"
}

/** メモの本文の中の、ほかのメモへのリンク: [表示名](memo:ID)。PC で取り込むと Gnosis のリンクになる。 */
val MEMO_LINK = Regex("\\[([^\\]\\n]*)\\]\\(memo:([^)\\s]+)\\)")

/** リンクの表示名（メモにはタイトルが無いので、本文の最初の行を短く）。[ ] は使わない。 */
fun linkLabel(text: String): String =
    short(text.lineSequence().firstOrNull { it.isNotBlank() } ?: text, 20).replace("[", "").replace("]", "")

data class Pick(val kind: String, val forId: String?)   // kind: link / context / parent

/** メモを探して選ぶ画面。リンク・文脈は複数、親（parent）は 1 つ。新しい順。 */
@Composable
private fun PickDialog(entries: List<Entry>, kind: String, exclude: Set<String>, onDismiss: () -> Unit, onDone: (List<String>) -> Unit) {
    var q by remember { mutableStateOf("") }
    val chosen = remember { mutableStateListOf<String>() }
    val multi = kind != "parent" && kind != "outline"
    val list = entries.filter { it.id !in exclude && matchesQuery(it.text, q) }
        .sortedByDescending { it.created }
    AlertDialog(onDismissRequest = onDismiss,
        title = { Text(when (kind) { "link" -> "リンクするメモ"; "context" -> "返信先にするメモ"; "outline" -> "引用するメモ（見出しはこのあと選ぶ）"; else -> "親（Branch）にするメモ" }) },
        text = {
            Column {
                OutlinedTextField(q, { q = it }, placeholder = { Text("探す（本文の一部）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (multi) Text("複数選べます（${chosen.size} 件）", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 4.dp))
                LazyColumn(Modifier.heightIn(max = 360.dp).padding(top = 6.dp)) {
                    items(list, key = { it.id }) { e ->
                        Row(Modifier.fillMaxWidth().clickable {
                            if (!multi) onDone(listOf(e.id)) else if (e.id in chosen) chosen.remove(e.id) else chosen.add(e.id)
                        }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (multi) Checkbox(checked = e.id in chosen, onCheckedChange = { if (it) chosen.add(e.id) else chosen.remove(e.id) })
                            Column(Modifier.weight(1f)) {
                                Text(short(e.text, 40), fontSize = 15.sp)
                                Text(dayFmt.format(Date(e.created)) + " " + timeFmt.format(Date(e.created)) + "  " + topicLabel(e.topic),
                                    fontSize = 11.sp, color = MaterialTheme.colorScheme.outline)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { if (multi) TextButton(onClick = { onDone(chosen.toList()) }, enabled = chosen.isNotEmpty()) { Text("決定") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("やめる") } })
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun CaptureScreen(store: Store, promptState: MutableState<Boolean>, sharedState: MutableState<IncomingShare?>) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val entries = remember { mutableStateListOf<Entry>().apply { addAll(store.load()) } }
    var settings by remember { mutableStateOf(store.loadSettings()) }
    var topic by remember { mutableStateOf(settings.lastTopic) }
    var pcRecords by remember { mutableStateOf(store.loadRecords()) }   // PC にある時系列記録の名前
    var pcTopics by remember { mutableStateOf(store.loadPcTopics()) }   // PC のチャットメモのトピック名
    val entrySnapshot by remember { derivedStateOf { entries.toList() } }   // 変わったときだけ作り直す（毎回コピーして比べると、スクロールが重い）
    val lastUse = remember(entrySnapshot) { HashMap<String, Long>().also { mp -> entrySnapshot.forEach { e -> (listOf(e.topic) + e.ups).forEach { n -> if (n.isNotEmpty() && (mp[n] ?: 0L) < e.created) mp[n] = e.created } } } }
    val topics = remember(settings.topics, entrySnapshot, pcRecords, pcTopics) {
        (settings.topics + entrySnapshot.map { it.topic } + pcRecords + pcTopics).filter { it.isNotEmpty() && it != ALL }.distinct().sortedByDescending { lastUse[it] ?: 0L }   // 最近使った順
    }
    val topicCounts = remember(entrySnapshot) { entrySnapshot.groupingBy { it.topic }.eachCount() }
    val recentTopics = remember(settings.recentTopics, topics, topic) {
        (listOf(topic) + settings.recentTopics).distinct().filter { it==ALL || it==UNASSIGNED || it in topics || it in pcTopics || it in pcRecords }
    }
    // 関係はメモ単位で決まり、トピックには固定の親・子を置かない。
    val upperCandidates = remember(entrySnapshot, topic) {
        entrySnapshot.filter { it.topic==topic }.flatMap { it.ups }.filter { it!=topic }.distinct()
            .sortedWith(compareByDescending<String> { name -> entrySnapshot.count { it.topic==topic && name in it.ups } }.thenBy { it })
    }
    val lowerCandidates = remember(entrySnapshot, topic) {
        entrySnapshot.filter { topic in it.ups && it.topic.isNotEmpty() && it.topic!=topic }.map { it.topic }.distinct()
            .sortedWith(compareByDescending<String> { name -> entrySnapshot.count { it.topic==name && topic in it.ups } }.thenBy { it })
    }
    val selected = remember { mutableStateListOf<String>() }
    var selecting by remember { mutableStateOf(false) }
    var moveSelectedOpen by remember { mutableStateOf(false) }
    var fromPrompt by remember { mutableStateOf(false) }   // アラームから日記を開いている
    var pickingImage by remember { mutableStateOf(false) }
    var deleteSelectedOpen by remember { mutableStateOf(false) }
    var notificationsEnabled by remember { mutableStateOf(Alarm.notificationsEnabled(ctx)) }
    var exactEnabled by remember { mutableStateOf(Alarm.canScheduleExact(ctx)) }
    var nextAlarm by remember { mutableStateOf(Alarm.scheduledTime(ctx)) }
    var input by remember { mutableStateOf("") }
    val pendingImages = remember { mutableStateListOf<String>() }
    var replyTo by remember { mutableStateOf<String?>(null) }      // 次に書くものの Branch の親
    val contextsTo = remember { mutableStateListOf<String>() }      // 次に書くものの文脈にするメモ（右スワイプで足す）
    var flash by remember { mutableStateOf<String?>(null) }
    var insertMenu by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }
    var pcDaysOpen by remember { mutableStateOf(false) }   // PC の日のノート（日記・時系列記録）を見る
    var scanOpen by remember { mutableStateOf(false) }             // 紙のスキャンの画面
    var bigInput by remember { mutableStateOf(false) }             // 入力欄を大きくしている
    var focusTick by remember { mutableStateOf(0) }                // 増やすと入力欄を選んでキーボードを出す
    var rangeAnchor by remember { mutableStateOf<String?>(null) }  // 範囲選択の起点（最後に選んだメモ）
    var rangeMode by remember { mutableStateOf(false) }            // 範囲選択: 次に押したメモまでをまとめて選ぶ
    var outlineFor by remember { mutableStateOf<String?>(null) }   // アウトライン引用で見出しを選んでいるメモ
    val expanded = remember { mutableStateListOf<String>() }       // 「続きを見る」で開いたメモ
    var pick by remember { mutableStateOf<Pick?>(null) }           // メモを探して選ぶ画面
    var relEditFor by remember { mutableStateOf<String?>(null) }   // 文脈・親を編集しているメモ
    var contextFor by remember { mutableStateOf<String?>(null) }   // 文脈をつなぐ相手を選んでいる途中のメモ
    var editing by remember { mutableStateOf<String?>(null) }
    val sheetForState = remember { mutableStateOf<String?>(null) }   // 長押しのシートを開いているメモ（読むのは MemoSheet の中だけ）
    var sheetFor by sheetForState
    var topicDialogFor by remember { mutableStateOf<String?>(null) }
    var addTopicOpen by remember { mutableStateOf(false) }
    var moveToNewTopic by remember { mutableStateOf<List<String>>(emptyList()) }
    var topicMenuFor by remember { mutableStateOf<String?>(null) }  // 長押ししたトピック（編集のシート）
    var topicListOpen by remember { mutableStateOf(false) }       // 固定の「一覧表示」からトピック検索
    val upperFilter = remember { mutableStateListOf<String>() }
    val lowerFilter = remember { mutableStateListOf<String>() }
    LaunchedEffect(Unit) { upperFilter.clear(); upperFilter.addAll(settings.writeUpsByTopic[settings.writeTopic].orEmpty()) }
    var filterPicker by remember { mutableStateOf<String?>(null) }
    var jumpPickerOpen by remember { mutableStateOf(false) }
    var modeFor by remember { mutableStateOf<String?>(null) }      // 取り込み方（1 つのノートにまとめる・日時）を変えるトピック
    var search by remember { mutableStateOf<String?>(null) }      // 全文検索（null で閉じている）
    var settingsOpen by remember { mutableStateOf(false) }
    var imported by remember { mutableStateOf(store.importedIds()) }
    var deleteFor by remember { mutableStateOf<String?>(null) }
    val collapsed = remember { mutableStateListOf<String>() }      // Folgezettel 表示で折りたたんだメモ
    var backdate by remember { mutableStateOf<Long?>(null) }       // 日付を指定して書く（日記・時系列記録）。その日の 0 時。null は今日
    var pickDate by remember { mutableStateOf(false) }
    var viewDate by remember { mutableStateOf(false) }
    var upsDialogIds by remember { mutableStateOf<List<String>?>(null) }   // 「上」を選んでいる。空なら次に書くメモ、あれば、そのメモ
    var limit by remember { mutableStateOf(150) }                  // 新しい順に、これだけ表示（多いと重いので、「さらに表示」で足す）
    LaunchedEffect(topic, search) { limit = 150 }             // 日付を指定して、その日のメモを見る
    var renameFor by remember { mutableStateOf<String?>(null) }    // 名前を変えるトピック
    var deleteTopicFor by remember { mutableStateOf<String?>(null) } // 消すトピック
    if (scanOpen) { ScanScreen(onClose = { scanOpen = false }); return }
    if (pcDaysOpen) { PcDaysScreen(days = remember { store.loadPc().second }, onClose = { pcDaysOpen = false }); return }
    val prompt by promptState
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    // キーボードを閉じたら（戻るボタン・下へ払うなど）入力欄の選択も外す（枠の色とカーソルが残らないように）
    val imeVisible = WindowInsets.isImeVisible
    var imeWasVisible by remember { mutableStateOf(false) }
    LaunchedEffect(imeVisible) {
        if (imeWasVisible && !imeVisible) focusManager.clearFocus()
        imeWasVisible = imeVisible
    }
    val listState = rememberLazyListState()
    val treeState = rememberLazyListState()
    val byId = remember(entrySnapshot) { entrySnapshot.associateBy { it.id } }

    fun persist() { val snapshot = entries.toList(); store.save(snapshot); imported = store.importedIds(snapshot) }

    // PC が取り込むたびに imported.json が変わるので、戻ってくるたびに読み直す
    fun setTopic(t: String) {
        if (t != topic) backdate = null   // 日時の指定はトピックを変えたら今に戻す
        val assigned = if (t == ALL) UNASSIGNED else t
        if (t != topic) {
            upperFilter.clear(); upperFilter.addAll(settings.writeUpsByTopic[assigned].orEmpty().filter { it != assigned })
            lowerFilter.clear()
        }
        topic = t
        settings = settings.copy(lastTopic = t, writeTopic = assigned,
            recentTopics = (listOf(t) + settings.recentTopics).distinct().take(100),
            writeUps = settings.writeUpsByTopic[assigned].orEmpty().filter { it != assigned })
        store.saveSettings(settings)
    }
    // PC が USB でメモを書き込んだら、アプリを開いたままでも、すぐ取り込む（2 秒ごとに、ファイルの更新を見る）
    LaunchedEffect(Unit) {
        var seen = File(ctx.filesDir, "pc_memos.json").lastModified()
        while (true) {
            delay(2000)
            val now = File(ctx.filesDir, "pc_memos.json").lastModified()
            if (now != seen) {
                seen = now
                val cur = entries.toList(); val merged = store.syncPc(cur)
                if (merged != cur) { entries.clear(); entries.addAll(merged); persist() }
                pcRecords = store.loadRecords(); pcTopics = store.loadPcTopics()
            }
        }
    }
    LifecycleResumeEffect(Unit) {
        run { val cur = entries.toList(); val merged = store.syncPc(cur); if (merged != cur) { entries.clear(); entries.addAll(merged); persist() } }   // PC のメモと共有
        imported = store.importedIds()
        // PC の時系列記録の名前は、スマホでも時系列記録として扱う（PC の取り込みは settings.json の topicModes を見る）
        pcRecords = store.loadRecords(); pcTopics = store.loadPcTopics()
        val add = pcRecords.filter { settings.topicModes[it]?.record != true }
        if (add.isNotEmpty()) { settings = settings.copy(topicModes = settings.topicModes + add.associateWith { TopicMode(record = true) }); store.saveSettings(settings) }
        notificationsEnabled = Alarm.notificationsEnabled(ctx)
        exactEnabled = Alarm.canScheduleExact(ctx)
        Alarm.ensureScheduled(ctx, settings)
        nextAlarm = Alarm.scheduledTime(ctx)
        onPauseOrDispose {
            if (!pickingImage) backdate = null   // アプリを離れたら、日時の指定は今に戻す
            // アラームの日記を書き終えてアプリを閉じたら、全部表示に戻す（画像を選びに出たときは戻さない）
            if (fromPrompt && !pickingImage) { fromPrompt = false; promptState.value = false; setTopic(ALL) }
        }
    }

    // 開いただけでは入力欄を選ばない（カーソルもキーボードも出さない）。入力欄を押したとき・
    // 書く操作（続けて書く・書き直す・スワイプ・挿入）・アラームの通知から開いたときだけ選ぶ
    LaunchedEffect(prompt) {
        if (prompt) { fromPrompt = true; setTopic(DIARY); delay(150); focus.requestFocus(); keyboard?.show() }
    }
    LaunchedEffect(entries.size) { if (entries.isNotEmpty()) listState.animateScrollToItem(0) }
    // 入力欄を選んでキーボードを出す。長押しのメニューが閉じきる前だと選べないので、少し待って何度か試す
    LaunchedEffect(focusTick) {
        if (focusTick == 0) return@LaunchedEffect
        for (wait in listOf(150L, 250L, 400L)) {
            delay(wait)
            try { focus.requestFocus() } catch (_: IllegalStateException) {}
            keyboard?.show()
        }
    }

    // 他アプリの共有から新しいメモの下書きへ。ファイルは私有ストレージへコピーし、
    // 保存ボタンを押すまでは独立したメモを作成しない。
    val incoming = sharedState.value
    LaunchedEffect(incoming) {
        if (incoming == null) return@LaunchedEffect
        if (incoming.text.isNotBlank()) input = input + (if (input.isBlank()) "" else "\n") + incoming.text
        incoming.uris.forEachIndexed { index, uri ->
            try {
                val suggested = ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0) else null
                } ?: "共有ファイル"
                val mime = ctx.contentResolver.getType(uri).orEmpty()
                val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime).orEmpty()
                val safe = suggested.replace(Regex("[^A-Za-z0-9_.-]"), "_").takeLast(75).trimStart('.').ifEmpty { "file" }
                val suffix = if (safe.contains('.')) safe else safe + (if(extension.isNotBlank()) ".$extension" else "")
                val name = "shared-" + System.currentTimeMillis() + "-$index-" + suffix
                ctx.contentResolver.openInputStream(uri)?.use { source ->
                    File(store.imageDir, name).outputStream().use { target -> source.copyTo(target) }
                    pendingImages.add(name)
                }
            } catch (e: Exception) { Toast.makeText(ctx,"共有ファイルを読み込めませんでした",Toast.LENGTH_SHORT).show() }
        }
        sharedState.value = null
        focusTick++
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        pickingImage = false
        if (uri != null) {
            val name = "img-" + System.currentTimeMillis() + ".jpg"
            ctx.contentResolver.openInputStream(uri)?.use { i -> File(store.imageDir, name).outputStream().use { i.copyTo(it) } }
            pendingImages.add(name)
        }
    }
    val askNotify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        notificationsEnabled = Alarm.notificationsEnabled(ctx)
    }
    /** child の親を parent にすると循環になるか（parent をたどって child に戻る）。 */
    fun wouldCycle(child: String, parent: String): Boolean {
        var p: String? = parent
        val seen = HashSet<String>()
        while (p != null && seen.add(p)) {
            if (p == child) return true
            p = entries.firstOrNull { it.id == p }?.parent
        }
        return false
    }

    /** 親（Branch）を付け替える。null で外す。循環になるときは変えない。 */
    fun setParent(id: String, parent: String?) {
        val k = entries.indexOfFirst { it.id == id }
        if (k < 0 || (parent != null && (parent == id || wouldCycle(id, parent)))) return
        entries[k] = entries[k].copy(parent = parent, exported = false); persist()
    }

    /** 文脈を足す。親が無ければ最初の文脈を親（Branch）にする（PC の Gnosis の c と同じ）。 */
    fun addContexts(id: String, ids: List<String>) {
        val k = entries.indexOfFirst { it.id == id }
        if (k < 0) return
        val e = entries[k]
        val cs = (e.contexts + ids).filter { it != id }.distinct()
        entries[k] = e.copy(contexts = cs, parent = null, exported = false); persist()
    }

    fun removeContext(id: String, c: String) {
        val k = entries.indexOfFirst { it.id == id }
        if (k >= 0) { entries[k] = entries[k].copy(contexts = entries[k].contexts - c, exported = false); persist() }
    }

    /** 入力欄の最後に足す（行の途中なら改行してから）。 */
    fun appendInput(s: String, newLine: Boolean) {
        input = when {
            input.isEmpty() -> s
            newLine && !input.endsWith("\n") -> input + "\n" + s
            !newLine && !input.endsWith(" ") && !input.endsWith("\n") -> "$input $s"
            else -> input + s
        }
    }

    /** 文脈や Branch の親のメモへスクロールし、少しのあいだ色を変えて知らせる。 */
    fun jumpTo(id: String) {
        if (visibleEntries(entries, topic).none { it.id == id }) setTopic(ALL)
        if (settings.folgeView) {
            // 祖先を開いてから、その行へ
            var p = byId[id]?.parent
            val seen = HashSet<String>()
            while (true) { val q = p ?: break; if (!seen.add(q)) break; collapsed.remove(q); p = byId[q]?.parent }
            scope.launch {
                delay(50)
                val idx = folgeRows(visibleEntries(entries, topic), collapsed.toSet()).indexOfFirst { it.entry.id == id }
                if (idx >= 0) treeState.animateScrollToItem(idx)
                flash = id; delay(1500); if (flash == id) flash = null
            }
            return
        }
        scope.launch {
            delay(50)
            val list = visibleEntries(entries, topic).sortedByDescending { it.created }
            val pos = list.indexOfFirst { it.id == id }; if (pos >= limit) { limit = pos + 30; delay(150) }   // 古いメモへ飛ぶときは、そこまで表示を広げる
            var idx = 0
            for ((i, x) in list.withIndex()) {
                if (x.id == id) break
                idx++
                val next = list.getOrNull(i + 1)
                if (next == null || dayKey(next.created) != dayKey(x.created)) idx++   // 日付の見出しの行
            }
            listState.animateScrollToItem(idx)
            flash = id; delay(1500); if (flash == id) flash = null
        }
    }

    /** 選んだメモを古い順に 1 件へまとめる（本文は空行で区切る。画像・文脈も引き継ぐ）。 */
    fun mergeEntries(ids: Set<String>) {
        val group = entries.filter { it.id in ids }.sortedBy { it.created }
        if (group.size < 2) return
        val base = group.first()
        val others = group.drop(1).map { it.id }.toSet()
        val merged = base.copy(
            text = group.map { it.text.trim() }.filter { it.isNotEmpty() }.joinToString("\n\n"),
            images = group.flatMap { it.images },
            parent = base.parent?.takeIf { it !in ids },
            contexts = group.flatMap { it.contexts }.filter { it !in ids }.distinct(),
            edited = System.currentTimeMillis(), exported = false)
        entries.removeAll { it.id in others }
        for (k in entries.indices) {
            val e = if (entries[k].id == base.id) merged else entries[k]
            val parent = if (e.parent in others) base.id else e.parent
            val contexts = e.contexts.map { if (it in others) base.id else it }.filter { it != e.id }.distinct()
            entries[k] = if (parent != e.parent || contexts != e.contexts) e.copy(parent = parent.takeIf { it != e.id }, contexts = contexts, exported = false) else e
        }
        persist()
    }

    fun toggleSelection(id: String) {
        if (id in selected) selected.remove(id) else selected.add(id)
        rangeAnchor = id
    }
    /** 起点（最後に押したメモ）から id までを、いま見えている並びのとおりにまとめて選ぶ。 */
    fun selectRange(order: List<String>, id: String) {
        val a = rangeAnchor
        if (a == null) { toggleSelection(id); return }
        rangeIds(order, a, id).forEach { if (it !in selected) selected.add(it) }
        rangeAnchor = id; rangeMode = false
    }
    fun moveEntries(ids: Collection<String>, destination: String) {
        val now = System.currentTimeMillis()
        for (k in entries.indices) if (entries[k].id in ids) {
            entries[k] = entries[k].copy(topic = destination, edited = now, exported = false)
        }
        persist()
    }

    fun deleteEntries(ids: Set<String>) {
        // 消して空になった通常のトピックは、トピックの一覧からも消す（日記・時系列記録は残す）
        val cleaned = settingsAfterImportedRemoval(entries.toList(), settings, ids, (pcRecords + pcTopics).toSet())
        entries.filter { it.id in ids }.flatMap { it.images }.forEach { File(store.imageDir, it).delete() }
        entries.filter { it.id in ids && it.pcId != null }.map { it.pcId!! }.let { gone -> if (gone.isNotEmpty()) store.savePcDeleted(store.loadPcDeleted() + gone) }   // PC のメモを消したら、次の USB で PC でも消える
        entries.removeAll { it.id in ids }
        if (cleaned != settings) { settings = cleaned; store.saveSettings(settings) }
        if (topic != ALL && topic != UNASSIGNED && topic !in settings.topics && entries.none { it.topic == topic } && topic !in pcRecords) setTopic(ALL)
        for (k in entries.indices) {
            val e = entries[k]
            if (e.parent in ids || e.contexts.any { it in ids }) entries[k] = e.copy(parent = e.parent.takeIf { it !in ids }, contexts = e.contexts.filter { it !in ids }, exported = false)
        }
        persist()
    }

    fun send() {
        if(lowerFilter.size>1) return // 1件のメモの所属トピックは1つだけ
        val text = input.trim()
        if (text.isEmpty() && pendingImages.isEmpty()) return
        val ed = editing
        if (ed != null) {
            val i = entries.indexOfFirst { it.id == ed }
            if (i >= 0) entries[i] = entries[i].copy(text = text, images = entries[i].images + pendingImages, edited = System.currentTimeMillis(), exported = false)
            editing = null
        } else {
            val now = System.currentTimeMillis()
            // 日時を指定したときは、その日時（秒は今の秒にして、ほかのノートの名前と重なりにくくする）
            // 日付を指定したときは、その日に今の時刻を足した日時。「時刻を入れる」がオフなら PC では時刻を付けない
            val bd = backdate
            val at = if (bd != null) backdatedTime(bd, now) else now
            val body = if (bd != null) backdatedText(text, settings.writtenStamp, now) else text
            val writeTopic = lowerFilter.singleOrNull() ?: if (topic == ALL) UNASSIGNED else topic
            val writeUps = if (lowerFilter.size==1) (settings.writeUpsByTopic[writeTopic].orEmpty() + topic).distinct()
                else if(upperFilter.isNotEmpty()) upperFilter.toList() else settings.writeUps
            entries.add(Entry(id = Store.newId(at, entries), created = at, topic = writeTopic, ups = writeUps.filter { it != writeTopic }, text = body,
                images = pendingImages.toList(), parent = null, contexts = contextsTo.toList(),
                noTime = bd != null && !settings.writtenStamp))
            replyTo = null; contextsTo.clear()
        }
        input = ""; pendingImages.clear(); promptState.value = false
        persist()
    }

    Scaffold(
        topBar = { Column {
            TopAppBar(
                title = {
                    val n = entries.count { it.id !in imported }
                    val sq = search
                    if (sq != null) {
                        val fr = remember { FocusRequester() }
                        OutlinedTextField(sq, { search = it }, placeholder = { Text("メモを全文検索") }, singleLine = true,
                            modifier = Modifier.fillMaxWidth().focusRequester(fr))
                        LaunchedEffect(Unit) { fr.requestFocus() }
                    } else Column {
                        Text(if (selecting) "${selected.size} 件選択" else topicLabel(topic), fontWeight = FontWeight.Bold,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val bdSub = backdate?.let { "　日付: " + SimpleDateFormat(I18n.dayPat(false), Locale.getDefault()).format(Date(it)) } ?: ""
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (bdSub.isNotEmpty()) Text(bdSub.trim(), fontSize = 12.sp,
                                maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { search = if (search == null) "" else null }) {
                        Icon(if (search != null) Icons.Filled.Close else Icons.Filled.Search, if (search != null) "検索をやめる" else "全文検索")
                    }
                    if (search == null && !selecting) Box {
                        IconButton(onClick = { insertMenu = true }) { Icon(Icons.Filled.AddCircleOutline, "挿入（チェックボックス・リンク・返信）") }
                        DropdownMenu(expanded = insertMenu, onDismissRequest = { insertMenu = false }) {
                            DropdownMenuItem(text = { Text("チェックボックス") }, leadingIcon = { Icon(Icons.Filled.CheckBox, null) }, onClick = {
                                insertMenu = false; appendInput("- [ ] ", true); focusTick++
                            })
                            DropdownMenuItem(text = { Text("リンク（メモを探す）") }, leadingIcon = { Icon(Icons.Filled.InsertLink, null) }, onClick = {
                                insertMenu = false; pick = Pick("link", editing)
                            })
                            DropdownMenuItem(text = { Text("アウトライン引用（見出しへのリンク）") }, leadingIcon = { Icon(Icons.Filled.FormatQuote, null) }, onClick = {
                                insertMenu = false; pick = Pick("outline", editing)
                            })
                            DropdownMenuItem(text = { Text("返信（メモを探す）") }, leadingIcon = { Icon(Icons.Filled.Link, null) }, onClick = {
                                insertMenu = false; pick = Pick("context", editing)
                            })
                        }
                    }
                    // 選択中は「選択をやめる」だけを出す。ほかのあまり使わない操作は ⋮ のメニューに
                    if (selecting) IconButton(onClick = { selecting = false; selected.clear() }) { Icon(Icons.Filled.Close, "選択をやめる") }
                    else if (search == null) Box {
                        IconButton(onClick = { moreMenu = true }) { Icon(Icons.Filled.MoreVert, "そのほか") }
                        DropdownMenu(expanded = moreMenu, onDismissRequest = { moreMenu = false }) {
                            if (topic == DIARY || settings.topicModes[topic]?.record == true) {
                                DropdownMenuItem(text = { Text(backdate?.let { "日付: " + SimpleDateFormat(I18n.dayPat(true), Locale.getDefault()).format(Date(it)) } ?: "日付を指定して書く（今日）") },
                                    leadingIcon = { Icon(Icons.Filled.Event, null) }, onClick = { moreMenu = false; pickDate = true })
                                if (backdate != null) {
                                    DropdownMenuItem(text = { Text(if (settings.writtenStamp) "今の時刻を入れる（オン）" else "今の時刻を入れる（オフ）") },
                                        leadingIcon = { Icon(if (settings.writtenStamp) Icons.Filled.Check else Icons.Filled.Schedule, null) }, onClick = {
                                        settings = settings.copy(writtenStamp = !settings.writtenStamp); store.saveSettings(settings)
                                    })
                                    DropdownMenuItem(text = { Text("日付を今日に戻す") }, leadingIcon = { Icon(Icons.Filled.Close, null) }, onClick = { moreMenu = false; backdate = null })
                                }
                            }
                            if (topic !in listOf(ALL, UNASSIGNED, DIARY)) {
                                DropdownMenuItem(text = { Text("このトピックの取り込み方") }, leadingIcon = { Icon(Icons.Filled.Settings, null) }, onClick = { moreMenu = false; modeFor = topic })
                            }
                            DropdownMenuItem(text = { Text("日付を指定して見る") }, leadingIcon = { Icon(Icons.Filled.Event, null) }, onClick = { moreMenu = false; viewDate = true })
                            DropdownMenuItem(text = { Text("複数選択") }, leadingIcon = { Icon(Icons.Filled.Checklist, null) }, onClick = {
                                moreMenu = false; selecting = true; selected.clear(); rangeAnchor = null; rangeMode = false; contextFor = null; keyboard?.hide()
                            })
                            DropdownMenuItem(text = { Text(if (settings.expandAll) "長いメモを折りたたむ" else "長いメモを全部展開する") },
                                leadingIcon = { Icon(if (settings.expandAll) Icons.Filled.UnfoldLess else Icons.Filled.UnfoldMore, null) }, onClick = {
                                moreMenu = false; settings = settings.copy(expandAll = !settings.expandAll); store.saveSettings(settings); expanded.clear()
                            })
                            if (store.loadPc().second.isNotEmpty()) DropdownMenuItem(text = { Text("PC の日のノート（日記・時系列記録）") }, leadingIcon = { Icon(Icons.Filled.Event, null) }, onClick = { moreMenu = false; pcDaysOpen = true })
                            DropdownMenuItem(text = { Text("紙のスキャン") }, leadingIcon = { Icon(Icons.Filled.CameraAlt, null) }, onClick = {
                                moreMenu = false; scanOpen = true
                            })
                            DropdownMenuItem(text = { Text("アラームと設定") }, leadingIcon = { Icon(Icons.Filled.Alarm, null) }, onClick = {
                                moreMenu = false; settingsOpen = true
                            })
                        }
                    }
                },
            )
        } },
        bottomBar = {
            Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp)) {
                // つなぎ方の案内（WhatsApp の返信のように、何に続けて書いているかを見せる）
                val banners = buildList<Pair<String, () -> Unit>> {
                    if (contextFor != null) add("返信先にするメモを続けてタップ（「${short(byId[contextFor]?.text ?: "")}」の返信先。終わったら ×）" to { contextFor = null })
                    if (editing != null) add("編集中: ${short(byId[editing]?.text ?: "")}" to { editing = null; input = "" })
                    if (contextsTo.isNotEmpty()) add("↩ 返信 ${contextsTo.size} 件: " + contextsTo.joinToString("、") { short(byId[it]?.text ?: "", 10) } to { contextsTo.clear() })
                }
                banners.forEach { banner ->
                    Surface(tonalElevation = 3.dp, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
                        Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(banner.first, Modifier.weight(1f), fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            IconButton(onClick = banner.second) { Icon(Icons.Filled.Close, "やめる") }
                        }
                    }
                }
                if (selecting) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = {
                                selected.clear(); selected.addAll(visibleEntries(entries, topic).map { it.id })
                            }) { Text("全選択") }
                            TextButton(onClick = { selected.clear(); rangeAnchor = null }) { Text("解除") }
                            // 範囲選択: 押してから、範囲の終わりのメモを押す（長押しでも、最後に選んだメモからそこまで選べる）
                            FilterChip(selected = rangeMode, onClick = { rangeMode = !rangeMode }, enabled = rangeAnchor != null,
                                label = { Text(if (rangeMode) "終わりのメモを押す" else "ここから範囲選択") },
                                leadingIcon = { Icon(Icons.Filled.UnfoldMore, null, Modifier.size(16.dp)) })
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            OutlinedButton(onClick = {
                                val text = entries.filter { it.id in selected }.sortedBy { it.created }.joinToString("\n\n") { it.text }
                                ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("memo", text))
                                selected.clear(); selecting = false
                            }, enabled = selected.isNotEmpty(), modifier = Modifier.weight(1f)) { Text("コピー") }
                            OutlinedButton(onClick = { moveSelectedOpen = true }, enabled = selected.isNotEmpty(), modifier = Modifier.weight(1f)) { Text("移動") }
                            OutlinedButton(onClick = { upsDialogIds = selected.toList() }, enabled = selected.isNotEmpty(), modifier = Modifier.weight(1f)) { Text("上") }
                            OutlinedButton(onClick = { deleteSelectedOpen = true }, enabled = selected.isNotEmpty(), modifier = Modifier.weight(1f)) { Text("消す") }
                        }
                    }
                }
                // 最近使ったトピックを横スクロール。全一覧ボタンだけ右に固定する。
                Row(Modifier.fillMaxWidth().padding(bottom=4.dp),verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                    LazyRow(Modifier.weight(1f),horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                        items(recentTopics,key={it}) { t ->
                            FilterChip(selected=t==topic,onClick={ if(!selecting) setTopic(t) },enabled=!selecting,
                                label={Text(topicLabel(t),maxLines=1)},shape=RoundedCornerShape(16.dp))
                        }
                    }
                    OutlinedButton(onClick={topicListOpen=true},enabled=!selecting,contentPadding=PaddingValues(horizontal=10.dp)) {
                        Text("一覧表示",fontSize=12.sp)
                    }
                }
                if (topic!=ALL && topic!=UNASSIGNED) {
                    val upperChoices=(upperCandidates+upperFilter).distinct()
                    val lowerChoices=(lowerCandidates+lowerFilter).distinct()
                    Row(verticalAlignment=Alignment.CenterVertically) {
                        Text("上位で絞り込む",fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier=Modifier.width(100.dp))
                        LazyRow(Modifier.weight(1f),horizontalArrangement=Arrangement.spacedBy(4.dp)) {
                            items(upperChoices,key={it}) { name ->
                                FilterChip(selected=name in upperFilter,enabled=!selecting,onClick={
                                    if(name in upperFilter) upperFilter.remove(name) else upperFilter.add(name)
                                    val values=upperFilter.toList()
                                    settings=settings.copy(writeUps=values,writeUpsByTopic=settings.writeUpsByTopic+(topic to values))
                                    store.saveSettings(settings)
                                },label={Text(name,maxLines=1)})
                            }
                        }
                        IconButton(onClick={filterPicker="upper"},enabled=!selecting,modifier=Modifier.size(38.dp)) {
                            Icon(Icons.Filled.Add,"上位トピックを選んで追加")
                        }
                    }
                    Row(verticalAlignment=Alignment.CenterVertically) {
                        Text("下位で絞り込む",fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier=Modifier.width(100.dp))
                        LazyRow(Modifier.weight(1f),horizontalArrangement=Arrangement.spacedBy(4.dp)) {
                            items(lowerChoices,key={it}) { name ->
                                FilterChip(selected=name in lowerFilter,enabled=!selecting,onClick={
                                    if(name in lowerFilter) lowerFilter.remove(name) else lowerFilter.add(name)
                                },label={Text(name,maxLines=1)})
                            }
                        }
                        IconButton(onClick={filterPicker="lower"},enabled=!selecting,modifier=Modifier.size(38.dp)) {
                            Icon(Icons.Filled.Add,"下位トピックを選んで追加")
                        }
                    }
                    val targetNames=(upperFilter+lowerFilter).distinct()
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.End) {
                        if(targetNames.isNotEmpty()) TextButton(onClick={
                            upperFilter.clear();lowerFilter.clear()
                        },enabled=!selecting) { Text("絞り込み解除") }
                        OutlinedButton(
                            onClick={if(targetNames.size==1) setTopic(targetNames[0]) else jumpPickerOpen=true},
                            enabled=targetNames.isNotEmpty() && !selecting,
                            contentPadding=PaddingValues(horizontal=12.dp,vertical=2.dp)
                        ) { Icon(Icons.Filled.ArrowForward,null,Modifier.size(16.dp)); Text("選択先へ移動",fontSize=12.sp) }
                    }
                    if(lowerFilter.size>1) Text("下位トピックを複数選択中。書き込み先を1つに絞ると送信できます。",
                        fontSize=11.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (pendingImages.isNotEmpty()) {
                    LazyRow(Modifier.padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(pendingImages.toList()) { name ->
                            Box {
                                if (isPicture(name)) AsyncImage(File(store.imageDir, name), null, Modifier.size(64.dp), contentScale = ContentScale.Crop)
                                else Surface(Modifier.size(width=140.dp,height=64.dp).clickable { openSharedFile(ctx,store,name) },color=MaterialTheme.colorScheme.surfaceVariant) {
                                    Text("📎 " + name.substringAfterLast('-'),Modifier.padding(8.dp),fontSize=12.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
                                }
                                IconButton(onClick = { pendingImages.remove(name) }, Modifier.size(24.dp).align(Alignment.TopEnd)) {
                                    Icon(Icons.Filled.Cancel, "外す")
                                }
                            }
                        }
                    }
                }
                // 入力欄: 枠なしのやわらかい面。画像は左、大きくする・戻すは入力欄の右上、送るは丸い青いボタン
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    IconButton(onClick = { pickingImage = true; pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                        Icon(Icons.Filled.Image, "画像を付ける", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextField(
                        value = input, onValueChange = { input = it },
                        modifier = Modifier.weight(1f).focusRequester(focus)
                            .then(if (bigInput) Modifier.height((LocalConfiguration.current.screenHeightDp * 0.45f).dp) else Modifier),
                        placeholder = { Text(if (prompt) "今まで何してた？" else if (topic == DIARY) "日記（時刻は自動で付きます）" else if (writingTopic(topic).isEmpty()) "メモを書く（未所属）" else "$topic に書く", color = MaterialTheme.colorScheme.outline) },
                        maxLines = if (bigInput) Int.MAX_VALUE else 6, shape = RoundedCornerShape(24.dp),
                        colors = TextFieldDefaults.colors(focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant, unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, disabledIndicatorColor = Color.Transparent),
                        trailingIcon = { IconButton(onClick = { bigInput = !bigInput }) {
                            Icon(if (bigInput) Icons.Filled.CloseFullscreen else Icons.Filled.OpenInFull, if (bigInput) "入力欄を小さく" else "入力欄を大きく", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.outline)
                        } },
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, keyboardType = KeyboardType.Text),
                    )
                    FilledIconButton(onClick = { send() }, enabled = lowerFilter.size<2 && (input.isNotBlank() || pendingImages.isNotEmpty()), modifier = Modifier.size(46.dp)) {
                        Icon(Icons.AutoMirrored.Filled.Send, "送る")
                    }
                }
            }
        },
    ) { pad ->
        // 検索中はトピックに関係なく、全部のメモの本文から探す
        val sq = search?.trim().orEmpty()
        val shownAll = remember(entrySnapshot, search, topic, upperFilter.toList(), lowerFilter.toList()) {
            (if (search != null && sq.isNotEmpty()) entrySnapshot.filter { matchesQuery(it.text, sq) }
                else if (upperFilter.isNotEmpty() || lowerFilter.isNotEmpty()) entrySnapshot.filter { m ->
                    (m.topic == topic && m.ups.any { it in upperFilter }) ||
                    (m.topic in lowerFilter && topic in m.ups)
                } else visibleEntries(entrySnapshot, topic)).sortedByDescending { it.created }
        }
        val shown = remember(shownAll, limit) { if (shownAll.size > limit) shownAll.take(limit) else shownAll }
        if (settings.folgeView && search == null) {
            // Folgezettel 表示: 親子の木を上から（1, 1a, 1a1 …）。▸/▾ で一部を折りたたむ・開く
            val collapsedIds = collapsed.toSet()
            val rows = remember(shown, collapsedIds) { folgeRows(shown, collapsedIds) }
            Column(Modifier.fillMaxSize().padding(pad)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Folgezettel", fontSize = 13.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.weight(1f))
                    TextButton(onClick = { collapsed.clear() }) { Icon(Icons.Filled.UnfoldMore, null, Modifier.size(16.dp)); Text("全部展開") }
                    TextButton(onClick = { collapsed.clear(); collapsed.addAll(folgeParents(shown)) }) {
                        Icon(Icons.Filled.UnfoldLess, null, Modifier.size(16.dp)); Text("全部折りたたみ")
                    }
                }
                LazyColumn(Modifier.fillMaxSize(), state = treeState, contentPadding = PaddingValues(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(rows, key = { it.entry.id }) { r ->
                        val e = r.entry
                        MemoSwipe(enabled = !selecting,
                            onContext = { if (e.id in contextsTo) contextsTo.remove(e.id) else contextsTo.add(e.id); contextFor = null; editing = null; focusTick++ },
                            onBranch = { replyTo = e.id; contextFor = null; editing = null; focusTick++ }) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                                if (r.hasChildren) {
                                    val closed = e.id in collapsed
                                    IconButton(onClick = { if (closed) collapsed.remove(e.id) else collapsed.add(e.id) }, modifier = Modifier.size(32.dp)) {
                                        Icon(if (closed) Icons.Filled.ChevronRight else Icons.Filled.ExpandMore, if (closed) "展開" else "折りたたむ")
                                    }
                                } else Spacer(Modifier.width(32.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(r.label + if (r.hasChildren && e.id in collapsed) "  …" else "", fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                                    Bubble(e, e.id in imported, byId, store, selecting = contextFor != null && contextFor != e.id,
                                        selected = e.id in selected || e.id == flash, selectionMode = selecting,
                                        open = settings.expandAll || e.id in expanded,
                                        onToggleOpen = if (settings.expandAll) null else ({ if (e.id in expanded) expanded.remove(e.id) else expanded.add(e.id) }),
                                        onTap = {
                                            val cf = contextFor
                                            if (selecting && rangeMode) selectRange(rows.map { it.entry.id }, e.id)
                                            else if (selecting) toggleSelection(e.id)
                                            else if (cf != null && cf != e.id) {
                                                val k = entries.indexOfFirst { it.id == cf }
                                                if (k >= 0) { if (e.id in entries[k].contexts) removeContext(cf, e.id) else addContexts(cf, listOf(e.id)) }
                                            }
                                        },
                                        onJump = { jumpTo(it) },
                                        onLong = { if (selecting) selectRange(rows.map { it.entry.id }, e.id) else sheetFor = e.id },
                                        alignStart = true)
                                }
                            }
                        }
                    }
                    if (rows.isEmpty()) item { Text("この表示にはまだメモがありません。", Modifier.padding(24.dp), fontSize = 14.sp) }
                }
            }
        } else
        LazyColumn(Modifier.fillMaxSize().padding(pad), state = listState, reverseLayout = true,
            contentPadding = PaddingValues(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            shown.forEachIndexed { i, e ->
                item(key = e.id) {
                    MemoSwipe(enabled = !selecting,
                        onContext = { if (e.id in contextsTo) contextsTo.remove(e.id) else contextsTo.add(e.id); contextFor = null; editing = null; focusTick++ },
                        onBranch = { replyTo = e.id; contextFor = null; editing = null; focusTick++ }) {
                    Bubble(e, e.id in imported, byId, store, selecting = contextFor != null && contextFor != e.id, selected = e.id in selected || e.id == flash, selectionMode = selecting,
                        open = settings.expandAll || e.id in expanded,
                        onToggleOpen = if (settings.expandAll) null else ({ if (e.id in expanded) expanded.remove(e.id) else expanded.add(e.id) }),
                        onTap = {
                            val cf = contextFor
                            if (search != null) { search = null; jumpTo(e.id) }   // 検索の結果を押すと、そのメモの場所へ
                            else if (selecting && rangeMode) selectRange(shown.map { it.id }, e.id)
                            else if (selecting) toggleSelection(e.id)
                            else if (cf != null && cf != e.id) {
                                // 続けてタップして複数の文脈をつなぐ（もう一度タップすると外す）
                                val k = entries.indexOfFirst { it.id == cf }
                                if (k >= 0) {
                                    if (e.id in entries[k].contexts) removeContext(cf, e.id) else addContexts(cf, listOf(e.id))
                                }
                            }
                        },
                        onJump = { jumpTo(it) },
                        onLong = { if (selecting) selectRange(shown.map { it.id }, e.id) else sheetFor = e.id })
                    }
                }
                val next = shown.getOrNull(i + 1)
                if (next == null || dayKey(next.created) != dayKey(e.created)) {
                    item(key = "day-" + dayKey(e.created)) {
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 2.dp) {
                                Text(dayFmt.format(Date(e.created)), Modifier.padding(horizontal = 10.dp, vertical = 3.dp), fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
            if (shownAll.size > shown.size) item(key = "more") {
                TextButton(onClick = { limit += 150 }, modifier = Modifier.fillMaxWidth()) { Text("古いメモをさらに表示（あと ${shownAll.size - shown.size} 件）") }
            }
            if (shown.isEmpty()) item {
                Text("この表示にはまだメモがありません。\nここに書いたものは、USB で PC に取り込むと、YuriiNote の「未整理」に 1 件ずつ届きます。\n長押しで「分岐」「文脈」などができます。",
                    Modifier.padding(24.dp), fontSize = 14.sp)
            }
        }
    }

    // 長押しのシート（画面の下に大きな行。1 行 1 つで、何をするか一言ずつ書く）。
    // 状態の読み取りはシートの中だけにして、長押しのたびに画面全体を組み直さない（遅さの原因）
    MemoSheet(sheetForState, byId,
        actions = { target ->
            buildList<SheetAct> {
                add(SheetAct(Icons.Filled.Edit, "編集", "このメモの文章を直す") { editing = target.id; input = target.text })
                add(SheetAct(Icons.Filled.Link, "返信先を足す", "返信先にするメモを続けてタップ") { contextFor = target.id })
                add(SheetAct(Icons.Filled.AccountTree, "返信先を編集", "返信先を確かめて外す") { relEditFor = target.id })
                add(SheetAct(Icons.Filled.Label, "所属トピックを変える", "別の所属トピックへ移す") { topicDialogFor = target.id })
                add(SheetAct(Icons.Filled.Label, "上位トピックを変える", "上位トピック（いくつでも）") { upsDialogIds = listOf(target.id) })
                add(SheetAct(Icons.Filled.Checklist, "複数選択", "まとめて移す・消す") { selecting = true; selected.clear(); selected.add(target.id); rangeAnchor = target.id; rangeMode = false; contextFor = null; keyboard?.hide() })
                add(SheetAct(Icons.Filled.ContentCopy, "コピー", "文章をクリップボードへ") {
                    ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("memo", target.text))
                })
                // 取り込んでいなくても、間違えて書いたものは消せる（確認のダイアログが出る）
                add(SheetAct(Icons.Filled.Delete, "消す", if (target.id in imported) "スマホの中からだけ消す" else "まだ PC に取り込んでいないメモも、消せます", danger = true) { deleteFor = target.id })
            }
        },
        // 書く操作のあとだけ入力欄を選ぶ（コピー・トピックを変えるなどでは選ばない）
        onAfter = { if (replyTo != null || editing != null) focusTick++ })

    // フィルターの「＋」から検索・複数選択・新しいトピックを追加する。
    filterPicker?.let { kind ->
        val related = if(kind=="upper") upperCandidates else lowerCandidates
        val ordered = (related + settings.recentTopics + topics).distinct().filter { it!=topic }
        UpsDialog(ordered,if(kind=="upper") upperFilter.toSet() else lowerFilter.toSet(),topic,
            onDismiss={filterPicker=null},
            onDone={ picked ->
                if(kind=="upper") {
                    upperFilter.clear(); upperFilter.addAll(picked)
                    settings=settings.copy(writeUps=picked,writeUpsByTopic=settings.writeUpsByTopic+(topic to picked))
                    store.saveSettings(settings)
                } else { lowerFilter.clear();lowerFilter.addAll(picked) }
                filterPicker=null
            },
            onCreate={ proposed ->
                val name=normalizedTopic(proposed.trim())
                if(name.isBlank() || name==topic || name in topics || name in pcRecords || name in pcTopics ||
                    name in setOf(ALL,DIARY,"全部","全部表示","未所属","トピック未選択","その他")) false
                else {settings=settings.copy(topics=settings.topics+name);store.saveSettings(settings);true}
            },title=if(kind=="upper") "上位トピックで絞り込み・追加" else "下位トピックで絞り込み・追加")
    }
    if(jumpPickerOpen) {
        val destinations=(upperFilter+lowerFilter).distinct()
        AlertDialog(onDismissRequest={jumpPickerOpen=false},title={Text("移動先を選ぶ")},
            text={Column {
                destinations.forEach { name ->
                    TextButton(onClick={jumpPickerOpen=false;setTopic(name)},modifier=Modifier.fillMaxWidth()) {Text(name)}
                }
            }},
            confirmButton={TextButton(onClick={jumpPickerOpen=false}){Text("閉じる")}})
    }
    upsDialogIds?.let { ids ->
        val target = if (ids.isEmpty()) topic.let { if (it == ALL) UNASSIGNED else it } else byId[ids.first()]?.topic
        val used = remember(entrySnapshot, target) { entrySnapshot.filter { it.topic == target }.flatMap { it.ups }.toSet() }
        val ordered = remember(topics, used) { topics.filter { it in used } + topics.filter { it !in used } }
        val initial = if (ids.isEmpty()) settings.writeUps.toSet() else if (ids.size == 1) (byId[ids.first()]?.ups ?: emptyList()).toSet() else emptySet()
        UpsDialog(ordered, initial, target, onDismiss = { upsDialogIds = null }, onDone = { list ->
            if (ids.isEmpty()) {
                val assigned = target ?: UNASSIGNED
                val cleaned = list.distinct().filter { it.isNotEmpty() && it != assigned }
                settings = settings.copy(writeUps = cleaned, writeUpsByTopic = settings.writeUpsByTopic + (assigned to cleaned))
                store.saveSettings(settings)
            }
            else {
                val now = System.currentTimeMillis()
                for (k in entries.indices) if (entries[k].id in ids) entries[k] = entries[k].copy(ups = list.filter { it != entries[k].topic }, edited = now, exported = false)
                persist(); if (selecting) { selected.clear(); selecting = false }
            }
            upsDialogIds = null
        }, onCreate = { proposed ->
            val name = normalizedTopic(proposed.trim())
            if (name.isBlank() || name == target || name in topics || name in pcRecords || name in pcTopics ||
                name in setOf(ALL, DIARY, "全部", "全部表示", "未所属", "トピック未選択", "その他")) false
            else {
                settings = settings.copy(topics = settings.topics + name)
                store.saveSettings(settings)
                true
            }
        })
    }
    if (topicDialogFor != null || moveSelectedOpen) {
        val ids = topicDialogFor?.let { listOf(it) } ?: selected.toList()
        fun closeMove() { topicDialogFor = null; moveSelectedOpen = false }
        TopicDestinationDialog(topics, settings.topicModes, pcRecords,
            onDismiss = { closeMove() },
            onSelect = { t ->
                moveEntries(ids, t)
                if (moveSelectedOpen) { selected.clear(); selecting = false }
                closeMove()
            },
            onNew = { moveToNewTopic = ids; closeMove(); addTopicOpen = true },
            onCreateInline = { proposed ->
                val name = normalizedTopic(proposed.trim())
                if (name.isBlank() || name in topics || name in pcRecords || name in pcTopics ||
                    name in setOf(ALL, DIARY, "全部", "全部表示", "未所属", "トピック未選択", "その他")) false
                else {
                    settings = settings.copy(topics = settings.topics + name)
                    store.saveSettings(settings)
                    true
                }
            })
    }

    if (topicListOpen) {
        var q by remember { mutableStateOf("") }
        val list = topics.filter { it != DIARY && matchesQuery(it, q) }
        val sec = list.partition { settings.topicModes[it]?.record != true && it !in pcRecords }
        TopicPicker("トピック・時系列記録", emptyList(), listOf(TopicSection("トピック", sec.first), TopicSection("時系列記録", sec.second)), topic, topicCounts,
            onPick = { setTopic(it); topicListOpen = false }, onEdit = { topicListOpen = false; topicMenuFor = it },
            newLabel = "＋ 新しいトピック", onNew = { topicListOpen = false; addTopicOpen = true }, closeLabel = "閉じる",
            onDismiss = { topicListOpen = false }, query = q, onQuery = { q = it })
    }

    // トピックの取り込み方（スイッチ）: 1 つのノートにまとめる（時刻を付ける）・時系列記録。どちらもオフなら 1 件 = 1 ノート
    topicMenuFor?.let { t ->
        ModalBottomSheet(onDismissRequest = { topicMenuFor = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
                Text(t, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(bottom = 8.dp))
                val acts = buildList {
                    // PC から届いた時系列記録の名前は変えない・消さない（PC の記録と別物になってしまう）
                    if (t !in pcRecords) add(SheetAct(Icons.Filled.Edit, "名前を変える", "このトピックの名前を直す") { renameFor = t })
                    add(SheetAct(Icons.Filled.Settings, "取り込み方", "1 つのノートにまとめる・時刻など") { modeFor = t })
                    if (t !in pcRecords) add(SheetAct(Icons.Filled.Delete, "消す", "トピックとメモを消す", danger = true) { deleteTopicFor = t })
                }
                acts.forEach { a ->
                    val color = if (a.danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                    Row(Modifier.fillMaxWidth().heightIn(min = 68.dp).clip(RoundedCornerShape(14.dp))
                        .clickable { a.run(); topicMenuFor = null }.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(a.icon, null, Modifier.size(28.dp), tint = color)
                        Spacer(Modifier.width(16.dp))
                        Column {
                            Text(a.label, fontSize = 20.sp, fontWeight = FontWeight.Medium, color = color)
                            Text(a.hint, fontSize = 13.sp, color = MaterialTheme.colorScheme.outline)
                        }
                    }
                }
            }
        }
    }

    modeFor?.let { t ->
        val m = settings.topicModes[t] ?: TopicMode()
        fun save(n: TopicMode) { settings = settings.copy(topicModes = settings.topicModes + (t to n)); store.saveSettings(settings) }
        AlertDialog(onDismissRequest = { modeFor = null }, title = { Text("「$t」の取り込み方") },
            text = { ModeSwitches(t, m, pcRecords, ::save) },
            confirmButton = { TextButton(onClick = { modeFor = null }) { Text("閉じる") } })
    }

    deleteTopicFor?.let { name ->
        val n = entries.count { it.topic == name }
        AlertDialog(onDismissRequest = { deleteTopicFor = null }, title = { Text("トピック「$name」を消す") },
            text = { Text(if (n == 0) "このトピックのメモはありません。" else "このトピックのメモ（$n 件）は消さずに未所属へ移します。") },
            confirmButton = { TextButton(onClick = {
                deleteTopic(entries.toList(), settings, name)?.let { r ->
                    entries.clear(); entries.addAll(r.first); persist()
                    settings = r.second; store.saveSettings(settings)
                    if (topic == name) setTopic(ALL)
                }
                deleteTopicFor = null
            }) { Text("消す") } },
            dismissButton = { TextButton(onClick = { deleteTopicFor = null }) { Text("やめる") } })
    }

    renameFor?.let { from ->
        var name by remember(from) { mutableStateOf(from) }
        var err by remember(from) { mutableStateOf(false) }
        AlertDialog(onDismissRequest = { renameFor = null }, title = { Text("トピックの名前を変える") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(name, { name = it; err = false }, singleLine = true)
                Text("このトピックのメモ（${entries.count { it.topic == from }} 件）も新しい名前になります。", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
                if (err) Text("その名前にはできません（同じ名前のトピックがある・使えない名前）", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
            } },
            confirmButton = { TextButton(onClick = {
                val r = renameTopic(entries.toList(), settings, from, name)
                if (r == null) err = true
                else {
                    entries.clear(); entries.addAll(r.first); persist()
                    settings = r.second; store.saveSettings(settings)
                    if (topic == from) topic = normalizedTopic(name.trim())
                    renameFor = null
                }
            }) { Text("変える") } },
            dismissButton = { TextButton(onClick = { renameFor = null }) { Text("やめる") } })
    }

    // 日付を指定して書く（日付だけ。時刻は「今の時刻を入れる」で選ぶ）
    if (viewDate) {
        val st = rememberDatePickerState(initialSelectedDateMillis = localToUtcDay(System.currentTimeMillis()))
        DatePickerDialog(onDismissRequest = { viewDate = false },
            confirmButton = { TextButton(onClick = {
                viewDate = false
                st.selectedDateMillis?.let {
                    val from = utcDayToLocalMidnight(it); val to = from + 86_400_000L
                    val hit = visibleEntries(entries, topic).filter { e -> e.created in from until to }.maxByOrNull { e -> e.created }
                    if (hit != null) jumpTo(hit.id) else android.widget.Toast.makeText(ctx, "その日のメモはありません", android.widget.Toast.LENGTH_SHORT).show()
                }
            }) { Text("見る") } },
            dismissButton = { TextButton(onClick = { viewDate = false }) { Text("やめる") } }) {
            DatePicker(st)
        }
    }
    if (pickDate) {
        val st = rememberDatePickerState(initialSelectedDateMillis = (backdate ?: System.currentTimeMillis()).let { localToUtcDay(it) })
        DatePickerDialog(onDismissRequest = { pickDate = false },
            confirmButton = { TextButton(onClick = {
                pickDate = false
                st.selectedDateMillis?.let {
                    val day = utcDayToLocalMidnight(it)
                    val today = utcDayToLocalMidnight(localToUtcDay(System.currentTimeMillis()))
                    backdate = if (day >= today) null else day   // 今日と先の日は「今日」のまま
                }
            }) { Text("決定") } },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("やめる") } }) {
            DatePicker(st)
        }
    }

    if (addTopicOpen) {
        var name by remember { mutableStateOf("") }
        var m by remember { mutableStateOf(TopicMode()) }
        AlertDialog(onDismissRequest = { addTopicOpen = false; moveToNewTopic = emptyList() },
            title = { Text("トピックを足す") },
            text = { Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(name, { name = it }, singleLine = true, placeholder = { Text("例: アイデア") })
                // 時系列記録は PC にある名前から選ぶ（表記揺れで別々の記録にならないように）
                if (m.record && pcRecords.isNotEmpty()) {
                    Text("PC の時系列記録から選ぶ", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
                    pcRecords.forEach { r ->
                        FilterChip(selected = name == r, onClick = { name = r }, label = { Text(r) })
                    }
                }
                ModeSwitches(name.ifBlank { "トピック" }, m, pcRecords) { m = it }
            } },
            confirmButton = { TextButton(onClick = {
                val t = normalizedTopic(name.trim()).takeUnless { it == ALL || it == "全部" || it == "全部表示" || it == "未所属" || it == "トピック未選択" || it == "その他" } ?: ""
                if (t.isNotEmpty() && t !in settings.topics) { settings = settings.copy(topics = settings.topics + t); store.saveSettings(settings) }
                if (t.isNotEmpty() && t != DIARY && (m.single || m.record)) { settings = settings.copy(topicModes = settings.topicModes + (t to m)); store.saveSettings(settings) }
                if (t.isNotEmpty()) {
                    if (moveToNewTopic.isNotEmpty()) {
                        moveEntries(moveToNewTopic, t)
                        selected.clear(); selecting = false
                    }
                    setTopic(t)
                }
                moveToNewTopic = emptyList()
                addTopicOpen = false
            }) { Text("足す") } },
            dismissButton = { TextButton(onClick = { addTopicOpen = false; moveToNewTopic = emptyList() }) { Text("やめる") } })
    }

    // 文脈・親の編集（長押し →「文脈・親を編集」）
    relEditFor?.let { id ->
        val e = entries.firstOrNull { it.id == id }
        if (e == null) { relEditFor = null; return@let }
        AlertDialog(onDismissRequest = { relEditFor = null }, title = { Text("返信先を編集") },
            text = { Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(short(e.text, 40), fontSize = 13.sp, color = MaterialTheme.colorScheme.outline)
                Text("返信先（${e.contexts.size}）", fontWeight = FontWeight.Bold)
                e.contexts.forEach { c ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(short(byId[c]?.text ?: "（書き出し済み）", 28), Modifier.weight(1f))
                        IconButton(onClick = { removeContext(id, c) }) { Icon(Icons.Filled.Close, "外す") }
                    }
                }
                OutlinedButton(onClick = { pick = Pick("context", id) }, modifier = Modifier.fillMaxWidth()) { Text("＋ 返信先を追加（探す）") }
            } },
            confirmButton = { TextButton(onClick = { relEditFor = null }) { Text("閉じる") } })
    }

    // メモを探して選ぶ（リンク・文脈は複数、親は 1 つ）
    pick?.let { p ->
        PickDialog(entries = entries, kind = p.kind, exclude = setOfNotNull(p.forId),
            onDismiss = { pick = null },
            onDone = { ids ->
                pick = null
                val target = p.forId
                when (p.kind) {
                    "link" -> {
                        appendInput(ids.joinToString(" ") { id -> "[" + linkLabel(byId[id]?.text ?: "") + "](memo:" + id + ")" }, false)
                        focusTick++
                    }
                    "context" -> if (target != null) addContexts(target, ids) else ids.forEach { if (it !in contextsTo) contextsTo.add(it) }
                    "parent" -> ids.firstOrNull()?.let { if (target != null) setParent(target, it) else replyTo = it }
                    "outline" -> ids.firstOrNull()?.let { id ->
                        // メモに見出し（# の行）があれば見出しを選ぶ。無ければメモそのもの（PC で 1 つのノートにまとめると、そのメモの見出しの節を指す）
                        if (memoHeadings(byId[id]?.text ?: "").isEmpty()) { appendInput("[" + linkLabel(byId[id]?.text ?: "") + "](memo:" + id + ")", false); focusTick++ }
                        else outlineFor = id
                    }
                }
            })
    }

    // アウトライン引用: メモの見出しを選んで [題#見出し](memo:ID#見出し) を入れる
    outlineFor?.let { id ->
        val e = byId[id]
        if (e == null) { outlineFor = null; return@let }
        AlertDialog(onDismissRequest = { outlineFor = null }, title = { Text("引用する見出し") },
            text = { Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                TextButton(onClick = { outlineFor = null; appendInput("[" + linkLabel(e.text) + "](memo:" + id + ")", false); focusTick++ }) { Text("（メモ全体）") }
                memoHeadings(e.text).forEach { h ->
                    TextButton(onClick = { outlineFor = null; appendInput("[" + linkLabel(e.text) + "#" + h + "](memo:" + id + "#" + h.replace(Regex("\\s+"), "-") + ")", false); focusTick++ }) { Text("# $h") }
                }
            } },
            confirmButton = { TextButton(onClick = { outlineFor = null }) { Text("やめる") } })
    }

    if (deleteSelectedOpen) {
        AlertDialog(onDismissRequest = { deleteSelectedOpen = false }, title = { Text("${selected.size} 件を消しますか？") },
            text = { Text(run { val n = selected.count { it !in imported }; "画像も消えます。元に戻せません。" + if (n > 0) "\nまだ PC に取り込んでいない $n 件も、消えます。" else "スマホの中からだけ消えます。" }) },
            confirmButton = { TextButton(onClick = {
                deleteEntries(selected.toSet()); selected.clear(); selecting = false; deleteSelectedOpen = false
            }) { Text("消す") } },
            dismissButton = { TextButton(onClick = { deleteSelectedOpen = false }) { Text("やめる") } })
    }

    deleteFor?.let { id ->
        AlertDialog(onDismissRequest = { deleteFor = null }, title = { Text("消しますか？") },
            text = { Text(short(byId[id]?.text ?: "", 80)) },
            confirmButton = { TextButton(onClick = {
                deleteEntries(setOf(id)); deleteFor = null
            }) { Text("消す") } },
            dismissButton = { TextButton(onClick = { deleteFor = null }) { Text("やめる") } })
    }

    if (settingsOpen) {
        var on by remember { mutableStateOf(settings.alarmOn) }
        var minutes by remember { mutableStateOf(settings.alarmMinutes.toString()) }
        var from by remember { mutableStateOf(settings.fromHour.toString()) }
        var to by remember { mutableStateOf(settings.toHour.toString()) }
        var allDay by remember { mutableStateOf(settings.fromHour == settings.toHour || (settings.fromHour == 0 && settings.toHour == 24)) }
        var ring by remember { mutableStateOf(settings.ringSeconds.toString()) }
        var stamp by remember { mutableStateOf(settings.writtenStamp) }
        AlertDialog(onDismissRequest = { settingsOpen = false }, title = { Text("アラームと設定") },
            text = { Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val pkgInfo=remember(ctx) { ctx.packageManager.getPackageInfo(ctx.packageName,0) }
                val installedVersion=pkgInfo.versionName ?: "不明"
                @Suppress("DEPRECATION") val installedCode=if(Build.VERSION.SDK_INT>=28) pkgInfo.longVersionCode else pkgInfo.versionCode.toLong()
                Text("YuriiNote Android v$installedVersion（ビルド $installedCode）",fontWeight=FontWeight.Medium)
                Text("最新版の状態：未確認（インストール済みの番号は上に表示）",fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick={
                    ctx.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/Yurii7812/YuriiNote/releases")))
                }) { Text("GitHubのリリースを確認") }
                HorizontalDivider()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("定期的に鳴らす", Modifier.weight(1f)); Switch(on, { on = it })
                }
                OutlinedTextField(minutes, { minutes = it.filter(Char::isDigit) }, label = { Text("何分おき") }, singleLine = true,
                    enabled = on, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("24時間鳴らす", Modifier.weight(1f), color = if (on) Color.Unspecified else MaterialTheme.colorScheme.outline)
                    Switch(allDay, {
                        allDay = it
                        // 24時間をやめたら、時間帯を普段の値で入れておく
                        if (!it && (from == to || (from == "0" && to == "24"))) { from = "9"; to = "23" }
                    }, enabled = on)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(from, { from = it.filter(Char::isDigit) }, label = { Text("何時から") }, singleLine = true, enabled = on && !allDay,
                        modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(to, { to = it.filter(Char::isDigit) }, label = { Text("何時まで") }, singleLine = true, enabled = on && !allDay,
                        modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                }
                OutlinedTextField(ring, { ring = it.filter(Char::isDigit).take(3) }, label = { Text("鳴らす長さ（秒・0 で 1 回だけ）") }, singleLine = true,
                    enabled = on, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                Text("鳴らす長さのあいだ音を繰り返します（通知を押す・アプリを開くと止まります）。最長 600 秒。", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
                Text("鳴ったら通知を押すと「今まで何してた？」が日記で開きます。", fontSize = 13.sp)
                if (on && !allDay && from == to) Text("開始と終了が同じ場合も24時間鳴らします。", fontSize = 13.sp)
                if (settings.alarmOn && nextAlarm > 0) Text("次回: " + SimpleDateFormat("M/d HH:mm", Locale.JAPAN).format(Date(nextAlarm)), fontSize = 13.sp)
                if (!notificationsEnabled) Text("通知が許可されていません。「通知と音の設定」で許可してください。", fontSize = 13.sp)
                TextButton(onClick = {
                    val action = if (NotificationManagerCompat.from(ctx).areNotificationsEnabled()) AndroidSettings.ACTION_CHANNEL_NOTIFICATION_SETTINGS else AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS
                    ctx.startActivity(Intent(action).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, ctx.packageName).putExtra(AndroidSettings.EXTRA_CHANNEL_ID, Alarm.CHANNEL))
                }) { Text("通知と音の設定") }
                if (!exactEnabled && Build.VERSION.SDK_INT >= 31) {
                    Text("時刻どおりに鳴らすには「アラームとリマインダー」を許可してください。未許可では遅れる場合があります。", fontSize = 13.sp)
                    TextButton(onClick = { ctx.startActivity(Intent(AndroidSettings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}"))) }) { Text("アラームの時刻を許可") }
                }
                TextButton(onClick = {
                    if (Build.VERSION.SDK_INT >= 33 && !Alarm.hasNotificationPermission(ctx)) askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
                    else Alarm.notify(ctx, (ring.toIntOrNull() ?: 0).coerceIn(0, 600))
                }) { Text("テスト通知を鳴らす") }
                HorizontalDivider()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("日付を指定したときも今の時刻を入れる")
                        Text("日記・時系列記録で日付を指定して書いたとき、PC では今の時刻が付き、本文の最初に「（今日の日付 に記入）」が入ります。オフなら時刻は付きません（書く画面の上でも切り替えられます）。", fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
                    }
                    Switch(stamp, { stamp = it })
                }
                HorizontalDivider()
            } },
            confirmButton = { TextButton(onClick = {
                settings = settings.copy(alarmOn = on, alarmMinutes = (minutes.toIntOrNull() ?: 60).coerceIn(1, 24 * 60),
                    fromHour = if (allDay) 0 else (from.toIntOrNull() ?: 9).coerceIn(0, 23),
                    toHour = if (allDay) 24 else (to.toIntOrNull() ?: 23).coerceIn(0, 24),
                    ringSeconds = (ring.toIntOrNull() ?: 0).coerceIn(0, 600), writtenStamp = stamp)
                store.saveSettings(settings)
                if (on && Build.VERSION.SDK_INT >= 33 && !Alarm.hasNotificationPermission(ctx)) askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
                Alarm.ensureChannel(ctx); Alarm.schedule(ctx, settings)
                nextAlarm = Alarm.scheduledTime(ctx)
                settingsOpen = false
            }) { Text("保存") } },
            dismissButton = { TextButton(onClick = { settingsOpen = false }) { Text("閉じる") } })
    }
}

/** 取り込み方のスイッチ。「1 つのノートにまとめる」と「時系列記録」はどちらか一方（両方オフなら 1 件 = 1 ノート）。 */
@Composable
private fun ModeSwitches(t: String, m: TopicMode, pcRecords: List<String>, save: (TopicMode) -> Unit) {
    val muted = MaterialTheme.colorScheme.outline
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("1 つのノートにまとめる")
                Text("PC に取り込むと「$t」のノートに追記します。ほかのメモから使われた（リンク・文脈・続き）メモは「## 本文の始め」の見出しの節になり、そこへのリンクになります。",
                    fontSize = 12.sp, color = muted)
            }
            Switch(m.single, { save(m.copy(single = it, record = if (it) false else m.record)) })
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 16.dp)) {
            Column(Modifier.weight(1f)) {
                Text("時刻を付ける", color = if (m.single) Color.Unspecified else muted)
                Text("各メモの頭に「時:分」。日が替わったときだけ日付の見出し。", fontSize = 12.sp, color = muted)
            }
            Switch(m.stamp, { save(m.copy(stamp = it)) }, enabled = m.single)
        }
        HorizontalDivider()
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("時系列記録")
                Text("日記のように、その日のノート（例: 2026-10-19-MO-$t）に時刻つきで入ります。PC で同じ日に書いた分と時刻の順にまざります。",
                    fontSize = 12.sp, color = muted)
            }
            Switch(m.record, { save(m.copy(record = it, single = if (it) false else m.single)) })
        }
        if (m.record && t !in pcRecords)
            Text(if (pcRecords.isEmpty()) "時系列記録の名前は、PC から届くと、ここに出ます。"
                else "PC にまだ無い名前です（PC では新しい時系列記録になります）。PC にあるもの: " + pcRecords.joinToString("・"),
                fontSize = 12.sp, color = MaterialTheme.colorScheme.secondary)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MemoSwipe(enabled: Boolean, onContext: () -> Unit, onBranch: () -> Unit, content: @Composable () -> Unit) {
    val currentContext by rememberUpdatedState(onContext)
    val currentBranch by rememberUpdatedState(onBranch)
    val swipe = rememberSwipeToDismissBoxState(confirmValueChange = { value ->
        when (value) {
            SwipeToDismissBoxValue.StartToEnd -> currentContext()
            SwipeToDismissBoxValue.EndToStart -> currentBranch()
            else -> {}
        }
        false
    })
    SwipeToDismissBox(swipe, enableDismissFromStartToEnd = enabled, enableDismissFromEndToStart = false,
        backgroundContent = {
            val toRight = swipe.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            val toLeft = swipe.dismissDirection == SwipeToDismissBoxValue.EndToStart
            Row(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = if (toLeft) Arrangement.End else Arrangement.Start) {
                if (toRight) { Icon(Icons.Filled.Link, null, tint = MaterialTheme.colorScheme.tertiary); Spacer(Modifier.width(6.dp)); Text("返信", color = MaterialTheme.colorScheme.tertiary) }
            }
        }) { content() }
}

@Composable
private fun TopicDestinationDialog(topics: List<String>, modes: Map<String, TopicMode>, records: List<String>,
    onDismiss: () -> Unit, onSelect: (String) -> Unit, onNew: () -> Unit, onCreateInline: (String) -> Boolean) {
    var query by remember { mutableStateOf("") }
    val matched = remember(topics, query) { topics.filter { matchesQuery(topicLabel(it), query) } }
    val sec = matched.partition { it != DIARY && modes[it]?.record != true && it !in records }
    TopicPicker("移動先を選ぶ", if (matchesQuery(topicLabel(UNASSIGNED), query)) listOf(UNASSIGNED) else emptyList(),
        listOf(TopicSection("トピック", sec.first), TopicSection("日記・時系列記録", sec.second)), null, emptyMap(),
        onPick = onSelect, onEdit = null, newLabel = "＋ 新しいトピックを作って移動", onNew = onNew, closeLabel = "やめる",
        onDismiss = onDismiss, query = query, onQuery = { query = it }, onCreateInline = onCreateInline)
}

/** 長押しのシートの 1 行分。 */
class SheetAct(val icon: ImageVector, val label: String, val hint: String, val danger: Boolean = false, val run: () -> Unit)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MemoSheet(state: MutableState<String?>, byId: Map<String, Entry>, actions: (Entry) -> List<SheetAct>, onAfter: () -> Unit) {
    val target = state.value?.let { byId[it] } ?: return
    ModalBottomSheet(onDismissRequest = { state.value = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Text(short(target.text, 40), fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(bottom = 8.dp))
            actions(target).forEach { a ->
                val color = if (a.danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                Row(Modifier.fillMaxWidth().heightIn(min = 68.dp).clip(RoundedCornerShape(14.dp))
                    .clickable { a.run(); state.value = null; onAfter() }.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Icon(a.icon, null, Modifier.size(28.dp), tint = color)
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text(a.label, fontSize = 20.sp, fontWeight = FontWeight.Medium, color = color)
                        Text(a.hint, fontSize = 13.sp, color = MaterialTheme.colorScheme.outline)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Bubble(e: Entry, done: Boolean, byId: Map<String, Entry>, store: Store, selecting: Boolean, selected: Boolean, selectionMode: Boolean,
                   open: Boolean, onToggleOpen: (() -> Unit)?, onTap: () -> Unit, onLong: () -> Unit, onJump: (String) -> Unit,
                   alignStart: Boolean = false) {
    val ctx = LocalContext.current
    // 日記も他のメモと同じ色（トピックは右下の小さな文字で分かる）
    // 吹き出し: やわらかい青、角は丸く（話している側の下の角だけ小さく）。取り込み済みは薄くして、目立たせない
    val colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else Color(0xFFEDF1FF))
    val shape = if (alignStart) RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp) else RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp)
    Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), horizontalArrangement = if (alignStart) Arrangement.Start else Arrangement.End) {
        Card(colors = colors, shape = shape, elevation = CardDefaults.cardElevation(0.dp),
            border = if (selected) androidx.compose.foundation.BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary) else if (selecting) androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant) else null,
            modifier = Modifier.widthIn(max = 340.dp).combinedClickable(onClick = onTap, onLongClick = onLong)) {   // 長押しの時間は MainActivity で短くしてある
            Column(Modifier.padding(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 7.dp)) {
                if (selectionMode) Checkbox(checked = selected, onCheckedChange = { onTap() })
                // 押すとそのメモへ飛ぶ
                e.contexts.forEach { c ->
                    Text("↩ " + short(byId[c]?.text ?: "（書き出し済み）", 20), fontSize = 12.sp, color = MaterialTheme.colorScheme.tertiary,
                        textDecoration = if (c in byId) TextDecoration.Underline else null,
                        modifier = if (c in byId) Modifier.clickable { onJump(c) }.padding(vertical = 2.dp) else Modifier)
                }
                e.images.forEach { name ->
                    if (isPicture(name)) AsyncImage(File(store.imageDir, name), null, Modifier.padding(vertical = 4.dp).heightIn(max = 220.dp).fillMaxWidth(),
                        contentScale = ContentScale.Fit)
                    else TextButton(onClick = { openSharedFile(ctx,store,name) }, Modifier.padding(vertical=4.dp)) {
                        Icon(Icons.Filled.AttachFile,null)
                        Text("ファイル: " + name.substringAfterLast('-'),maxLines=2)
                    }
                }
                if (e.text.isNotEmpty()) {
                    // [表示名](memo:ID) は表示名だけを下線つきで見せる。押して飛ぶのは下の「リンク:」の行。
                    // 見出し（# の行）は PC の Gnosis と同じ見出しの色
                    val linkColor = MaterialTheme.colorScheme.primary
                    val headColor = MaterialTheme.colorScheme.secondary
                    var overflow by remember { mutableStateOf(false) }
                    val annotated = remember(e.text, linkColor, headColor) { buildAnnotatedString {
                        e.text.split("\n").forEachIndexed { i, line ->
                            if (i > 0) append("\n")
                            val head = line.startsWith("#")
                            if (head) pushStyle(SpanStyle(color = headColor, fontWeight = FontWeight.Bold))
                            var last = 0
                            for (m in MEMO_LINK.findAll(line)) {
                                append(line.substring(last, m.range.first))
                                withStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)) { append(m.groupValues[1]) }
                                last = m.range.last + 1
                            }
                            append(line.substring(last))
                            if (head) pop()
                        }
                    } }
                    Text(annotated, fontSize = 16.sp, lineHeight = 24.sp, maxLines = if (open) Int.MAX_VALUE else 8, overflow = TextOverflow.Ellipsis,
                        onTextLayout = { if (!open) overflow = it.hasVisualOverflow })
                    // 長いメモは途中まで。「続きを見る」で開く（全部展開する設定なら最初から全部）
                    if (onToggleOpen != null && (overflow || open)) {
                        Text(if (open) "たたむ" else "続きを見る", fontSize = 13.sp, color = linkColor,
                            modifier = Modifier.clickable { onToggleOpen() }.padding(vertical = 4.dp))
                    }
                    val linkedIds = remember(e.text) { MEMO_LINK.findAll(e.text).map { it.groupValues[2] }.distinct().toList() }
                    linkedIds.forEach { id ->
                        Text("リンク: " + short(byId[id]?.text ?: "（書き出し済み）", 20), fontSize = 12.sp, color = MaterialTheme.colorScheme.primary,
                            textDecoration = if (id in byId) TextDecoration.Underline else null,
                            modifier = if (id in byId) Modifier.clickable { onJump(id) }.padding(vertical = 2.dp) else Modifier)
                    }
                }
                Row(Modifier.align(Alignment.End).padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    e.ups.forEach { u -> Text("↑" + topicLabel(u), fontSize = 10.sp, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 6.dp)) }   // 上のトピック
                    if (e.topic.isNotEmpty() && e.topic != ALL) {   // トピックは、小さな色つきのラベル
                        val hue = (e.topic.fold(7) { h, c -> (h * 31 + c.code) and 0xffff } % 360).toFloat()
                        Text(topicLabel(e.topic), fontSize = 10.sp, color = Color.hsv(hue, .55f, .55f),
                            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Color.hsv(hue, .12f, 1f)).padding(horizontal = 6.dp, vertical = 1.dp))
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(timeFmt.format(Date(e.created)) + if (e.edited > 0) "（編集）" else "", fontSize = 11.sp, color = MaterialTheme.colorScheme.outline)
                }
            }
        }
    }
}

/** 端末の時刻の日付を、DatePicker が使う UTC のその日 0 時に。 */
private fun localToUtcDay(t: Long): Long {
    val c = java.util.Calendar.getInstance().apply { timeInMillis = t }
    return java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply {
        clear(); set(c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH), c.get(java.util.Calendar.DAY_OF_MONTH))
    }.timeInMillis
}

/** DatePicker の UTC のその日 0 時を、端末の時刻のその日 0 時に。 */
private fun utcDayToLocalMidnight(utc: Long): Long {
    val u = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply { timeInMillis = utc }
    return java.util.Calendar.getInstance().apply {
        clear(); set(u.get(java.util.Calendar.YEAR), u.get(java.util.Calendar.MONTH), u.get(java.util.Calendar.DAY_OF_MONTH))
    }.timeInMillis
}
