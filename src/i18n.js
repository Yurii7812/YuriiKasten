// English UI: the app is written in Japanese; this translates UI text at the DOM level (longest fragment first).
// Languages: 'en' (default) and 'ja'. To add a language, add a table like EN and register it in TABLES.
// User content (note bodies, titles, memos) is never translated: see SKIP.
const EN = {
'ようこそ。YuriiNote の保存先を選びます': 'Welcome. Choose where YuriiNote keeps your notes',
'ノートは、普通のフォルダ（vault）に、md ファイルとして入ります。あとで、右上の 📁 からも変えられます。フォルダごと別の PC にコピーしても、全部そのまま使えます。': 'Notes are stored as md files in an ordinary folder (the vault). You can change it later in Settings. Copy the folder to another PC and everything works as is.',
'見つかった vault（押すと、これを開きます）': 'Vaults found (click to open)',
'✨ 新しく作る（': '✨ Create new (',
'📂 フォルダを選ぶ（既存の vault を開く・新しい場所に作る）': '📂 Choose a folder (open an existing vault / create in a new place)',
'言語・保存先': 'Language & vault', '言語': 'Language', '日本語': '日本語',
'設定…': 'Settings…', '⚙ 設定': '⚙ Settings', '設定': 'Settings',
'スマホのメモを取り込む…（USB）': 'Import phone memos… (USB)',
'スマホにアプリを入れる…（USB）': 'Install phone app… (USB)',
'スマホを USB ケーブルでつないで、「USBデバッグ」をオンにしてから、OK を押してください。\nスマホに YuriiKasten のメモのアプリを入れます。': 'Connect the phone with a USB cable, turn on "USB debugging", then press OK.\nThe YuriiNote memo app will be installed on the phone.',
'スマホのメモを読んでいます…': 'Reading phone memos…',
'件を取り込みました。タイトルを付けておくと探しやすくなります': ' item(s) imported. Adding titles makes them easier to find',
'見た目': 'Appearance', 'テーマ': 'Theme', '明るい': 'Light', '暗い': 'Dark', 'OS に合わせる': 'Match OS',
'アクセントの色': 'Accent color', '好きな色': 'Custom color',
'画面全体の大きさ': 'UI zoom', '本文の文字の大きさ': 'Body font size',
'画面の文字（フォント）': 'UI font', '本文のフォント': 'Body font', '画面と同じ': 'Same as UI', '明朝': 'Serif', '等幅': 'Monospace',
'フォント名': 'Font name', '空なら OS の標準。例: Noto Sans JP': 'Empty = OS default. e.g. Noto Sans JP',
'日付が変わる時刻': 'Day starts at', '時': ':00',
'更新を確認': 'Check for updates', '更新を確認しています…': 'Checking for updates…',
'新しいバージョンがあります:': 'New version available:', '最新です（': 'Up to date (',
'確認できませんでした:': 'Could not check:', '更新できませんでした:': 'Update failed:',
'更新しています…（少し待ってください）': 'Updating… (please wait)',
'今すぐ更新しますか？（更新したら、アプリを開き直してください）': 'Update now? (Reopen the app afterwards)',
'最新のインストーラーのページを開きますか？（ダウンロードして実行すると更新されます）': 'Open the latest installer page? (Download and run it to update)',
'まだ公開されたバージョンがありません。': 'No published version yet.',
'GitHub を開く': 'Open GitHub', 'ショートカットを作る': 'Create shortcut', 'アプリ': 'App', 'スマホ': 'Phone',
'保存先（vault）': 'Vault location', 'エクスポート': 'Export', '📤 エクスポート': '📤 Export',
'ノート': 'Notes', 'ノートがありません': 'No notes', '（ノートがありません）': '(no notes)',
'新しいノート': 'New note', '＋ ノート': '+ Note', '新規': 'New', '新しいタブ': 'New tab', '新しいタブ (Ctrl+T)': 'New tab (Ctrl+T)',
'左から選ぶか、「＋ 新規」で書き始めます。': 'Pick one on the left, or start writing with "+ New".',
'「＋ 新規」で書き始めます': 'Start writing with "+ New"',
'「📷 スキャン取り込み」で紙を入れます': 'Import paper with "📷 Import scans"',
'📷 スキャンを取り込む（紙）': '📷 Import scans (paper)',
'デジタル': 'Digital', '紙': 'Paper', 'すべて': 'All', '🗒 すべて': '🗒 All', '🗒 カード': '🗒 Cards',
'未整理（IDなし）': 'Unsorted (no ID)', 'IDなし': 'No ID', 'IDなしのノート': 'Notes without ID',
'IDなしのノートです。': 'This note has no ID.',
'IDなしのノートです。先にIDを付けると、並列・分岐が使えます': 'This note has no ID. Give it an ID first to use sibling/branch.',
'IDなしのノート（あとで整理する）': 'Note without ID (sort out later)',
'IDなしで書いたノートが、ここに並びます。あとでIDを付けて整理します': 'Notes written without an ID appear here. Add IDs later to organize them.',
'IDを付ける': 'Assign ID', 'IDを消す（IDなしにする）': 'Remove ID (make it unsorted)', 'IDをコピー': 'Copy ID',
'IDをコピーしました:': 'Copied ID:', 'IDを消しました': 'ID removed', 'IDを消せませんでした': 'Could not remove ID',
'IDの形が違います': 'Invalid ID format', 'IDの形が違います（例: 12 や 3a）': 'Invalid ID format (e.g. 12 or 3a)', 'IDの形が違います（例: 2a1）': 'Invalid ID format (e.g. 2a1)',
'IDを入れると、整理されます': 'Enter an ID to file it',
'ID　例: 12 12a': 'ID  e.g. 12 12a', 'ノートのID': 'Note ID', 'このノートのID': 'ID of this note',
'ID（変えると名前も変わります）': 'ID (renaming also renames the file)',
'そのIDは使えません（形が違うか、既にあります）': 'That ID cannot be used (invalid or already taken)',
'は既にあります': ' already exists', 'は既にあります。別のIDにしてください': ' already exists. Choose another ID',
'番号': 'Number', '番号順': 'By number', '日付順': 'By date', '作成日': 'Created', '更新日': 'Updated', '作成順': 'By created', '更新順': 'By updated',
'昇順（押すと降順）': 'Ascending (click for descending)', '降順（押すと昇順）': 'Descending (click for ascending)', '↑ 昇順': '↑ Ascending', '↓ 降順': '↓ Descending',
'並べ替え': 'Sort', '日ごと': 'By day',
'検索': 'Search', 'さがす（ID・本文）': 'Search (ID, text)', 'さがす（キーワードだけ）': 'Search (keywords only)',
'Ctrl+F　（Esc でやめる）': 'Ctrl+F  (Esc to cancel)',
'キーワード': 'Keywords', 'キーワード: すべて': 'Keyword: all', 'キーワード「': 'Keyword "', '＋ キーワード': '+ Keyword', 'Index（キーワード）': 'Index (keywords)',
'キーワード（任意）。同じキーワードのIDが2つ以上あるとき、それらをまとめます': 'Keyword (optional). When a keyword has two or more IDs, they are grouped.',
'キーワード（空なら点なし）': 'Keyword (empty = no dot)',
'ノートにキーワードを書くと、ここに並びます': 'Keywords written in notes appear here',
'キーワードは、IDが2つ以上あるものだけです': 'Only keywords with two or more IDs are shown',
'トピックIndex': 'Topic Index', 'トピックIndex「': 'Topic Index "', 'トピックIndexを作る': 'Create topic Index', 'トピックIndexを探す': 'Find topic Index',
'トピックIndexを選んでください': 'Choose a topic Index', 'トピック「': 'Topic "', 'トピックの設定': 'Topic settings', 'トピックを作る': 'Create topic', 'トピックを変える': 'Change topic',
'トピック未選択': 'No topic', '未選択': 'Unselected', '未選択 / 日記 / トピック名': 'Unselected / Diary / topic name',
'＋ トピック': '+ Topic', '＋ トピックIndexに入れる': '+ Add to topic Index', 'をトピックIndexに追加': ' added to topic Index',
'このトピックIndexを削除': 'Delete this topic Index', 'このトピックを消す': 'Delete this topic',
'このノートのトピックIndex': 'Topic Index of this note', '索引されているトピックIndex': 'Indexed in topic Index', '索引': 'Index',
'新しいトピックIndexを作る（このノートが入口）': 'Create a new topic Index (this note is the entry)',
'入口': 'Entry', '入口・名前': 'Entry / name', 'を入口にします': ' becomes the entry', 'を作ります': ' will be created',
'入口のノート（赤い点を付けるID）。無いIDなら、新しいノートを作ります。キーワードのIDの中から選べます': 'Entry note (ID that gets the red dot). If it does not exist, a new note is created. You can choose from the keyword IDs.',
'紙のノートは、まだ作らない（取り込む前の番号。取り込んだら、つながります）': 'Do not create the paper note yet (a number before import; it links once imported)',
'紙のIndexはまだありません。上のキーワードとIDを書いて、追加します': 'No paper Index yet. Write a keyword and IDs above, then add.',
'紙のIndex（並べ替え）': 'Paper Index (reorder)', '紙のID': 'Paper ID', '紙のノートがあります': 'A paper note exists',
'紙の内容を文字で（テキスト化）': 'Paper contents as text (transcription)',
'1行に「キーワード ID ID …」。ID のあとに (p) で紙、(d) でデジタル（書かなければ、入口のノートと同じ側）。(番号) でノートの中の場所（例: PKM 1a 3(p) 1g(2)）。ID の前に * を付けるとそのIDの上に赤い点（例: PKM *1 1a）。+ で始めると別のトピックIndexへの案内（例: +GUI）。「+名前 ID」なら、その ID へのリンク付きの星（例: +hoge 1）。': 'One line per keyword: "keyword ID ID …". After an ID, (p) = paper, (d) = digital (unmarked = same side as the entry note). (n) = position inside the note (e.g. PKM 1a 3(p) 1g(2)). Prefix an ID with * for a red dot (e.g. PKM *1 1a). Starting with + points to another topic Index (e.g. +GUI). "+name ID" is a star linking to that ID (e.g. +hoge 1).',
'赤い点': 'Red dot', 'ここに赤い点を付ける': 'Put the red dot here', 'このキーワードのIDは2つ未満です': 'This keyword has fewer than two IDs',
'赤い点は、IDが2つ以上あるキーワードだけに付けられます': 'Red dots only go on keywords with two or more IDs',
'赤い点を付けるIDを選びます（点のIDをもう一度押すと外れます）': 'Choose the ID for the red dot (click it again to remove)',
'点のキーワード': 'Dot keyword', '点を外す': 'Remove dot',
'バックリンク': 'Backlinks', '被リンク': 'Backlinks', 'リンク': 'Links', 'リンク元': 'Linked from', 'リンク先': 'Links to',
'このノートを指している': 'Pointing to this note', 'リンクでつながっている': 'Connected by links',
'親': 'Parent', '子': 'Children', '親・子': 'Parent / children', '親子': 'Parent / child', '並列': 'Siblings', '配下': 'Subtree', '系統': 'Lineage',
'上位': 'Parent', '分岐': 'Branch', '＋ 並列': '+ Sibling', '＋ 分岐': '+ Branch',
'並列のノートを作る（': 'Create sibling note (', '並列のノートを作る（同じ階層の次:': 'Create sibling note (next on the same level:',
'分岐のノートを作る（': 'Create branch note (', '分岐のノートを作る（一つ下:': 'Create branch note (one level down:',
'関連': 'Related', '関連を足す': 'Add related',
'近いもの': 'Similar', '近いグループ': 'Nearby group', '近さ順': 'By closeness', '≈ 似たノート': '≈ Similar notes',
'似たノートを探す (s)': 'Find similar notes (s)', '選んだノートに似たノートを探す': 'Find notes similar to the selected ones',
'似たノートは見つかりません。基準や絞り込みを変えてください': 'No similar notes found. Change the basis or filters.',
'似たノートを探すノートを、開くか選んでください': 'Open or select a note to find similar ones',
'基準': 'Basis', '基準にする': 'Use as basis', '基準の子孫は除く': 'Exclude descendants of basis', 'リンク済みは除く': 'Exclude already linked',
'同じキーワード': 'Same keyword', '同じキーワード:': 'Same keyword:', '同じトピックIndex': 'Same topic Index', '同じトピックIndex:': 'Same topic Index:',
'同じ系統': 'Same lineage', '同じ言葉:': 'Same words:', '同じノートへリンク': 'Link to same note', 'どれかに似ている': 'Similar to any', '全部に似ている': 'Similar to all',
'総合の度数': 'Total score', '全体の平均': 'Overall average', '絞り込み': 'Filter',
'曼荼羅': 'Mandala', '❖ 曼荼羅': '❖ Mandala', '曼荼羅の操作': 'Mandala controls',
'3×3 と 9×9 を切り替え (f)': 'Switch 3×3 / 9×9 (f)', 'プレビュー': 'Preview', '右のノートを隠す・出す (p)': 'Hide/show right note (p)',
'空きマス。Enter か ＋ で、ここに新しいノートを作ります': 'Empty cell. Press Enter or + to create a new note here',
'h j k l / 矢印: マスを動く　1〜8: そのマス　0: 中心　Enter: 中心にする　Tab / S-Tab: 順に　[ ]: 前後の曼荼羅': 'h j k l / arrows: move  1–8: that cell  0: center  Enter: make center  Tab / S-Tab: next/prev  [ ]: prev/next mandala',
'全体': 'All', '索引だけ': 'Index only', '外向き': 'Outgoing', '次の': 'Next', '前の': 'Previous',
'グラフ': 'Graph', '🕸 グラフ': '🕸 Graph', 'キャンバス': 'Canvas', '🗺 キャンバス': '🗺 Canvas',
'ドラッグで動かす／ホイールで拡大・縮小': 'Drag to move / wheel to zoom', 'ノート（大きいほどつながりが多い）': 'Notes (bigger = more links)',
'箱を選んで、このボタン → つなぎたい相手の箱をクリック': 'Select a box, press this button, then click the box to connect',
'つなぎたい相手の箱をクリック（Esc でやめる）': 'Click the box to connect (Esc to cancel)',
'何もないところをクリック: 文字を書く　／　箱を選んで「線」→ 相手の箱: つなぐ　／　Ctrl+ホイール: 拡大縮小　／　Delete: 消す': 'Click empty space: write text / select a box, "Line", then another box: connect / Ctrl+wheel: zoom / Delete: remove',
'↗ 線': '↗ Line', '矢印をつける': 'Add arrow', '矢印をなくす': 'Remove arrow', 'ラベルをつける': 'Add label', '＋ ラベル': '+ Label', '線のラベル': 'Line label', 'この線を消しますか？': 'Delete this line?',
'チャットメモ': 'Chat memo', 'C_チャット': 'C_Chat', 'メモを入力…': 'Write a memo…', 'メモ…': 'Memo…',
'書く（Enter で送る、Shift+Enter で改行。@ で、別のメモやノートを入れる）': 'Write (Enter to send, Shift+Enter for newline, @ to insert another memo or note)',
'返信（@ で入れる）': 'Reply (@ to insert)', '返信する': 'Reply', 'この発言に返信': 'Reply to this message', 'この発言をノートに引用': 'Quote this message in a note',
'この発言を消しますか？': 'Delete this message?', '（消された発言）': '(deleted message)',
'このメモを消しますか？（復元用に残しておきます。ノートにしたものは、残ります）': 'Delete this memo? (Kept for restore. Notes made from it remain.)',
'メモを選んで、ノートにする・引用する': 'Select memos to make a note / quote', '選んで、ノートにする': 'Select and make a note', '☑ 選ぶ': '☑ Select', '☑ 選択': '☑ Select',
'ノートにする': 'Make note', 'ノートに引用する': 'Quote in note', 'ノートに引用…': 'Quote in note…', 'ノートに貼る': 'Paste into note', 'ノートを引用する': 'Quote a note',
'ノートや、ほかの会話を引用する': 'Quote notes or other conversations',
'選んだメモを、1 つのノートにまとめます。メモは、チャットに残ります（「ノート …」の印が付きます）。': 'The selected memos are combined into one note. The memos stay in the chat (marked "Note …").',
'このメモから作ったノート': 'Notes made from this memo', 'いま開いているノートのカーソルに、リンクを書き込む': 'Write a link at the cursor of the open note',
'いま開いているノートへ飛ぶ (o)': 'Jump to the open note (o)', '先にノートを開いてください': 'Open a note first',
'件を、ノートにする': ' item(s) → make note', '件を、ノートに引用': ' item(s) → quote in note', '件を選択': ' selected',
'全部表示': 'Show all', 'そのメモは、いまの表示にありません（「全部表示」で探せます）': 'That memo is not in the current view (use "Show all")',
'その日のメモはありません': 'No memos on that day', 'そのチャットメモは、もうありません': 'That chat memo no longer exists',
'日付を入れてください': 'Enter a date', '日付を入れると、その日へ': 'Enter a date to jump to that day', '前の日': 'Previous day', '次の日': 'Next day', '今日の': "Today's",
'元のチャットメモ: [': 'Original chat memo: [', '出典:': 'Source:',
'書いたものは「未選択」に入ります': 'Anything you write goes to "Unselected"',
'（中のメモは「トピック未選択」に移ります）': '(memos inside move to "No topic")',
'日記': 'Diary', '日記として登録': 'Register as diary', '日記にも、時刻つきの行で入ります': 'Also added to the diary as a timed line',
'記録の種類': 'Record kinds', '記録の種類を足す・名前を変える・まとめる・消す': 'Add / rename / merge / delete record kinds', '新しい種類（例: 夢）': 'New kind (e.g. dream)',
'日記のように、日ごとのノートを書く種類です。上位を決めると、その日の上位のノートの上に、下位へのリンク（DailyNotes）が並びます。上位を変えても、もう作った日は変わりません（これから作る日だけ）。': 'A kind that has one note per day, like a diary. If you set a parent, links to the lower level (DailyNotes) are listed on the parent day note. Changing the parent does not affect days already created.',
'なし（日記の下）': 'None (under Diary)', '時刻（HH:MM）を付ける（全体型の行）': 'Add time (HH:MM) (whole-type lines)',
'この日だけの上位。これから作る日の初期値は、記録の種類（＋ ⚙）で決めます': 'Parent for this day only. The default for future days is set in record kinds (+ ⚙).',
'｜ 紙の日記なら': '| For a paper diary',
'メモ型': 'Memo type', 'メモ型 — 1 件ずつのメモ（ノートにするのは、あとで選んだものだけ）': 'Memo type — one memo at a time (only the ones you pick become notes)',
'全体型': 'Whole type', '全体型 — このトピック全体が 1 つのノート': 'Whole type — the whole topic is one note',
'全体で1つのノート': 'One note as a whole',
'なりきりチャット': 'Role-play chat', '🎭 なりきりチャット': '🎭 Role-play chat', '役': 'Role', '＋ 役': '+ Role', '新しい役': 'New role', '＋ 新しい役': '+ New role', '＋ 新しい役を作る': '+ Create new role',
'役の一覧': 'Roles', '役を加える': 'Add role', '役を直す': 'Edit role', '加える': 'Add', '加えられる保存済みの役がありません': 'No saved roles to add',
'役を決めて、発言を書いてみましょう。Q&A・議論・相談のどれにも使えます': 'Pick roles and write some lines. Works for Q&A, discussion, or consultation.',
'「＋ 役」で、話す役を加えてください': 'Add a speaking role with "+ Role"', '話す役がいません。「＋ 役」で加えてください': 'No roles. Add one with "+ Role"',
'発言を書く（Enter で送る、Shift+Enter で改行、Tab で話す役を切り替え）': 'Write a line (Enter to send, Shift+Enter for newline, Tab to switch role)',
'保存した役。会話に何人でも呼び出せます': 'Saved roles. Call as many as you like into a conversation.', '保存した役から選ぶ（何人でも）': 'Choose from saved roles (any number)', '保存した役がまだありません': 'No saved roles yet',
'この役をライブラリから消しますか？（作った会話の中の役は残ります）': 'Delete this role from the library? (Roles in existing conversations remain.)',
'好きな名前': 'Any name', '例: 孔子 / 先生 / 未来の自分': 'e.g. Confucius / Teacher / Future me', '例: 原因 / 反論': 'e.g. Cause / Rebuttal', '会話': 'Conversation', '会話「': 'Conversation "', 'ほかの会話': 'Other conversations',
'説明（探すときに使います）': 'Description (used when searching)', 'アイコンをやめる': 'Remove icon',
'アイコン（絵文字を1つ入れるか、画像を選ぶ。決めなければ名前の頭文字）': 'Icon (one emoji or an image; default is the initial)',
'ごみ箱': 'Trash', 'ごみ箱は空です': 'Trash is empty', '戻す': 'Restore', '戻しました': 'Restored',
'アーカイブ': 'Archive', 'アーカイブしました': 'Archived', 'アーカイブから戻す': 'Unarchive', 'アーカイブから戻しました': 'Unarchived',
'固定': 'Pin', '📌 固定': '📌 Pin', '固定しました': 'Pinned', '固定を外しました': 'Unpinned',
'削除': 'Delete', '消す': 'Delete', '編集': 'Edit', '直す': 'Edit', '保存': 'Save', '閉じる': 'Close', '閉じる (Ctrl+W)': 'Close (Ctrl+W)', '閉じる (Esc)': 'Close (Esc)', '閉じる ▴': 'Close ▴',
'開く': 'Open', 'やめる': 'Cancel', '決定': 'OK', '足す': 'Add', '追加': 'Add', '作る': 'Create', '送る': 'Send', '付ける': 'Attach', '外す': 'Remove', '飛ばす': 'Skip', '完了': 'Done',
'変える…': 'Change…', '書き直す': 'Rewrite', 'まとめる': 'Merge', 'コピー': 'Copy', 'コピーしました': 'Copied', '件をコピーしました': ' item(s) copied',
'メニュー': 'Menu', 'このノートのメニュー': 'Menu of this note', '拡大': 'Zoom in', '縮小': 'Zoom out', '引用する': 'Quote', '❝ 引用': '❝ Quote',
'戻る (Alt+←)': 'Back (Alt+←)', '進む (Alt+→)': 'Forward (Alt+→)', '戻る (b)': 'Back (b)',
'右の欄を隠す・出す (Ctrl+\\)': 'Hide/show right panel (Ctrl+\\)', '一覧・カードの表示を切り替え': 'Switch list / card view',
'カード（Google Keep 風・画面いっぱい）': 'Cards (Keep-style, full screen)', 'カードがありません。上の欄から、すぐ書けます': 'No cards. Write right away in the box above.', 'カードを探す': 'Search cards',
'続きを見る ▾': 'Show more ▾', 'まだ空です。「編集」で書きます': 'Empty. Write with "Edit"',
'ファイル': 'Files', 'ファイルを取り込む': 'Import file', 'ファイルを添付': 'Attach file', 'ファイルを添付（ドラッグや貼り付けでも）': 'Attach file (drag or paste also work)', '📎 添付': '📎 Attach',
'ファイルや画像を付ける': 'Attach files or images', '画像などを付ける': 'Attach images etc.', '画像': 'Image', '画像を入れる': 'Insert image', '画像を選ぶ': 'Choose image', '＋ 画像': '+ Image', '表を入れる': 'Insert table', '▦ 表': '▦ Table', 'チェックリスト': 'Checklist',
'ファイル（画像・html・csv など）': 'Files (images, html, csv, …)', '取り込んだ画像・html・csv などが、ここに並びます。ノートにドラッグしても取り込めます': 'Imported images, html, csv etc. appear here. You can also drag them onto a note.',
'タイトル': 'Title', 'タイトルなし': 'No title', '（タイトルなし）': '(no title)', '（無題）': '(untitled)', '（空）': '(empty)', '（本文なし）': '(no body)',
'タイトルのないファイルはありません': 'No files without a title', 'タイトル（任意）　例: 旅の話': 'Title (optional)  e.g. Travel story',
'名前': 'Name', '名前を入れてください': 'Enter a name', '名前（例: GUI）': 'Name (e.g. GUI)', 'その名前は使えません': 'That name cannot be used', 'その名前は既にあります': 'That name already exists',
'よみ': 'Reading', 'よみ（自動）': 'Reading (auto)', 'そのほか': 'Other', 'その他': 'Other', 'ほか': 'others', 'なし': 'None', 'いつもある': 'Always shown', 'まだありません': 'None yet', 'ありません': 'None',
'見つかりません': 'Not found', 'そのノートがありません': 'That note does not exist', 'そのノートがまだありません': 'That note does not exist yet', 'というノートはありません': ' does not exist',
'はまだありません。作りますか？': ' does not exist yet. Create it?', 'はまだ取り込んでいません（ノートが無くても作れます）': ' is not imported yet (you can still create it without the note)', 'まだ取り込んでいません': 'Not imported yet',
'まだ番号のあるノートがありません': 'No numbered notes yet', 'まだ選んでいません': 'Nothing selected yet', 'まだありません。下の欄に書くと、ここに並びます': 'Nothing yet. Write in the box below and it will appear here.',
'ページを開きます…': 'Opening page…', '入れています…': 'Importing…',
'できませんでした（名前が使えない・すでにある・輪になる、など）': 'Failed (name unusable, already exists, would form a loop, …)',
'その上位にはできません（輪になります）': 'Cannot be the parent (would form a loop)', '保存できませんでした': 'Could not save',
'を削除しますか？\n（ファイルは .trash に移ります。索引の行からもIDを外します）': ' — delete?\n(The file moves to .trash. The ID is also removed from index lines.)',
'を削除しますか？（ファイルは .trash に移ります。紙の日記の画像は残ります）': ' — delete? (The file moves to .trash. Paper diary images remain.)',
'」を削除しますか？（ファイルは .trash に移ります）': '" — delete? (The file moves to .trash.)',
'」を消しますか？\\n': '" — delete?\\n', '」を新しく作ります。よろしいですか？': '" will be created. OK?',
'」のIDを消して、IDなしにしますか？\n': '" — remove its ID and make it unsorted?\n',
'」をこのノートから外しますか？': '" — remove from this note?', 'を外しますか？': ' — remove?',
'」に変えますか？': '" — change to it?', '」の入口です（1つのIDに1つの索引）': '" is the entry (one index per ID)', '」の入口です（1つのノートに索引は1つ）': '" is the entry (one index per note)',
'」のトピックIndexは、もう「': '" topic Index is already "', '」の赤い点は、もう「': '" red dot is already "', '」は、いま「': '" is currently "', '」は、もう「': '" is already "',
'」の新しい名前（その種類の日のノートも、まとめて変わります）': '" new name (day notes of that kind change too)',
'」を、どの種類にまとめますか？（': '" — merge into which kind? (',
'」があります': '" exists', '」に付いています': '" is attached', '」の': '" ', '」の点です。「': '" dot. "', '」の発言': '" line',
'件のリンクは、自動で直ります。\n': ' link(s) will be fixed automatically.\n',
'日分のノートも、ごみ箱（.trash）に移ります。': ' day note(s) also move to the trash (.trash).',
'（ノートは残ります）': '(notes remain)', '（保存はしません。確認してコピー）': '(not saved. Check and copy)',
'選んだノートを、1つの Markdown にまとめる（保存はしない。確認してコピー）': 'Combine the selected notes into one Markdown (not saved; check and copy)',
'複数のノートを選んで、まとめて削除します': 'Select several notes and delete them together',
'複数:': 'Multiple:', '一時タブで確認': 'Preview in a temp tab', '件・保存はされません（このタブを閉じると消えます）': ' items · not saved (disappears when this tab is closed)',
'番号の範囲（デジタル）': 'ID range (digital)', '範囲を足す': 'Add range', 'その枝（子孫すべて）を足す': 'Add that branch (all descendants)', '番号の親子': 'ID parent/child',
'番号順に出します。リンクは、この中を指すものだけ生かします': 'Output in ID order. Only links pointing inside this set are kept.',
'親のノートのID（分岐として付ける）': 'ID of the parent note (attach as a branch)', 'となりのノートのID（並列として付ける）': 'ID of the neighboring note (attach as a sibling)',
'ノートのID（無ければ作る）': 'Note ID (created if missing)', 'ノートを開く': 'Open note', 'ノートの画面で開く': 'Open in note view', 'を開く（無ければ作る）': ' — open (create if missing)', '一時': 'temp',
'既存のノート': 'Existing note', '最近': 'Recent', '前のID (Tab)': 'Previous ID (Tab)', '決定して次へ (Enter)': 'Confirm and next (Enter)', '← ここに入ります': '← goes here',
'手前に出す': 'Bring forward', '外向き': 'Outgoing', '案内 (?)': 'Help (?)', '色': 'Color', '例: アイデア': 'e.g. Idea', '例: GUI': 'e.g. GUI', '例: 1a': 'e.g. 1a',
'例: 図でわかる知識管理術の表紙': 'e.g. Cover of a knowledge-management book', '例: 英雄伝': 'e.g. Lives of heroes', '任意（、で区切る）': 'Optional (comma-separated)',
'本文。続き :1a1　引用 (1) と (1):　別ノート 1a(1)　全体 1a:': 'Body. Continue :1a1  Quote (1) and (1):  Other note 1a(1)  Whole 1a:',
'本文の言葉': 'Body words', '— 中身があるので、型は変えられません': '— it has content, so its type cannot be changed',
'ノートは、まだ': 'Note is not yet', '|': '|',
'新しい変更があります（': 'There are new changes (',
'デジタルのノート': 'Digital note', '紙のIndexから「': 'From paper Index "', '」を、どの種類': '" which kind',
'ドラッグ': 'Drag', '＋ 取り込む': '+ Import', '未整理': 'Unsorted', 'Index': 'Index',
'の行: カーソルが外にあるときは記号を隠す（コードの枠だけ見せる）': ' line: hide symbols when the cursor is outside (show only the code frame)',
'点': 'dot', '件': ' items', '日': ' day', '空なら': 'if empty',
};
EN['Ctrl+クリックで新しいタブに開きます。'] = 'Ctrl+click opens in a new tab.';
EN['全部'] = 'All';
EN['今日の日記'] = "Today's diary"; EN['今日のノート'] = "Today's notes"; EN['この日の日記'] = 'This day\'s diary';
const TABLES = { en: EN };
const SKIP = '.cm-editor,.nt,.mt,.mhead b,textarea,input,[data-user],.msg-text,.mc,.snip,.kc-body,.kc-title,.title,.bubble .tx';
let lang = 'ja', obs = null, keys = [];
const orig = new WeakMap(), origA = new WeakMap();   // original (Japanese) text of text nodes / attributes
function tr(s) {
  if (lang === 'ja' || !s) return s;
  const T = TABLES[lang]; if (!T) return s;
  const t = s.trim(); if (T[t]) return s.replace(t, T[t]);
  if (!/[　-鿿＀-￯]/.test(s)) return s;
  let out = s;
  for (const k of keys) if (k.length > 1 && out.includes(k)) out = out.split(k).join(T[k]);
  return out;
}
const ATTRS = ['title', 'placeholder', 'aria-label'];
function node(n) {
  if (n.nodeType === 3) {
    const p = n.parentElement; if (!p || p.closest(SKIP) || ['SCRIPT', 'STYLE'].includes(p.tagName)) return;
    if (!orig.has(n)) orig.set(n, n.data);
    const o = orig.get(n); if (n.data !== o && n.data !== tr(o)) orig.set(n, n.data);
    const v = tr(orig.get(n)); if (v !== n.data) n.data = v;
  } else if (n.nodeType === 1) {
    if (n.closest && n.closest(SKIP) && !n.matches('button,[title]')) return;
    for (const a of ATTRS) if (n.hasAttribute && n.hasAttribute(a)) {
      const m = origA.get(n) || {}; origA.set(n, m); const v = n.getAttribute(a);
      if (!(a in m) || (v !== m[a] && v !== tr(m[a]))) m[a] = v;
      const t = tr(m[a]); if (t !== v) n.setAttribute(a, t);
    }
    n.childNodes.forEach(node);
  }
}
export function setLang(l) {
  lang = TABLES[l] ? l : 'ja'; keys = lang === 'ja' ? [] : Object.keys(TABLES[lang]).sort((a, b) => b.length - a.length);
  document.documentElement.lang = lang;
  if (lang === 'ja') { if (obs) { obs.disconnect(); obs = null; } return restore(document.body); }
  node(document.body);
  if (!obs) { obs = new MutationObserver(ms => { obs.disconnect(); for (const m of ms) { if (m.type === 'characterData') node(m.target); else if (m.type === 'attributes') node(m.target); else m.addedNodes.forEach(node); } watch(); }); watch(); }
}
function watch() { obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] }); }
function restore(n) {
  const w = document.createTreeWalker(n, 4); let x; while ((x = w.nextNode())) if (orig.has(x)) x.data = orig.get(x);
  n.querySelectorAll('*').forEach(e => { const m = origA.get(e); if (m) for (const a in m) if (e.hasAttribute(a)) e.setAttribute(a, m[a]); });
}
export const t = tr;
export const LANGS = { en: 'English', ja: '日本語' };
// dialogs
for (const f of ['alert', 'confirm', 'prompt']) { const o = window[f].bind(window); window[f] = (m, ...r) => o(tr(String(m)), ...r); }
