---
title: SuperPower x LangChain
date: 2026-10-27
summary: 運用SuperPower與LangChain構建你的RAG聊天BOT
cover: /blog/superpower-langchain/superpower-langchain.png
---

# 動機

在各項行業領域，RAG已成為各個企業的標配，無論是方便讓使用者了解企業服務跟快速導向到企業產品，RAG+聊天機器人方式互動，就變得格外重要以及便利,而在程式碼撰寫，也不用自己一個一個手刻，運用langchain + superpower方法論來達成我們的聊天系統，而我這次先用個人網站範例來建構一套RAG聊天機器人。

# 實作方式

## Superpowers 方法論

Superpowers 是一套以 TDD 為核心的 AI 開發工作流 出處 https://github.com/obra/superpowers。
它讓 Agent 照軟體工程的紀律做事：先釐清需求，再寫計畫，最後用「先寫測試、再寫程式」的方式實作。每一步都有檢查點，不會一句話就讓 AI 直接開寫。

### 1. 需求釐清：`/superpower:brainstorming`
這是一切的起點。Agent 會不斷提問，引導你說出「真正想要什麼」和「為什麼要做」，再把它的理解複述給你確認、修正。
- 小改動：在對話中達成共識即可
- 完整專案：產出一份設計文件（design doc），作為後續規劃的依據

### 2. 拆解計畫：`/superpower:writing-plans`
設計確認後，呼叫 `writing-plans`，把設計文件拆成可執行的開發計畫。每個任務都很小（約 2–5 分鐘），並寫明要改哪些檔案、完整程式碼，以及怎麼驗證。

⚠️ 這一步最需要人介入：計畫產出後，**一定要親自讀過**，找出不符合需求的地方。你可以自己手動修改，或跟 Agent 討論調整。計畫錯了，後面執行得再快也是白做。

### 3. 執行開發：`/superpower:subagent-driven-development` 或 `/superpower:executing-plans`
計畫定案後，Agent 會問你要用哪種方式執行，並給出建議，但最後由你決定：

| 方式 | 做法 | 適合 |
|---|---|---|
| `subagent-driven-development` | 每個任務派一個全新的 subagent 執行，每完成一個就 review 一次 | 重視品質、較複雜的專案（最嚴謹） |
| `executing-plans` | 在目前的對話中依序完成所有任務，最後對整個分支 review 一次 | 規模較小、想省 token（最省） |

### 4. 過程中自動運作的機制（依發生順序）
- `/superpower:using-git-worktrees`：設計核准後，建立獨立的 worktree 和新分支，跑專案設定，確認測試基準乾淨，不汙染主線。
- `/superpower:test-driven-development`：強制 RED → GREEN → REFACTOR。先寫會失敗的測試並確認它失敗，再寫最少的程式讓它通過，然後 commit。沒先寫測試就寫出的程式碼會被刪掉。
- `/superpower:requesting-code-review`：任務之間對照計畫審查，問題依嚴重程度回報，Critical 等級的問題會擋住進度。
- `/superpower:finishing-a-development-branch`：所有任務完成後驗證測試，讓你選擇 merge、開 PR、保留或捨棄分支，並清理 worktree。

> 小結：人負責「確認需求」和「審核計畫」這兩個關鍵決策點，其餘交給 Agent 依紀律執行。


## 軟體架構說明

程式語言我一律先用Python

### LangChain
LangChain 是python based用於串接 LLM 的開發框架，它本身不是一個服務。我用它來串接 Ollama 上的兩個模型：

* llama3.1：負責生成回答。
* mxbai-embed-large：負責把文字轉成向量。

LangChain Service 是我用 FastAPI 和 LangChain 寫的聊天服務。收到訪客的訊息後，處理流程如下：
1. 把問題轉成向量，到 Qdrant 找出最相關的文件片段（只存關於我的資訊）。
2. 如果相似度都低於門檻（0.6），就直接回覆「找不到相關資訊」，不呼叫 LLM。這樣可以避免模型亂編答案。
3. 把人設（persona.yaml）、Redis 裡的對話上下文和檢索到的片段組成 prompt，交給 llama3.1 生成回答。
4. 回答以串流（SSE）逐字回傳給前端，並附上引用的文件來源。
### Qdrant
Qdrant 是向量資料庫，專門用來做語意相似度搜尋。文件上傳後，會依序經過以下步驟：

1. 擷取文字，切成小段（chunk）。
2. 每一段用 mxbai-embed-large 轉成 embedding（1024 維的向量），存進 Qdrant，同時記錄來源檔名和頁碼。
3. 訪客提問時，LangChain Service 會用同一個模型把問題轉成向量，再用餘弦相似度（cosine）找出最接近的片段，這就是 RAG 的「檢索」步驟。

目前支援 MD 和 PDF，之後會擴充到 PPT、影片和音訊（音訊與影片會先轉成逐字稿再處理）。

### PostgreSQL
PostgreSQL 是關聯式資料庫，負責需要永久保存的資料：

* documents：文件資訊，包括檔名、類型、片段數和上傳時間。另外會用 SHA-256 記錄檔案指紋，防止同一份文件重複上傳。
* chat_logs：所有問答紀錄，包括問題、回答、引用來源，以及是否為「找不到」的回覆，供日後檢視。查看那些「找不到」的問題，可以判斷要補哪些文件，或要不要調整門檻。
### Redis
Redis 是記憶體型資料庫，負責短期、會過期的資料：

* 對話上下文：以 session 為單位，保留最近 6 輪對話，讓 bot 能理解「那之後呢？」這類追問。閒置 1 小時後自動清除，所以只在同一次瀏覽中有記憶。
* 流量限制：計算每個 IP 每分鐘的請求次數，超過上限就拒絕，避免家裡的 GPU 被灌爆。
### Ollama
Ollama 直接跑在主機上（不在 Docker 裡），用 GPU 執行 llama3.1 和 mxbai-embed-large。容器透過 host.docker.internal:11434 連到它，圖上的虛線就是這段連線。

### FastAPI（api / admin）
同一份程式碼啟動成兩個服務：
* api（8000）：公開的聊天 API，透過 ngrok 對外。
* admin（8001）：文件 CRUD 和問答紀錄查詢，只綁定本機，需要 X-API-Key，不對外公開。
### ngrok(把家裡的主機對外公開如果是家機很重要)
* ngrok 把家裡的 8000 port 開成一個公開的 HTTPS 網址，讓部署在 GitHub Pages 的前端能連進來。它只轉發 8000，admin 不會被暴露。

### 架構圖
![RAG設計架構](/blog/superpower-langchain/rag_chatbot.png)

### 用superpower實作

我們一開始會先用官方起手式 /superpowers:using-superpowers 來做需求釐清，你可以直接複製下列提示詞，他是我軟體架構的策略，但是部屬環境,前端你要改一下就可以


``` ymal
/superpowers:using-superpowers 
## 目標
幫我的個人網站做一個聊天 bot 後端，讓訪客詢問「關於我」的問題（經歷、專案、技能），
回答只能根據我上傳的文件（RAG），不能亂編。

## 技術堆疊
FastAPI + LangChain + Ollama（llama3.1 生成、mxbai-embed-large 向量化）
+ Qdrant（文件向量）+ Redis（session 上下文）+ Postgres（文件資訊、問答紀錄）
全部用 docker-compose 啟動；Ollama 跑在主機上，用 GPU。

## 部署環境
- 跑在我家的 Windows 電腦（單張 GPU，同時只能處理一個 LLM 請求）
- 前端在 GitHub Pages或用你既有的前端，透過 ngrok 連到後端
- 只有聊天 API 對外；管理 API 只在本機使用，不經過 ngrok

## 功能需求
1. 文件 CRUD（管理 API，需要 API key）：目前支援 md、pdf，未來會加影片、音訊，
   loader 要設計成可擴充；同一份內容不能重複上傳
2. 聊天 API：支援一次性回傳和 SSE 串流，回答附上引用來源
3. 上下文：只在同一次瀏覽（session）中記得，閒置後自動過期
4. 找不到相關文件時，直接回「找不到相關資訊」，不呼叫 LLM
5. bot 個性放在 config 檔（yaml），我之後自己填
6. 所有問答永久保存，供我日後查詢、檢視哪些問題答不出來
7. 流量限制（每個 IP 每分鐘 N 次），GPU 忙碌時回 503

## 不在這次範圍
- 前端聊天視窗（之後另外做，但「對話會被記錄」的提示由前端負責）
- 影片、音訊的實作（只預留擴充點）
- 使用者登入

## 驗收標準
- 單元測試全過，外部依賴（Ollama、Redis）可以用 fake 替換
- docker compose up 後，用腳本跑完上傳 → 提問 → 追問 → 無關問題 fallback → 刪除的流程
- README 寫清楚啟動、ngrok、API 範例、門檻調整方式

## 工作方式
先 brainstorming 產出設計 spec，再寫實作計畫，用 TDD 執行；
不確定的地方問我，一次問一題。
```


## 產出結果

### 客戶端
在客戶端你輸入localhost:8000/docs,你就會看到客戶端API接口，
 * 一般chat
 * stream chat方法-我推薦用這，他會一個字一個字吐給客戶
 * health: 偵測後端是否還狀態'
![客戶端API](/blog/superpower-langchain/customer_chat.png)

### 管理者端
在管理者端輸入 http://localhost:8001/docs,你就會看到管理者端API接口，
你會看到CRUD document的request，以及chatlog
![管理者API](/blog/superpower-langchain/admin_chat.png)