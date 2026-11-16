# 安全政策

## 回報漏洞

請不要開公開 issue。請到 [Security 分頁](https://github.com/tinganhsu/decision-router/security/advisories/new)
按「Report a vulnerability」私下回報。

本專案是 [dominicrico/jev-router](https://github.com/dominicrico/jev-router) 的 fork；
屬於上游原有的問題，也請同時回報上游。

## 外掛送出與儲存什麼

- 送出：你的 prompt（最多 `maxTaskChars` 字）、可選的最近對話（`sendHistory`），以及 subagent 的任務文字，
  目的地是 `routerUrl`（預設 `https://api.typesafe.ai/v1/systemone`）。
- 送出前先遮蔽（`redact`）：私鑰區塊、`sk-`／`ghp_`／AWS／Stripe／Slack／Google／npm／GitLab 的金鑰格式、JWT、
  `Bearer` 與 `Basic` 授權標頭、`password=`／`token=`／`api_key=`／`HashKey=`／`HashIV=` 這類賦值，
  URL 內的帳密，以及中文的「密碼是…」「密鑰：…」，還有 `/jev key <key>` 這行指令本身。長度截斷前先遮蔽，所以被切斷的私鑰區塊也會整段遮掉。**這是樣式比對，不保證抓得到所有機密。**
  處理敏感內容時請把 `sendHistory` 設成 `false`。
- 帶著金鑰時，只有 `https://` 或本機（`localhost`、`127.0.0.1`、`[::1]`）會送出，其他主機的 `http://` 會拒絕。沒有金鑰時，區網的 `http://` 路由器仍可用，但 prompt 文字會以明文傳輸，非本機的路由器請用 https。
- 路由器回傳的信心值會夾在 0 到 1 之間，不是數字就當 0。路由器只能在你允許的模型中選，且仍受上下限與門檻約束；它能影響的只有成本，不能執行任何動作。
- TypeSafe 金鑰（`/jev key`、`TYPESAFE_API_KEY`）只會送到 `api.typesafe.ai`，不會送到自訂的 `routerUrl`。
  `apiKey` 外掛選項則會送到你設定的任何路由端點。
- 金鑰存在外掛儲存區，是純文字。`/jev key <key>` 這行指令會留在對話紀錄裡，建議改用環境變數。
- 外掛不會呼叫其他網路位置，也不會在外掛儲存區以外寫檔。

## 支援的版本

最新版。
