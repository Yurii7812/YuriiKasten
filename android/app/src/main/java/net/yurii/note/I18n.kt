package net.yurii.note

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import java.util.Locale

// English is the default UI language; Japanese is shown when the phone's language is Japanese.
// The app's text is written in Japanese in the code and translated here, fragment by fragment (longest first).
// To add a language, add a table like EN and register it in TABLES.
object I18n {
    val EN: Map<String, String> = mapOf(
        "📚 全部" to "📚 All", "⏳ 未取り込み" to "⏳ Not imported", "✓ 済み" to "✓ Done", "✓ PCへ" to "✓ To PC",
        "PC に取り込み済みと確認できるメモはありません。まとめて消したいときは、下の「このトピックのメモを全部消す」で消せます。" to "No memos confirmed as imported to the PC. To delete them all, use \"Delete all memos of this topic\" below.",
        "↳ 続きとして書く（Branch の子）: " to "↳ Writing as a continuation (child of Branch): ", "⇢ 文脈" to "⇢ Context", " 件: " to " : ",
        "に書く" to " — write", "スキャン" to "scan(s)", "を消しますか？" to " — delete?", "枚を消しますか？" to " — delete?", " 枚" to " page(s)",
        "を消します（うち取り込んでいない" to " will be deleted (of which not imported: ", "件は、PC に取り込んだか確かめられません）。PC に取り込んだ記録（二重に取り込まない印）は PC 側に残るので、取り込み済みのものがまた取り込まれることはありません。画像も消え、元に戻せません。" to " — cannot be verified as imported to the PC). The import record on the PC (the mark that prevents duplicate imports) stays there, so imported items will not be imported again. Images are deleted too and this cannot be undone.",
        "件を消しますか？" to " item(s) — delete?", "件選択" to " selected", "」の文脈。終わったら ×）" to "\" as context. Press × when done)",
        "1 つのノートにまとめる・時刻など" to "Combine into one note, time, etc.", "1 つのノートにまとめる" to "Combine into one note",
        "24時間鳴らす" to "Ring all day", "Branch で続ける" to "Continue as Branch", "Folgezettel 表示にする" to "Show as Folgezettel",
        "PC には取り込み済みです。" to "Already imported to the PC.",
        "PC にまだ無い名前です（PC では新しい時系列記録になります）。PC にあるもの: " to "This name does not exist on the PC yet (it becomes a new timeline record there). On the PC: ",
        "PC に取り込み済みの" to "Items already imported to the PC: ", "件をスマホから消します。取り込んだ vault にメモが残っていることを確認してください。テスト用 vault に取り込んだだけなら消さないでください。空になったトピックも消します（日記・時系列記録は残します）。画像も消え、元に戻せません。" to " will be deleted from the phone. Make sure the memos remain in the vault you imported to. Do not delete if you only imported into a test vault. Emptied topics are deleted too (Diary and timeline records stay). Images are deleted and this cannot be undone.",
        "PC に取り込むと「" to "When imported to the PC, it is appended to the note \"", "」のノートに追記します。ほかのメモから使われた（リンク・文脈・続き）メモは「## 本文の始め」の見出しの節になり、そこへのリンクになります。" to "\". Memos used by other memos (link/context/continuation) become a section headed \"## Start of body\" and are linked to.",
        "PC に取り込んだあとで消せます" to "Can be deleted after importing to the PC", "PC の時系列記録から選ぶ" to "Choose from the PC's timeline records",
        "まだ PC に取り込んでいない" to "Not yet imported to the PC: ", "件は、消しません。" to " item(s) will not be deleted.",
        "済み" to "done", "件を消す" to " item(s) — delete", "日付: " to "Date: ", "・ 済み" to "· done", "枚" to " page(s)",
        "（うち番号なし" to "(of which no number: ", "枚。番号を付けると PC に取り込めます）" to " . Add a number to import them to the PC)",
        "（メモ全体）" to "(whole memo)", "（画像）" to "(image)", "（書き出し済み）" to "(exported)", "（編集）" to "(edit)",
        "」の取り込み方" to "\" import mode", "」を編集（名前・取り込み方・消す）" to "\" — edit (name, import mode, delete)", "」のメモを全部消す" to "\" — delete all memos",
        "＋ 新しいトピックを作って移動" to "+ Create new topic and move", "＋ 新しいトピック" to "+ New topic", "＋ 文脈を追加（探す）" to "+ Add context (search)",
        "ここから範囲選択" to "Select range from here", "このスキャンを消しますか？" to "Delete this scan?", "このスキャンを消す" to "Delete this scan",
        "このトピックのメモ（" to "Memos of this topic (", "件）は消さずに未所属へ移します。" to ") will be moved to Unassigned, not deleted.", "件）も新しい名前になります。" to ") will also get the new name.",
        "このトピックのメモはありません。" to "This topic has no memos.", "このトピックのメモを全部消す（取り込み済みかどうかに関係なく）" to "Delete all memos of this topic (whether or not imported)",
        "このトピックの取り込み方" to "Import mode of this topic", "このトピックの名前を直す" to "Rename this topic", "このメモの子として書く" to "Write as a child of this memo", "このメモの文章を直す" to "Edit this memo's text",
        "この一覧を全部消す（" to "Delete this whole list (", "この表示にはまだメモがありません。\nここに書いたものは、YuriiNote の「未整理」に 1 件ずつ届きます。\n長押しで「分岐」「文脈」などができます。" to "No memos here yet.\nWhatever you write here arrives in YuriiNote's \"Unsorted\" one memo at a time when you import over USB.\nLong-press for \"Branch\", \"Context\" and more.",
        "この表示にはまだメモがありません。" to "No memos in this view yet.",
        "すべて取り込み済み" to "All imported", "すべての" to "All ", "そのほか" to "More", "その他" to "Other",
        "同じ名前のトピックがあります（日記・すべて・未所属など、決まった名前も使えません）" to "That name cannot be used (a topic with that name exists, or the name is not allowed)",
        "たたむ" to "Collapse", "つながりを確かめて外す" to "Check links and remove", "つなぐ相手のメモを続けてタップ" to "Tap the memo to connect to", "なし" to "None",
        "まだ PC に取り込んでいないので、消せません" to "Not imported to the PC yet, so it cannot be deleted", "まだスキャンがありません。下のボタンで、紙を続けて撮れます。" to "No scans yet. Use the button below to scan paper one after another.",
        "まだトピックがありません" to "No topics yet", "まとめて移す・消す" to "Move / delete in bulk", "やめる" to "Cancel",
        "アウトライン引用（見出しへのリンク）" to "Outline quote (link to a heading)", "アラームと設定" to "Alarm & settings", "アラームの時刻を許可" to "Allow exact alarms",
        "コピー" to "Copy", "スキャナーを開けませんでした: " to "Could not open the scanner: ", "スキャンする（まとめて）" to "Scan (several)", "チェックボックス" to "Checkbox", "テスト通知を鳴らす" to "Send test notification",
        "トピック・時系列記録" to "Topics & timeline records", "トピック「" to "Topic \"", "」を消す" to "\" — delete", "トピックとメモを消す" to "Delete topic and memos", "トピックの名前を変える" to "Rename topic", "トピックを足す" to "Add topic", "トピックを変える" to "Change topic", "トピック未選択" to "No topic", "トピック" to "Topic",
        "メモを書く（未所属）" to "Write a memo (unassigned)", "メモを全文検索" to "Search all memos", "メモを保存できませんでした" to "Could not save the memo", "メモ" to "Memo",
        "リンク（メモを探す）" to "Link (find a memo)", "リンクするメモ" to "Memo to link", "リンク: " to "Link: ",
        "移動先を選ぶ" to "Choose destination", "移動" to "Move", "一覧へ" to "To list", "引用するメモ（見出しはこのあと選ぶ）" to "Memo to quote (pick the heading next)", "引用する見出し" to "Heading to quote",
        "押すと日記に書けます" to "Tap to write in your diary", "何時から" to "From (hour)", "何時まで" to "Until (hour)", "何分おき" to "Every (minutes)",
        "画像も消えます。元に戻せません。スマホの中からだけ消えます。" to "Images are deleted too. This cannot be undone. Only removed from the phone.", "画像を付ける" to "Attach image",
        "解除" to "Release", "開始と終了が同じ場合も24時間鳴らします。" to "If start and end are the same, it rings all day.", "外す" to "Remove",
        "各メモの頭に「時:分」。日が替わったときだけ日付の見出し。" to "\"HH:MM\" at the start of each memo. A date heading only when the day changes.",
        "決めて次へ" to "Confirm and next", "決定" to "OK", "検索をやめる" to "Stop searching", "見つかりません" to "Not found",
        "今の時刻を入れる（オフ）" to "Insert current time (off)", "今の時刻を入れる（オン）" to "Insert current time (on)",
        "今まで何してた？" to "What have you been doing?", "今まで何をしていたかを書くための通知" to "Notification to write what you have been doing",
        "子 " to "Child ", "子" to "Child", "紙のスキャン" to "Paper scans", "時系列記録だけを表示" to "Show timeline records only", "時系列表示にする" to "Show as timeline", "時系列記録の名前は、PC から届くと、ここに出ます。" to "Timeline record names appear here once they arrive from the PC.", "時系列記録" to "Timeline record", "時系列" to "Timeline",
        "時刻どおりに鳴らすには「アラームとリマインダー」を許可してください。未許可では遅れる場合があります。" to "To ring on time, allow \"Alarms & reminders\". Without it, alarms may be late.", "時刻を付ける" to "Add time",
        "次 " to "Next ", "次の 1 枚" to "Next page", "次の連番" to "Next number", "次回: " to "Next: ", "写真ごと消えます。もとには戻せません。" to "The photo is deleted too. This cannot be undone.",
        "取り込み済み ・ 番号 " to "Imported · number ", "取り込み済み。スマホの中からだけ消す" to "Imported. Delete from the phone only", "取り込み済みのメモを消す" to "Delete imported memos", "取り込み済みの" to "Imported ", "取り込み方" to "Import mode",
        "取り消す" to "Undo", "終わりのメモを押す" to "Tap the last memo", "書き直す" to "Rewrite", "消しますか？" to "Delete?", "消す（取り込み後に）" to "Delete (after import)", "消す" to "Delete",
        "親（Branch）にするメモ" to "Memo to be the parent (Branch)", "親（Branch）" to "Parent (Branch)", "親が無いときは、最初の文脈が親（Branch）になります。" to "If there is no parent, the first context becomes the parent (Branch).",
        "折りたたむ" to "Collapse", "選択をやめる" to "Stop selecting", "選択中" to "Selected", "前: " to "Prev: ", "前の 1 枚" to "Previous page", "前の番号を直す" to "Fix previous number",
        "全選択" to "Select all", "全部折りたたみ" to "Collapse all", "全部展開" to "Expand all", "全部消す" to "Delete all", "全部表示" to "Show all", "全部" to "All", "全文検索" to "Full-text search",
        "挿入（チェックボックス・リンク・文脈・親）" to "Insert (checkbox, link, context, parent)", "送る" to "Send", "足す" to "Add", "続きを見る" to "Show more", "続けて書く" to "Keep writing",
        "探す（本文の一部）" to "Search (part of text)", "探す" to "Search", "長いメモを折りたたむ" to "Collapse long memos", "長いメモを全部展開する" to "Expand all long memos",
        "通知が許可されていません。「通知と音の設定」で許可してください。" to "Notifications are not allowed. Allow them in \"Notification & sound settings\".", "通知と音の設定" to "Notification & sound settings",
        "定期のメモ" to "Periodic memo", "定期的に鳴らす" to "Ring periodically", "展開" to "Expand", "統合" to "Merge",
        "日記・時系列記録で日付を指定して書いたとき、PC では今の時刻が付き、本文の最初に「（今日の日付 に記入）」が入ります。オフなら時刻は付きません（書く画面の上でも切り替えられます）。" to "When you write for a chosen date in Diary / timeline records, the PC adds the current time and puts \"(written on today's date)\" at the start. If off, no time is added (you can also switch this above the writing screen).",
        "日記・時系列記録" to "Diary & timeline records", "日記（時刻は自動で付きます）" to "Diary (time is added automatically)",
        "日記のように、その日のノート（例: 2026-10-19-MO-" to "Like a diary, it goes into that day's note (e.g. 2026-10-19-MO-", "）に時刻つきで入ります。PC で同じ日に書いた分と時刻の順にまざります。" to ") with the time. It is merged in time order with what you wrote on the PC that day.", "日記" to "Diary",
        "日付を今日に戻す" to "Reset date to today", "日付を指定したときも今の時刻を入れる" to "Insert current time even for a chosen date", "日付を指定して書く（今日）" to "Write for a chosen date (today)",
        "入力欄を小さく" to "Smaller input box", "入力欄を大きく" to "Larger input box", "番号（例: 1a2）" to "Number (e.g. 1a2)", "番号なし" to "No number", "番号は 1 / 1a / 1a2 のように（数字と小文字。例: 1a2）" to "Numbers look like 1 / 1a / 1a2 (digits and lowercase letters)", "番号を打つ" to "Enter number", "番号を入力" to "Enter number",
        "複数選べます（" to "You can choose several (", "複数選択" to "Select multiple", "文章をクリップボードへ" to "Copy text to clipboard", "文脈: " to "Context: ",
        "文脈・親を編集" to "Edit context / parent", "文脈（" to "Context (", "文脈（メモを探す）" to "Context (find a memo)", "文脈で続ける" to "Continue with context", "文脈にするメモを続けてタップ（「" to "Tap memos to use as context (\"", "文脈にするメモ" to "Memo to use as context", "文脈につなぐ" to "Connect to context",
        "閉じる" to "Close", "別のトピックへ移す" to "Move to another topic", "変える" to "Change", "編集中: " to "Editing: ", "保存" to "Save",
        "未取り込み" to "Not imported", "未所属" to "Unassigned", "名前を変える" to "Rename",
        "鳴ったら通知を押すと「今まで何してた？」が日記で開きます。" to "When it rings, tap the notification to open \"What have you been doing?\" in your diary.",
        "鳴らす長さ（秒・0 で 1 回だけ）" to "Ring length (seconds; 0 = once)", "鳴らす長さのあいだ音を繰り返します（通知を押す・アプリを開くと止まります）。最長 600 秒。" to "The sound repeats for the ring length (stops when you tap the notification or open the app). Max 600 seconds.",
        "PC の日のノート（日記・時系列記録）" to "Day notes on the PC (diary & timeline records)", "PC の日のノート" to "Day notes on the PC", "返信（メモを探す）" to "Reply (find a memo)", "返信先にするメモを続けてタップ（「" to "Tap memos to reply to (\"", "」の返信先。終わったら ×）" to "\" replies. Press × when done)", "返信先にするメモ" to "Memo to reply to", "返信先を足す" to "Add reply target", "返信先を確かめて外す" to "Check and remove reply targets", "返信先を編集" to "Edit reply targets", "返信先（" to "Reply targets (", "＋ 返信先を追加（探す）" to "+ Add reply target (search)", "↩ 返信 " to "↩ Replies: ", "返信" to "Reply", "挿入（チェックボックス・リンク・返信）" to "Insert (checkbox, link, reply)", "編集" to "Edit", "PC に取り込み済みと確認できるメモはありません。まとめて消したいときは、下の「このトピックのメモを全部消す」で消せます。" to "", "日付を指定して見る" to "Go to a date", "その日のメモはありません" to "No memos on that day", "見る" to "Go", "古いメモをさらに表示（あと " to "Show older memos (", "上のトピック（いくつでも）" to "Upper topics (any number)", "上位トピック（いくつでも）" to "Upper topics (any number)", "上位トピックを変える" to "Change upper topics", "所属トピックを変える" to "Change assigned topic", "別の所属トピックへ移す" to "Move to a different assigned topic", "上を変える" to "Change upper topics", "上のトピック（いくつでも）" to "Upper topics (any number)", "探す" to "Search", "↑ 上" to "↑ Up", "戻る" to "Back", "例: アイデア" to "e.g. Idea", "（" to " (", "）" to ")", "「" to "\"", "」" to "\"",
        "件" to " item(s)", "つなぐ" to "Connect", "（取り込み後に）" to " (after import)", "未選択" to "Unselected"
    )
    fun dayPat(withDow: Boolean) = if (lang == "ja") (if (withDow) "M月d日（E）" else "M月d日") else (if (withDow) "MMM d (E)" else "MMM d")
    private val TABLES = mapOf("en" to EN)
    private val keys: Map<String, List<String>> = TABLES.mapValues { it.value.keys.sortedByDescending { k -> k.length } }
    private val jp = Regex("[　-鿿＀-￯]")

    /** Current UI language code: the phone's language if supported, otherwise English. */
    val lang: String get() = if (Locale.getDefault().language == "ja") "ja" else "en"

    private val cache = HashMap<String, String>()
    fun tr(s: String): String {
        if (lang == "ja" || s.isEmpty() || s.length > 160) return s   // 長い文章（メモの本文）は訳さない
        cache[s]?.let { return it }
        val r = trSlow(s); if (cache.size > 2000) cache.clear(); cache[s] = r; return r
    }
    private fun trSlow(s: String): String {
        if (!jp.containsMatchIn(s)) return s
        val t = TABLES[lang] ?: return s
        t[s]?.let { return it }
        var out = s
        for (k in keys[lang]!!) if (out.contains(k)) out = out.replace(k, t[k]!!)
        return out
    }
}

@Composable
fun Text(
    text: String, modifier: Modifier = Modifier, color: Color = Color.Unspecified, fontSize: TextUnit = TextUnit.Unspecified,
    fontWeight: FontWeight? = null, textAlign: TextAlign? = null, overflow: TextOverflow = TextOverflow.Clip,
    softWrap: Boolean = true, maxLines: Int = Int.MAX_VALUE, style: TextStyle = LocalTextStyle.current
) = androidx.compose.material3.Text(
    text = I18n.tr(text), modifier = modifier, color = color, fontSize = fontSize, fontWeight = fontWeight,
    textAlign = textAlign, overflow = overflow, softWrap = softWrap, maxLines = maxLines, style = style
)

@Composable
fun Icon(imageVector: ImageVector, contentDescription: String?, modifier: Modifier = Modifier, tint: Color = LocalContentColor.current) =
    androidx.compose.material3.Icon(imageVector, contentDescription?.let { I18n.tr(it) }, modifier, tint)
