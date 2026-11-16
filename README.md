<p align="center">
  <img src="assets/logo.jpg" width="160" alt="Jev Router 浣熊轉轍員">
</p>

<h1 align="center">decision-router（jev-router）</h1>

<p align="center">
  <em>Claude Code 的模型路由外掛：每個任務挑「夠用的最便宜模型」與推理強度，並針對台灣繁體中文做過調整。</em>
</p>

<p align="center">
  <img src="assets/band.gif" width="820" alt="輸入框上方的狀態列：模式、模型、effort、信心與 cache 狀態">
</p>

這是 [dominicrico/jev-router](https://github.com/dominicrico/jev-router) 的 fork。外掛會在每次送出 prompt 前，問一個 System One 決策模型（預設是 TypeSafe Jev）該用哪個 Claude 模型、多少推理強度，然後讓這一輪用它的答案執行。

## 與上游的差異

| | 上游 jev-router 0.5.0 | 這個 fork（0.5.4） |
|---|---|---|
| 中文任務 | 與英文同樣處理 | 偵測到中文時，附上說明：依工作內容判斷，不看語言或字數（中文一字約是英文三倍資訊量） |
| 備援規則（Jev 掛掉時） | 只認英文關鍵字 | 中文字數加權，並認得「改名、錯字、架構、根本原因、遷移」等詞 |
| 模型名稱 | 把完整 id 寫在程式裡，Fable 還停在 `5-1` | 只送別名（`opus`），由 Claude Code 解析成該家族最新版，新版本不必改程式 |
| 升降級門檻 | 只有「cache 有效時升級」一個門檻 | `minUpgradeConfidence`、`minDowngradeConfidence` 兩個獨立門檻 |
| 機密遮蔽 | 常見金鑰與 `password=` 類 | 另外涵蓋綠界 `HashKey`／`HashIV`、Stripe、Slack、Google、JWT、`Basic` 標頭、中文「密碼是…」 |
| 金鑰傳送 | 任何 `routerUrl` | 帶金鑰時只透過 https 或本機位址；其他主機的 `http://` 拒絕 |
| marketplace | `jev-router` | `decision-router` |

## 安裝

```
/plugin marketplace add tinganhsu/decision-router
/plugin install jev-router@decision-router
```

接著設定 TypeSafe 金鑰（二擇一，建議用環境變數，因為 `/jev key` 這行指令會留在對話紀錄裡）：

```
export TYPESAFE_API_KEY=...        # 放進你的 shell 設定
/jev key <你的 TypeSafe key>
```

用 `/jev` 看狀態。更新：`/plugin marketplace update decision-router`，再執行 `/reload-plugins`。

> 從上游遷移：先 `/plugin uninstall jev-router@jev-router` 與 `/plugin marketplace remove jev-router`，再照上面安裝。外掛名稱沒變，`/jev` 指令與選項照舊，但 `settings.json` 裡的 `pluginConfigs` 要把鍵名改成 `jev-router@decision-router`。

## 運作方式

每個 prompt 依序經過：

1. **標記**：prompt 開頭的 `!opus`、`!sonnet` 等直接指定模型（不問路由器），`!full` 解除 effort 上限。
2. **詢問**：把路由模式、目前模型、cache 狀態、最近對話（可關）與你的任務組成一段文字，送給路由器。路由器回答兩題選擇題：用哪個模型、多少 effort，各附信心值。中文任務會多附一段說明。
3. **門檻（`gate`）**：選到比 session 更強的模型，信心要達 `minUpgradeConfidence`；選到更便宜的，要達 `minDowngradeConfidence`。不夠就留在目前模型，狀態列顯示 `held`。
4. **上下限（`limit`）**：模型不得高於 `ceiling`（除非信心達 `ceilingBreak`），不得低於 `floor`。
5. **cache 保護（`decide`）**：prompt cache 還有效時，切換模型會讓快取作廢。預設只在信心夠高時才允許升級，降級一律拒絕。
6. **effort 上限（`capEffort`）**：把推理強度壓在 `effortCap` 以下。
7. **執行與重新判斷**：用選定的模型執行；開了 `routeSteps` 時，每一步重新判斷。工具呼叫連續失敗 `escalateAfter` 次會升一級。Subagent 依任務描述另外選模型。

路由器失敗、逾時，或連續失敗三次，外掛暫停一段時間並沿用 session 的模型，不會卡住你的操作。

## 建議設定（繁體中文使用者）

寫在 `~/.claude/settings.json` 的 `pluginConfigs["jev-router@decision-router"].options`：

```json
{
  "models": ["sonnet", "opus", "fable"],
  "floor": "sonnet",
  "ceiling": "opus",
  "ceilingBreak": 0.85,
  "minUpgradeConfidence": 0.3,
  "minDowngradeConfidence": 0.6,
  "cacheTtlMs": 300000,
  "sendHistory": true
}
```

- `models` 只列你願意用的模型。路由器只能在清單內選，所以清單裡沒有 haiku 時，`floor: haiku` 沒有意義。
- `ceiling: opus` 加 `ceilingBreak: 0.85`：Fable 要路由器非常確定才會用。
- 升級門檻低、降級門檻高：複雜任務容易升上去，要降下來必須有把握。
- `cacheTtlMs: 300000`（5 分鐘）：cache 保護只維持這麼久。設成 1 小時會讓一次選到 Fable 的結果在一小時內黏住整個 session。
- `sendHistory: true`：路由器看得到前幾句對話，「繼續」「用第二個」這類短句才判斷得準。代價是對話內容（已遮蔽機密）會送到路由器，處理敏感內容時請關掉。

所有選項與預設值見 [OPTIONS.md](OPTIONS.md)。預設值是 `lean` 組合（上限 Sonnet、effort 最高 medium）。

## 指令

| 指令 | 作用 |
|---|---|
| `/jev`、`/jev status` | 目前設定、cache、上次決定、各模型用量、估計節省 |
| `/jev efficient` `balanced` `cheap` | 路由模式，下個任務生效 |
| `/jev preset lean\|balanced\|max` | 一次切換上限、effort 上限與模式 |
| `/jev ceiling <模型\|none>`、`/jev floor <模型\|none>` | 模型上下限 |
| `/jev cap <effort\|none>`、`/jev full` | effort 上限；`full` 只解除下一個 prompt |
| `/jev sticky off\|auto\|strict` | cache 保護強度 |
| `/jev on`、`/jev off` | 啟用／停用，停用時用 session 的模型 |
| `/jev key <key>`、`/jev stats clear` | 存金鑰；重設節省統計 |

Prompt 標記（只對該 prompt 有效，送給模型前會移除）：`!haiku` `!sonnet` `!opus` `!fable` `!full` `!cheap` `!efficient`。

狀態列說明：`opus (kept 🔒 cache warm; wanted haiku)` 是 cache 保護留下了目前模型；`sonnet (held: conf 50% too low to switch; wanted opus)` 是信心沒達門檻；`⤓xhigh` 是 effort 被上限壓低；`⤒opus` 是被模型上限壓低；`↑` 是失敗升級；`📌` 是手動指定。

## 換路由器

預設 TypeSafe Jev。Laya、Kev 這類同樣支援 `/v1/systemone` 介面的自架模型也能用，設定 `router`（`jev`、`laya`、`kev`），或用 `routerUrl` 與 `routerModel` 指向任何相容端點。TypeSafe 金鑰只送到 `api.typesafe.ai`。金鑰只會經由 https 或本機位址送出。

## 隱私與安全

會送出：prompt（最多 `maxTaskChars` 字）、可選的最近對話、subagent 任務文字。送出前先遮蔽私鑰、各家金鑰格式、JWT、`Bearer`／`Basic` 標頭、`password=`／`HashKey=` 這類賦值、URL 帳密與中文「密碼是…」。**這是樣式比對，不保證抓得到所有機密**，詳見 [SECURITY.md](SECURITY.md)。

## 成效：已量測與未量測

- **上游的量測**（英文任務、每個數字都是真實 Claude Code 執行，見 [benchmarks/](benchmarks/README.md)）：相對於一律用 Opus，小任務約省 97%、日常任務約省 65%；較難任務（隱藏測試評分）`lean` 約為 Opus 成本的 39%，40 題完成 39 題，而一律用 Sonnet 為 38%。長時間暖機 session 是弱點，`lean` 平均成本與 Opus 相當，一律用 Sonnet 便宜約 43%。這些是上游在當時預設值與四個模型下量的，本 fork 沒有重測。
- **繁中處理的效果還沒量測。** `benchmarks/cases-zh-tw.json` 有 60 題（30 題由英文翻譯、30 題台灣情境，例如統一編號、綠界、電子發票、LINE Login、Big5 遷移），`benchmarks/analyze-zh.mts` 會比較不同路由器與有無中文說明的差異，需要 TypeSafe 金鑰才能跑，指令見 [benchmarks/README.md](benchmarks/README.md)。在跑出結果前，請把中文說明視為「有理由改善、但未證實」。

## 開發

```
claude plugin test .       # 測試
claude plugin validate .   # 驗證
npm ci && npm run typecheck && npm run check:defaults
```

CI 會跑同樣的檢查。程式在 `hooks/register.tsx`，測試在 `hooks/*.test.ts`。

## 授權

[MIT](LICENSE)。原作者 Dominic Rico Gómez。與 Anthropic、TypeSafe 無關。
