package net.yurii.kasten

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items as gridItems
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** ライトテーマ（PC の YuriiKasten と同じ、白地に青） */
private val Light = lightColorScheme(
    primary = Color(0xFF3B5BDB), onPrimary = Color.White, primaryContainer = Color(0xFFE8EDFF), onPrimaryContainer = Color(0xFF1E2F7A),
    secondary = Color(0xFF2F9E44), tertiary = Color(0xFFC0392B),
    background = Color.White, onBackground = Color(0xFF2B2D33), surface = Color.White, onSurface = Color(0xFF2B2D33),
    surfaceVariant = Color(0xFFF3F4F8), onSurfaceVariant = Color(0xFF6B7080),
    surfaceContainer = Color(0xFFF6F7FB), surfaceContainerHigh = Color(0xFFEEF0F7), surfaceContainerLowest = Color.White,
    outline = Color(0xFFB4B9C8), outlineVariant = Color(0xFFE2E5EE),
)

class MainActivity : ComponentActivity() {
    private val promptState = mutableStateOf(false)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        promptState.value = intent?.getBooleanExtra(Alarm.EXTRA_PROMPT, false) == true
        setContent { MaterialTheme(colorScheme = Light) { Surface(Modifier.fillMaxSize()) { PkmApp(promptState) } } }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); if (intent.getBooleanExtra(Alarm.EXTRA_PROMPT, false)) promptState.value = true }
    override fun onResume() { super.onResume(); if (Alarm.takePrompt(this)) promptState.value = true }
}

// ===== 画面の状態 =====
sealed interface Screen {
    data class NoteView(val stem: String, val focus: Boolean = false) : Screen
    data class DiaryView(val date: String, val stamp: Boolean = false) : Screen
    data class KeywordView(val word: String) : Screen
}
private val TABS = listOf("💻" to "デジタル", "📜" to "紙", "📥" to "未整理")   // 一覧の絵文字タブ（Index は下のタブ）

/** アプリの状態（vault・同期・画面の移動） */
class AppState(val ctx: android.content.Context) {
    val vault = Vault(java.io.File(ctx.filesDir, "vault"))
    val store = Store(ctx)
    var version by mutableIntStateOf(0)          // vault が変わったら増やして、画面を組み直す
    var settings by mutableStateOf(store.loadSettings())
    var syncMsg by mutableStateOf("")
    var syncing by mutableStateOf(false)
    val stack = mutableStateListOf<Screen>()
    var tab by mutableStateOf(0)                 // 下のタブ: 0 ノート 1 日記 2 Index 3 設定
    var sub by mutableIntStateOf(0)              // ノート一覧の絵文字タブ
    var sort by mutableStateOf(Vault.Sort.FZ); var asc by mutableStateOf(true); var card by mutableStateOf(false)
    init { vault.load() }
    fun changed() { version++ }
    fun saveSettings(s: Settings) { settings = s; store.saveSettings(s) }
    suspend fun sync(quiet: Boolean = false) {
        val s = settings; if (s.serverUrl.isBlank() || syncing) return
        syncing = true
        try {
            val r = withContext(Dispatchers.IO) { VaultSync(vault.dir, s.serverUrl, s.serverToken, vault.lock).sync() }
            if (r.pulled + r.deleted + r.conflicts > 0) { withContext(Dispatchers.IO) { vault.load() }; changed() }
            syncMsg = if (quiet && r.pulled + r.pushed + r.deleted == 0) syncMsg.ifEmpty { "同期しました" } else "同期しました（取る ${r.pulled} / 送る ${r.pushed}${if (r.conflicts > 0) " / 競合 ${r.conflicts}" else ""}）"
        } catch (e: Exception) { syncMsg = "同期できません: ${e.message ?: e.javaClass.simpleName}" }
        finally { syncing = false }
    }
}

@Composable
fun PkmApp(prompt: MutableState<Boolean>) {
    val ctx = LocalContext.current
    val app = remember { AppState(ctx) }
    val scope = rememberCoroutineScope()
    val v = app.version   // 組み直しのきっかけ
    LaunchedEffect(Unit) { Alarm.ensureScheduled(ctx, app.settings); while (true) { app.sync(true); delay(60_000) } }
    LifecycleResumeEffect(Unit) { scope.launch { app.sync(true) }; onPauseOrDispose { } }
    // 通知から来たら、今日の日記を書き始める
    LaunchedEffect(prompt.value) { if (prompt.value) { prompt.value = false; app.stack.clear(); app.stack.add(Screen.DiaryView(Fmt.dayOf(), true)) } }
    val askNotif = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) { if (Build.VERSION.SDK_INT >= 33 && !Alarm.hasNotificationPermission(ctx)) askNotif.launch(Manifest.permission.POST_NOTIFICATIONS) }
    BackHandler(app.stack.isNotEmpty()) { app.stack.removeAt(app.stack.size - 1) }

    val top = app.stack.lastOrNull()
    Box(Modifier.fillMaxSize().systemBarsPadding().imePadding()) {
        when (top) {
            is Screen.NoteView -> NoteScreen(app, top)
            is Screen.DiaryView -> DiaryScreen(app, top)
            is Screen.KeywordView -> KeywordScreen(app, top)
            null -> HomeScreen(app)
        }
    }
    if (v < 0) Text("")
}

// ===== ホーム（下のタブ）=====
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(app: AppState) {
    val scope = rememberCoroutineScope()
    var fab by remember { mutableStateOf(false) }
    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                listOf("📝" to "ノート", "📔" to "日記", "🔖" to "Index", "⚙️" to "設定").forEachIndexed { i, (e, l) ->
                    NavigationBarItem(selected = app.tab == i, onClick = { app.tab = i }, icon = { Text(e, fontSize = 22.sp) }, label = { Text(l, fontSize = 11.sp) })
                }
            }
        },
        floatingActionButton = {
            if (app.tab == 0 || app.tab == 1) Box {
                FloatingActionButton(onClick = {
                    if (app.tab == 1) app.stack.add(Screen.DiaryView(Fmt.dayOf(), true)) else fab = true
                }, containerColor = MaterialTheme.colorScheme.primary) { Icon(Icons.Default.Add, "新規", tint = Color.White) }
                DropdownMenu(expanded = fab, onDismissRequest = { fab = false }) {
                    DropdownMenuItem(text = { Text("📥 IDなしのノート（すぐ書く）") }, onClick = { fab = false; val n = app.vault.create(null); app.changed(); app.stack.add(Screen.NoteView(n.stem, true)) })
                    DropdownMenuItem(text = { Text("📔 今日の日記") }, onClick = { fab = false; app.stack.add(Screen.DiaryView(Fmt.dayOf(), true)) })
                }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (app.tab) { 0 -> NoteList(app); 1 -> DiaryList(app); 2 -> IndexList(app); else -> SettingsScreen(app) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun NoteList(app: AppState) {
    val v = app.version; var q by remember { mutableStateOf("") }; var sortMenu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val base = app.vault.search(q)
    val list = app.vault.sorted(when (app.sub) { 0 -> base.filter { !it.paper && !it.noid }; 1 -> base.filter { it.paper && !it.noid }; else -> base.filter { it.noid } },
        if (app.sub == 2 && app.sort == Vault.Sort.FZ) Vault.Sort.CREATED else app.sort, app.asc)
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(q, { q = it }, Modifier.weight(1f), singleLine = true, placeholder = { Text("探す") }, shape = RoundedCornerShape(24.dp),
                leadingIcon = { Icon(Icons.Default.Search, null) })
            IconButton(onClick = { scope.launch { app.sync() } }) { if (app.syncing) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Icon(Icons.Default.Sync, "同期") }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TABS.forEachIndexed { i, (e, l) ->
                val n = when (i) { 0 -> app.vault.notes.count { !it.paper && !it.noid }; 1 -> app.vault.notes.count { it.paper && !it.noid }; else -> app.vault.notes.count { it.noid } }
                Box(Modifier.clip(RoundedCornerShape(10.dp)).background(if (app.sub == i) MaterialTheme.colorScheme.primaryContainer else Color.Transparent).clickable { app.sub = i }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                    Text(if (n > 0) "$e $n" else e, fontSize = 18.sp)
                }
            }
            Spacer(Modifier.weight(1f))
            Box {
                TextButton(onClick = { sortMenu = true }) { Text(when (app.sort) { Vault.Sort.FZ -> "番号順"; Vault.Sort.CREATED -> "作成順"; Vault.Sort.UPDATED -> "更新順" }) }
                DropdownMenu(sortMenu, { sortMenu = false }) {
                    listOf(Vault.Sort.FZ to "番号順", Vault.Sort.CREATED to "作成順", Vault.Sort.UPDATED to "更新順").forEach { (s, l) -> DropdownMenuItem(text = { Text(l) }, onClick = { app.sort = s; sortMenu = false }) }
                }
            }
            IconButton(onClick = { app.asc = !app.asc }) { Icon(if (app.asc) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward, if (app.asc) "昇順" else "降順") }
            IconButton(onClick = { app.card = !app.card }) { Icon(if (app.card) Icons.Default.ViewList else Icons.Default.GridView, "一覧・カード") }
        }
        if (app.syncMsg.isNotEmpty()) Text(app.syncMsg, Modifier.padding(horizontal = 16.dp), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (list.isEmpty()) Box(Modifier.fillMaxSize().padding(32.dp), Alignment.Center) { Text(if (app.vault.notes.isEmpty()) "ノートはまだありません。右下の＋で書き始めます。\n設定で同期サーバーをつなぐと、PC のノートが入ります。" else "見つかりません", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
        else if (app.card) LazyVerticalStaggeredGrid(StaggeredGridCells.Fixed(2), Modifier.fillMaxSize().padding(horizontal = 8.dp), verticalItemSpacing = 8.dp, horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(bottom = 90.dp)) {
            gridItems(list, key = { it.stem }) { n -> NoteCard(app, n) }
        }
        else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 90.dp)) {
            items(list, key = { it.stem }) { n -> NoteRow(app, n) }
        }
    }
    if (v < 0) Text("")
}

@Composable
fun NoteRow(app: AppState, n: Note) {
    Column(Modifier.fillMaxWidth().clickable { app.stack.add(Screen.NoteView(n.stem)) }.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(n.heading, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        Text(listOf(if (n.noid) "IDなし ${n.created.drop(5).take(11)}" else n.label, n.keywords.joinToString("・")).filter { it.isNotEmpty() }.joinToString(" · "), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
}

/** Google Keep 風のカード。長いときは途中まで。「続きを見る」でその場で全部、押すと開いて編集 */
@Composable
fun NoteCard(app: AppState, n: Note) {
    var open by remember { mutableStateOf(false) }
    val lines = n.body.lines().filter { it.isNotBlank() && it.trim() != n.title }.map { it.trim().trimStart('#').trim() }
    val text = lines.joinToString("\n"); val long = text.length > 140 || lines.size > 6
    Card(Modifier.fillMaxWidth().clickable { app.stack.add(Screen.NoteView(n.stem)) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), elevation = CardDefaults.cardElevation(1.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(n.heading, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = if (open) 6 else 2, overflow = TextOverflow.Ellipsis)
            val shown = if (open || !long) text else lines.take(6).joinToString("\n").take(140) + "…"
            if (shown.isNotEmpty()) Text(shown, Modifier.padding(top = 4.dp), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = .8f))
            if (long) Text(if (open) "閉じる ▴" else "続きを見る ▾", Modifier.clickable { open = !open }.padding(vertical = 6.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
            Text(listOf(if (n.noid) "IDなし" else n.label, n.keywords.joinToString("・")).filter { it.isNotEmpty() }.joinToString(" · "), Modifier.padding(top = 4.dp), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ===== ノート =====
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun NoteScreen(app: AppState, s: Screen.NoteView) {
    val v = app.version; val scope = rememberCoroutineScope()
    val note = app.vault.byStem(s.stem)
    if (note == null) { LaunchedEffect(Unit) { app.stack.removeAll { it is Screen.NoteView && it.stem == s.stem } }; return }
    var title by remember(s.stem) { mutableStateOf(note.title) }
    var tv by remember(s.stem) { mutableStateOf(TextFieldValue(note.body)) }
    var kws by remember(s.stem) { mutableStateOf(note.keywords) }
    var editing by remember(s.stem) { mutableStateOf(s.focus || note.body.isBlank()) }
    var menu by remember { mutableStateOf(false) }; var idDialog by remember { mutableStateOf(false) }; var kwDialog by remember { mutableStateOf(false) }; var del by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf("") }
    val canEdit = note.editable
    fun cur() = app.vault.byStem(s.stem) ?: note
    fun commit() { val c = cur(); if (canEdit && (c.title != title || c.body != tv.text || c.keywords != kws)) { app.vault.save(c.copy(title = title.trim(), body = tv.text, keywords = kws)); app.changed() } }
    // 書いたら、少し待って保存して、同期する
    LaunchedEffect(title, tv.text, kws) { if (canEdit && (cur().title != title || cur().body != tv.text || cur().keywords != kws)) { delay(700); commit(); delay(800); app.sync(true) } }
    DisposableEffect(s.stem) { onDispose { commit() } }

    fun go(n: Note) { commit(); app.stack.add(Screen.NoteView(n.stem)) }
    fun newRelative(child: Boolean) {
        commit(); val id = note.id ?: return
        val nid = app.vault.freeId(if (child) Ids.child(id) else Ids.sibling(id), note.paper)
        val n = app.vault.create(nid, note.paper); app.changed(); app.stack.add(Screen.NoteView(n.stem, true))
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(if (note.noid) "IDなし" else note.label, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { idDialog = true }) },
            navigationIcon = { IconButton(onClick = { commit(); app.stack.removeAt(app.stack.size - 1) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "戻る") } },
            actions = {
                if (canEdit) IconButton(onClick = { editing = !editing }) { Icon(if (editing) Icons.Default.Visibility else Icons.Default.Edit, if (editing) "読む" else "書く") }
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "メニュー") }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(text = { Text(if (note.noid) "IDを付ける" else "IDを変える") }, onClick = { menu = false; idDialog = true })
                        if (!note.noid) DropdownMenuItem(text = { Text("IDを消す（IDなしにする）") }, onClick = { menu = false; commit(); app.vault.setId(cur(), null); app.changed(); msg = "IDを消しました" })
                        DropdownMenuItem(text = { Text("キーワードを足す") }, onClick = { menu = false; kwDialog = true })
                        DropdownMenuItem(text = { Text("削除") }, onClick = { menu = false; del = true })
                    }
                }
            })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            if (canEdit) BasicTextField(title, { title = it }, Modifier.fillMaxWidth().padding(vertical = 6.dp), textStyle = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface), singleLine = true,
                decorationBox = { inner -> Box { if (title.isEmpty()) Text("タイトル", fontSize = 22.sp, color = MaterialTheme.colorScheme.outline); inner() } })
            else Text(note.heading, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text(listOfNotNull(note.created.takeIf { it.isNotEmpty() }, if (note.paper) "紙" else null, if (!canEdit) "（${note.kind} はスマホでは読むだけ）" else null).joinToString("　"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!note.noid && canEdit) Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = { newRelative(false) }, label = { Text("＋ 並列 ${app.vault.freeId(Ids.sibling(note.id!!), note.paper)}") })
                AssistChip(onClick = { newRelative(true) }, label = { Text("＋ 分岐 ${app.vault.freeId(Ids.child(note.id!!), note.paper)}") })
            }
            if (editing && canEdit) {
                BasicTextField(tv, { tv = it }, Modifier.fillMaxWidth().heightIn(min = 240.dp).padding(vertical = 8.dp), textStyle = TextStyle(fontSize = 16.sp, lineHeight = 26.sp, color = MaterialTheme.colorScheme.onSurface),
                    decorationBox = { inner -> Box { if (tv.text.isEmpty()) Text("ここに書く。:1a と書くとリンクになります", color = MaterialTheme.colorScheme.outline, fontSize = 16.sp); inner() } })
                if (!note.noid) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {   // PC の Ctrl+i: 書いている場所に、分岐・並列の :ID を書く
                    val pending = Links.refs(tv.text).map { it.id }.toSet()
                    fun ins(id: String) { val a = tv.selection.min; val t = tv.text.substring(0, a) + ":" + id + tv.text.substring(tv.selection.max); tv = TextFieldValue(t, androidx.compose.ui.text.TextRange(a + id.length + 1)) }
                    SuggestionChip(onClick = { ins(app.vault.freeId(Ids.child(note.id!!), note.paper, pending)) }, label = { Text(":分岐の ID を書く") })
                    SuggestionChip(onClick = { ins(app.vault.freeId(Ids.sibling(note.id!!), note.paper, pending)) }, label = { Text(":並列の ID を書く") })
                }
            } else {
                val text = if (canEdit) tv.text else note.body
                val ann = linked(text, app.vault, note.paper)
                ClickableText(ann, Modifier.fillMaxWidth().padding(vertical = 8.dp), style = TextStyle(fontSize = 16.sp, lineHeight = 26.sp, color = MaterialTheme.colorScheme.onSurface)) { off ->
                    ann.getStringAnnotations("id", off, off).firstOrNull()?.let { a ->
                        val t = app.vault.get(a.item, note.paper)
                        if (t != null) go(t) else { commit(); val n = app.vault.create(a.item, note.paper); app.changed(); app.stack.add(Screen.NoteView(n.stem, true)) }   // まだ無い ID を押すと、作る
                    }
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 12.dp)) {
                kws.forEach { k -> InputChip(selected = false, onClick = { app.stack.add(Screen.KeywordView(k)) }, label = { Text(k) }, trailingIcon = { Icon(Icons.Default.Close, "外す", Modifier.size(16.dp).clickable { if (canEdit) kws = kws - k }) }) }
                AssistChip(onClick = { kwDialog = true }, label = { Text("＋ キーワード") })
            }
            val par = app.vault.parentOf(note); val kids = app.vault.childrenOf(note); val back = app.vault.backlinks(note)
            if (par != null || kids.isNotEmpty() || back.isNotEmpty()) {
                HorizontalDivider(Modifier.padding(vertical = 14.dp))
                par?.let { Text("↑ 親", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); RelRow(it) { go(it) } }
                if (kids.isNotEmpty()) { Text("↓ 分岐", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp)); kids.forEach { RelRow(it) { go(it) } } }
                if (back.isNotEmpty()) { Text("← このノートへのリンク", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp)); back.forEach { RelRow(it) { go(it) } } }
            }
            if (msg.isNotEmpty()) Text(msg, Modifier.padding(top = 8.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.height(80.dp))
        }
    }
    if (idDialog) TextDialog("ID（例: 1a2）", note.id.orEmpty(), "IDを入れる", { idDialog = false }) { x -> commit(); val r = app.vault.setId(cur(), x.trim().lowercase().ifEmpty { null }); if (r == null) msg = "そのIDは使えません（形が違うか、すでにあります）" else { app.changed(); msg = "IDを変えました" }; idDialog = false }
    if (kwDialog) TextDialog("キーワード", "", "足す", { kwDialog = false }) { x -> val k = x.trim(); if (k.isNotEmpty() && k !in kws) kws = kws + k; kwDialog = false }
    if (del) AlertDialog(onDismissRequest = { del = false }, title = { Text("このノートを削除しますか？") }, text = { Text("ゴミ箱（.trash）に移ります。") },
        confirmButton = { TextButton(onClick = { del = false; app.vault.delete(cur()); app.changed(); app.stack.removeAt(app.stack.size - 1); scope.launch { app.sync(true) } }) { Text("削除") } },
        dismissButton = { TextButton(onClick = { del = false }) { Text("やめる") } })
    if (v < 0) Text("")
}

@Composable private fun RelRow(n: Note, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(n.label, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium, modifier = Modifier.width(64.dp)); Text(n.heading, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** 本文の :ID を、押せるリンクに（無い ID は赤） */
fun linked(text: String, vault: Vault, paper: Boolean): AnnotatedString = buildAnnotatedString {
    var last = 0
    for (r in Links.refs(text)) {
        append(text.substring(last, r.from))
        val ok = vault.get(r.id, paper) != null
        pushStringAnnotation("id", r.id)
        withStyle(SpanStyle(color = if (ok) Color(0xFF3B5BDB) else Color(0xFFC0392B), textDecoration = TextDecoration.Underline)) { append(text.substring(r.from, r.to)) }
        pop(); last = r.to
    }
    append(text.substring(last))
}

@Composable
fun TextDialog(label: String, initial: String, ok: String, onDismiss: () -> Unit, onOk: (String) -> Unit) {
    var t by remember { mutableStateOf(initial) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(label) }, text = { OutlinedTextField(t, { t = it }, singleLine = true) },
        confirmButton = { TextButton(onClick = { onOk(t) }) { Text(ok) } }, dismissButton = { TextButton(onClick = onDismiss) { Text("やめる") } })
}

// ===== Index（キーワード）=====
@Composable
fun IndexList(app: AppState) {
    val v = app.version; val kws = app.vault.keywords()
    if (kws.isEmpty()) Box(Modifier.fillMaxSize(), Alignment.Center) { Text("ノートにキーワードを付けると、ここに並びます", color = MaterialTheme.colorScheme.onSurfaceVariant) }
    else LazyColumn(Modifier.fillMaxSize()) {
        items(kws, key = { it.first }) { (k, ns) ->
            Column(Modifier.fillMaxWidth().clickable { app.stack.add(Screen.KeywordView(k)) }.padding(horizontal = 16.dp, vertical = 10.dp)) {
                Text(k, fontWeight = FontWeight.Medium, fontSize = 16.sp)
                Text(ns.sortedWith(compareBy(Ids.cmp) { it.id ?: "~" }).joinToString("  ") { it.label.ifEmpty { "IDなし" } }, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
        }
    }
    if (v < 0) Text("")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KeywordScreen(app: AppState, s: Screen.KeywordView) {
    val ns = app.vault.notes.filter { s.word in it.keywords }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("🔖 ${s.word}") }, navigationIcon = { IconButton(onClick = { app.stack.removeAt(app.stack.size - 1) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "戻る") } })
        LazyColumn { items(app.vault.sorted(ns, Vault.Sort.FZ, true), key = { it.stem }) { n -> NoteRow(app, n) } }
    }
}

// ===== 日記 =====
@Composable
fun DiaryList(app: AppState) {
    val v = app.version
    val today = Fmt.dayOf()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 90.dp)) {
        if (app.vault.diary(today) == null) item { Row(Modifier.fillMaxWidth().clickable { app.stack.add(Screen.DiaryView(today, true)) }.padding(16.dp)) { Text("📔 今日の日記を書く（$today）", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium) } }
        items(app.vault.diaries, key = { it.date }) { d ->
            Column(Modifier.fillMaxWidth().clickable { app.stack.add(Screen.DiaryView(d.date)) }.padding(horizontal = 16.dp, vertical = 10.dp)) {
                Text(d.date + (if (d.title.isNotEmpty()) "  ${d.title}" else ""), fontWeight = FontWeight.Medium)
                Text(d.body.lineSequence().firstOrNull { it.isNotBlank() && !it.startsWith("#") }.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))
        }
    }
    if (v < 0) Text("")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiaryScreen(app: AppState, s: Screen.DiaryView) {
    val v = app.version; val old = app.vault.diary(s.date)
    var tv by remember(s.date) {
        val b = old?.body.orEmpty()
        // アラームから来たら、時刻を入れて書き始める
        val t = if (s.stamp) (if (b.isBlank()) "" else b.trimEnd() + "\n\n") + String.format(java.util.Locale.US, "%tR ", java.util.Calendar.getInstance()) else b
        mutableStateOf(TextFieldValue(t, androidx.compose.ui.text.TextRange(t.length)))
    }
    fun commit() { val cur = app.vault.diary(s.date); if (tv.text.isNotBlank() && tv.text != (cur?.body ?: "")) { app.vault.saveDiary((cur ?: Diary(s.date, "", "", "")).copy(body = tv.text)); app.changed() } }
    LaunchedEffect(tv.text) { if (tv.text != (app.vault.diary(s.date)?.body ?: "")) { delay(700); commit(); delay(800); app.sync(true) } }
    DisposableEffect(s.date) { onDispose { commit() } }
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) { if (s.stamp) try { focus.requestFocus() } catch (_: Exception) { } }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("📔 ${s.date}（${java.text.SimpleDateFormat("E", java.util.Locale.JAPAN).format(java.util.Date(Fmt.parse(s.date + " 12:00:00")))}）") },
            navigationIcon = { IconButton(onClick = { commit(); app.stack.removeAt(app.stack.size - 1) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "戻る") } })
        BasicTextField(tv, { tv = it }, Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).androidx_focus(focus), textStyle = TextStyle(fontSize = 16.sp, lineHeight = 26.sp, color = MaterialTheme.colorScheme.onSurface),
            decorationBox = { inner -> Box { if (tv.text.isEmpty()) Text("今まで何してた？", color = MaterialTheme.colorScheme.outline, fontSize = 16.sp); inner() } })
    }
    if (v < 0) Text("")
}
private fun Modifier.androidx_focus(r: androidx.compose.ui.focus.FocusRequester) = this.then(Modifier.focusRequester(r))

// ===== 設定（同期サーバー・アラーム）=====
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(app: AppState) {
    val ctx = LocalContext.current; val scope = rememberCoroutineScope()
    var s by remember { mutableStateOf(app.settings) }
    var url by remember { mutableStateOf(s.serverUrl) }; var tok by remember { mutableStateOf(s.serverToken) }
    fun save(x: Settings) { s = x; app.saveSettings(x); Alarm.schedule(ctx, x) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("🔄 同期サーバー（ラズパイ）", fontWeight = FontWeight.Bold)
        OutlinedTextField(url, { url = it }, Modifier.fillMaxWidth(), label = { Text("サーバー（例: http://raspberrypi.local:8787）") }, singleLine = true)
        OutlinedTextField(tok, { tok = it }, Modifier.fillMaxWidth(), label = { Text("合言葉") }, singleLine = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { app.saveSettings(app.settings.copy(serverUrl = url.trim(), serverToken = tok.trim())); s = app.settings; scope.launch { app.sync() } }) { Text("保存して同期") }
        }
        if (app.syncMsg.isNotEmpty()) Text(app.syncMsg, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider()
        Text("⏰ アラーム（今まで何してた？）", fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.CenterVertically) { Text("鳴らす", Modifier.weight(1f)); Switch(s.alarmOn, { save(s.copy(alarmOn = it)) }) }
        var min by remember(s.alarmMinutes) { mutableStateOf(s.alarmMinutes.toString()) }
        OutlinedTextField(min, { min = it.filter(Char::isDigit); min.toIntOrNull()?.let { m -> if (m in 1..1440) save(s.copy(alarmMinutes = m)) } }, label = { Text("何分おき") }, singleLine = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            var f by remember(s.fromHour) { mutableStateOf(s.fromHour.toString()) }; var t by remember(s.toHour) { mutableStateOf(s.toHour.toString()) }
            OutlinedTextField(f, { f = it.filter(Char::isDigit); f.toIntOrNull()?.let { h -> if (h in 0..24) save(s.copy(fromHour = h)) } }, Modifier.weight(1f), label = { Text("何時から") }, singleLine = true)
            OutlinedTextField(t, { t = it.filter(Char::isDigit); t.toIntOrNull()?.let { h -> if (h in 0..24) save(s.copy(toHour = h)) } }, Modifier.weight(1f), label = { Text("何時まで") }, singleLine = true)
        }
        if (!Alarm.notificationsEnabled(ctx)) Text("通知が許可されていません。端末の設定でオンにしてください。", color = MaterialTheme.colorScheme.tertiary, fontSize = 12.sp)
        HorizontalDivider()
        Text("ノート ${app.vault.notes.size} 件 · 日記 ${app.vault.diaries.size} 件", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
