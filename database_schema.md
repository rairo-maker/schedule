# 行程規劃器資料庫結構規劃

## 目的

這份文件是為了把目前前端行程規劃器，逐步改造成：

- 登入後由資料庫提供資料
- 行程新增 / 編輯 / 刪除都寫入資料庫
- 匯出資料時從資料庫查詢
- 權限依登入帳號與資料表規則控制

本文件專注在：

- 資料表設計
- 欄位說明
- 關聯設計
- RLS 權限方向

先不寫正式 SQL 程式碼實作，只先把 schema 規劃清楚。

---

## 整體架構

建議資料結構如下：

1. `profiles`
   - 使用者基本資料與角色
2. `trips`
   - 旅程主表
3. `trip_items`
   - 行程明細表

未來如果要支援多人共享，再擴充：

4. `trip_members`
   - 旅程共享成員與權限

目前這一版先以：

- 一個使用者可以有多個旅程
- 一個旅程有多個行程項目

為主。

---

## 資料表設計

## 1. `profiles`

用途：

- 對應 Supabase Auth 的使用者
- 保存使用者名稱與角色

來源：

- `auth.users`

主鍵：

- `id`

建議欄位：

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---:|---|
| `id` | `uuid` | 是 | 對應 `auth.users.id` |
| `username` | `text` | 是 | 系統內顯示名稱 |
| `role` | `text` | 是 | `admin` / `user` |
| `created_at` | `timestamptz` | 是 | 建立時間 |

補充：

- `role` 不應由前端登入頁決定
- `role` 應由資料庫保存並在登入後查詢

---

## 2. `trips`

用途：

- 每一筆代表一個旅程主檔

主鍵：

- `id`

外鍵：

- `user_id -> profiles.id`

建議欄位：

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---:|---|
| `id` | `uuid` | 是 | 旅程 ID |
| `user_id` | `uuid` | 是 | 所屬使用者 |
| `name` | `text` | 是 | 旅程名稱 |
| `start_date` | `date` | 是 | 旅程起始日 |
| `duration_days` | `integer` | 是 | 旅程天數 |
| `show_all` | `boolean` | 是 | 是否顯示全部日期 |
| `created_at` | `timestamptz` | 是 | 建立時間 |
| `updated_at` | `timestamptz` | 是 | 更新時間 |

建議預設值：

- `duration_days = 7`
- `show_all = false`
- `created_at = now()`
- `updated_at = now()`

約束建議：

- `name` 不可為空字串
- `duration_days >= 1`
- 建議限制 `duration_days <= 40`

設計原因：

- 原本畫面固定 7 天
- 未來改為由旅程主檔決定顯示天數
- `duration_days` 應放在 `trips`，不應分散在前端 UI 狀態

---

## 3. `trip_items`

用途：

- 每筆代表旅程內的一個行程項目

主鍵：

- `id`

外鍵：

- `trip_id -> trips.id`

建議欄位：

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---:|---|
| `id` | `uuid` | 是 | 行程項目 ID |
| `trip_id` | `uuid` | 是 | 所屬旅程 |
| `title` | `text` | 是 | 行程名稱 |
| `location` | `text` | 否 | 地點 |
| `transport` | `text` | 否 | 交通方式 |
| `budget` | `numeric` 或 `integer` | 否 | 預算 |
| `start_local` | `timestamp` 或 `timestamptz` | 是 | 行程時間 |
| `notes_html` | `text` | 否 | 備註內容 |
| `created_at` | `timestamptz` | 是 | 建立時間 |
| `updated_at` | `timestamptz` | 是 | 更新時間 |

預算欄位建議：

- 若只處理整數金額，可用 `integer`
- 若未來可能有小數，改用 `numeric(12,2)`

時間欄位建議：

- 若系統主要以單一地區使用，且畫面邏輯目前偏向本地時間，可先用 `timestamp`
- 若未來考慮跨時區同步，建議改用 `timestamptz`

---

## 關聯設計

### 一對多

- `profiles 1 -> many trips`
- `trips 1 -> many trip_items`

### 刪除策略建議

- 刪除 `trip` 時，底下 `trip_items` 一起刪除

也就是：

- `trip_items.trip_id` 建議使用 `ON DELETE CASCADE`

### `profiles` 刪除策略

- 若刪除使用者，是否一起刪除旅程資料，需看產品需求

建議初版：

- 先採用 `ON DELETE CASCADE`

好處：

- 架構簡單
- 不會留下孤兒資料

---

## 推薦欄位索引

為了查詢效率，建議加索引：

### `trips`

- `user_id`
- `user_id, created_at`

### `trip_items`

- `trip_id`
- `trip_id, start_local`

如果未來會常用日期篩選：

- `trip_id, start_local`

會非常重要。

---

## RLS 權限規劃

這是最重要的一段。

---

### `profiles`

目標：

- 使用者只能讀自己的 profile
- 使用者只能建立自己的 profile
- 使用者只能更新自己的 profile
- 管理員若未來需要看全部資料，建議用 `SECURITY DEFINER function`

基本原則：

- 不要讓 policy 直接遞迴查自己造成 recursion

---

### `trips`

目標：

- 使用者只能讀自己的旅程
- 使用者只能新增自己的旅程
- 使用者只能更新自己的旅程
- 使用者只能刪除自己的旅程

判斷依據：

- `trips.user_id = auth.uid()`

---

### `trip_items`

目標：

- 使用者只能操作自己旅程底下的行程項目

判斷方式：

- 不能只看 `trip_items` 自己
- 要透過 `trip_id` 對應到 `trips.user_id`

也就是概念上：

- 如果這筆 `trip_item` 所屬的 `trip` 是我自己的，我才能操作

---

## 建議的權限邏輯

### `trips`

- SELECT：`user_id = auth.uid()`
- INSERT：`user_id = auth.uid()`
- UPDATE：`user_id = auth.uid()`
- DELETE：`user_id = auth.uid()`

### `trip_items`

- SELECT：該 `trip_id` 屬於 `auth.uid()`
- INSERT：新增的 `trip_id` 必須屬於 `auth.uid()`
- UPDATE：該筆資料所屬 `trip_id` 必須屬於 `auth.uid()`
- DELETE：該筆資料所屬 `trip_id` 必須屬於 `auth.uid()`

---

## 前端資料結構對應

目前前端結構是多旅程格式，大致像這樣：

- `data`
  - `activeTripId`
  - `ui`
  - `trips`
    - `id`
    - `name`
    - `startDate`
    - `durationDays`
    - `items`

轉到資料庫後對應如下：

### 前端 `trips[]`

對應資料庫：

- `trips`

其中：

- `startDate -> start_date`
- `durationDays -> duration_days`

### 前端 `items[]`

對應資料庫：

- `trip_items`

### 前端 `ui`

建議初期不進資料庫，先放本地：

- `activeTripId`
- 某些純 UI 狀態

如果未來要多裝置同步 UI：

- 再考慮建 `user_settings`

---

## 是否需要 `user_settings`

目前不一定要做。

如果未來你希望同步：

- 最近選到哪個旅程
- 是否顯示全部日期
- 主題設定

那可以新增：

### `user_settings`

欄位建議：

- `user_id`
- `last_active_trip_id`
- `show_all_default`
- `theme`
- `updated_at`

但初版建議先不要加，避免範圍擴太大。

---

## 導入策略建議

### 版本 1

先完成資料表與權限

### 版本 2

讓新增 / 編輯 / 刪除行程同步寫資料庫

### 版本 3

改成頁面載入時從資料庫讀取

### 版本 4

匯出資料時改成查資料庫組 JSON，並包含 `duration_days`

---

## 舊資料搬移策略

目前專案已有前端本地資料，因此需要考慮 migration。

建議做法：

### 做法 A：首次登入時偵測本地資料

如果資料庫沒有旅程：

- 檢查本地是否有舊資料
- 若有，提示是否搬移到資料庫

### 做法 B：手動匯入舊版 JSON

使用者先：

- 匯出舊資料
- 再匯入到新版資料庫

初版建議：

- 兩種都預留

---

## 型別與實務建議

### `notes_html`

雖然目前前端會做基本清理，但資料庫仍建議只當成文字儲存。

未來若更重視安全，可考慮：

- 改儲存純文字
- 或改成結構化資料

### `budget`

如果未來要做報表，建議儘量固定型別與單位。

例如：

- 全部用台幣整數

這樣統計最單純。

### `updated_at`

建議正式實作時自動更新，不要依賴前端自己傳。

### `duration_days`

這個欄位應視為旅程主設定的一部分。

建議規則：

- 建立旅程時必填
- 編輯旅程時可修改
- 變更後看板即時依新天數重建
- 匯出 / 匯入時都必須保留

---

## 未來可擴充欄位

如果後面要升級功能，可以考慮在 `trip_items` 加：

- `status`
  - 未開始 / 完成 / 延後
- `category`
  - 住宿 / 交通 / 工作 / 景點 / 餐飲
- `sort_order`
  - 手動拖曳排序用
- `map_url`
  - 若未來需要自訂地圖連結

在 `trips` 加：

- `description`
- `cover_image`
- `is_archived`

如果之後做更進階旅程設定，也可加：

- `timezone`
- `currency`
- `default_transport`

---

## 目前結論

你現在最適合落地的資料庫結構是：

- `profiles`
- `trips`
- `trip_items`

這三張表就足夠支撐：

- 多旅程管理
- 自訂旅程天數
- 預算統計
- 行程明細
- 匯入 / 匯出
- 使用者隔離

---

## 下一步建議

看完這份文件後，下一步最適合做的是：

1. 把這份 schema 轉成正式 SQL 草稿
2. 在 Supabase 建立資料表與 RLS
3. 再開始改前端程式

如果你要，我下一步可以直接幫你建立：

- `database_schema.sql`

內容會是：

- 建表 SQL
- foreign key
- index
- RLS policy
- 可直接貼進 Supabase SQL Editor 執行
