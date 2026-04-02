# 資料庫驗收 Checklist

> 更新日期：2026-04-02  
> 目的：在正式把前端資料改接 Supabase 之前，先確認資料表、RLS、登入身份、基本 CRUD 與資料限制都正常。

---

## 0. 驗收前準備

- [x] 已在 Supabase 匯入 `database_schema.sql`
- [x] 已確認 `profiles`、`trips`、`trip_items` 三張表存在
- [x] 已確認 `trips.duration_days` 存在，且限制為最少 `1`、最多 `40`
- [x] 已確認 `RLS` 已在三張表上啟用
- [x] 已有至少 1 個可登入的測試帳號
- [x] 已有至少 1 個 `profiles.role = 'user'` 的測試帳號
- [x] 已手動建立至少 1 個 `profiles.role = 'admin'` 的帳號

---

## 1. 資料表結構確認

### `profiles`

- [x] `id` 型別為 `uuid`，並關聯 `auth.users(id)`
- [x] `username` 為 `text` 且不可為空
- [x] `role` 預設值為 `user`
- [x] `role` 僅允許 `admin` 或 `user`
- [x] `created_at` 預設值為 `now()`

### `trips`

- [x] `id` 型別為 `uuid`
- [x] `user_id` 關聯到 `profiles(id)`
- [x] `name` 不可為空白字串
- [x] `start_date` 型別為 `date`
- [x] `duration_days` 型別為 `integer`
- [x] `duration_days` 預設值為 `7`
- [x] `duration_days` 限制為 `1 <= duration_days <= 40`
- [x] `show_all` 預設值為 `false`
- [x] `created_at`、`updated_at` 存在

### `trip_items`

- [x] `id` 型別為 `uuid`
- [x] `trip_id` 關聯到 `trips(id)`
- [x] `title` 不可為空白字串
- [x] `location` 預設值為空字串
- [x] `transport` 預設值為空字串
- [x] `budget` 預設值為 `0`
- [x] `budget` 不可小於 `0`
- [x] `start_local` 型別為 `timestamptz`
- [x] `notes_html` 預設值為空字串
- [x] `created_at`、`updated_at` 存在

---

## 2. Trigger / Function 確認

- [x] `public.set_updated_at()` 已建立並實際生效
- [x] `trips` 的 update trigger 已建立並實際生效
- [x] `trip_items` 的 update trigger 已建立並實際生效
- [ ] `public.is_admin()` 已直接驗證
- [x] `public.owns_trip(uuid)` 已透過 `trip_items` CRUD 間接驗證
- [ ] `is_admin()` 可正常回傳目前登入者是否為 admin
- [x] `owns_trip()` 可正確判斷目前登入者是否擁有該旅程

---

## 3. `profiles` 權限測試

### 使用者本人

- [x] 使用一般使用者登入後，可以查到自己的 `profiles`
- [ ] 使用一般使用者登入後，查不到其他人的 `profiles`
- [x] 首次登入且沒有 profile 時，可自動建立 `role = 'user'`
- [x] 一般使用者不能把自己的 `role` 改成 `admin`

### 管理者

- [ ] 管理者登入後，可以查到自己的 `profiles`
- [ ] 管理者登入後，可以查到所有人的 `profiles`

### 風險確認

- [x] 前端登入頁沒有讓使用者自行選擇 `admin` / `user`
- [x] 角色判斷只依賴資料庫中的 `profiles.role`
- [x] 危險舊 policy 已清除，只保留安全版本

---

## 4. `trips` 權限與資料限制測試

### 新增

- [x] 一般使用者可以新增自己的旅程
- [x] 新增時 `user_id = auth.uid()` 才能成功
- [x] `duration_days = 1` 可以成功
- [x] `duration_days = 40` 可以成功
- [x] `duration_days = 0` 會失敗
- [x] `duration_days = 41` 會失敗
- [ ] `name` 只輸入空白會失敗

### 查詢

- [ ] 一般使用者只能查到自己的旅程
- [ ] 查不到其他使用者的旅程
- [x] 匿名角色 `anon` 看不到資料
- [x] 管理者若未另外開放 policy，不應自動看見所有旅程

### 更新

- [x] 一般使用者可以修改自己的旅程名稱
- [x] 一般使用者可以修改自己的 `start_date`
- [x] 一般使用者可以修改自己的 `duration_days`
- [x] 更新後 `updated_at` 會自動變更
- [ ] 一般使用者不能修改別人的旅程

### 刪除

- [ ] 一般使用者可以刪除自己的旅程
- [ ] 一般使用者不能刪除別人的旅程
- [ ] 刪除旅程後，底下 `trip_items` 會一起被 cascade 刪除

---

## 5. `trip_items` 權限與資料限制測試

### 新增

- [x] 可以在自己的旅程底下新增行程項目
- [ ] `title` 只輸入空白會失敗
- [x] `budget = 0` 可以成功
- [ ] `budget > 0` 可以成功
- [x] `budget < 0` 會失敗
- [x] `start_local` 缺值會失敗
- [x] 不能把行程項目新增到別人的旅程底下（由 `owns_trip()` policy 設計與本次成功案例間接支持）

### 查詢

- [ ] 可以查到自己旅程底下的所有行程項目
- [ ] 查不到別人旅程底下的行程項目
- [x] 匿名角色 `anon` 看不到資料

### 更新

- [x] 可以修改自己的行程標題
- [x] 可以修改 `location`
- [x] 可以修改 `transport`
- [x] 可以修改 `budget`
- [x] 可以修改 `notes_html`
- [x] 更新後 `updated_at` 會自動變更
- [ ] 不能修改別人的行程項目

### 刪除

- [ ] 可以刪除自己旅程底下的行程項目
- [ ] 不能刪除別人的行程項目

---

## 6. 前端接資料庫前的最低通關條件

- [x] 使用者登入成功後，`profiles` 能正常取得
- [x] 可以手動新增 1 筆 `trip`
- [x] 可以手動新增 1 筆該 `trip` 底下的 `trip_item`
- [x] 重新查詢後資料仍存在
- [ ] 用另一個已登入帳號查詢時看不到前一個帳號的資料
- [x] `duration_days` 邊界值 `1` 和 `40` 都測過
- [x] `budget` 邊界值 `0` 測過
- [x] 負數 `budget` 與超出天數限制資料都會被擋下

---

## 7. 正式切換前建議再確認

- [ ] 先決定「前端寫入資料庫」要不要暫時保留 `localStorage` 備援
- [ ] 先決定舊本機資料要採「手動匯入」還是「首次登入搬移」
- [ ] 先決定匯出功能要輸出資料庫資料，還是保留 JSON 匯出雙軌
- [ ] 先決定前端是否要支援離線模式
- [ ] 先決定多裝置同步時，以資料庫為唯一真實來源

---

## 8. 驗收完成判定

以下全部成立後，再進入前端改版最穩：

- [x] 表結構正確
- [x] RLS 正確
- [x] 登入 / profile 基本流程正確
- [x] `trips` 基本 CRUD 已驗到新增、更新與限制
- [x] `trip_items` 基本 CRUD 已驗到新增、更新與限制
- [x] 邊界條件正確
- [ ] 跨已登入帳號隔離已直接驗證
- [ ] 刪除流程已直接驗證

---

## 9. 本次驗收結論

- [x] 已完成：資料表、RLS、安全性修正、基本新增/更新、約束條件、`updated_at`
- [x] 已完成：匿名角色不可讀取資料
- [ ] 待補驗：另一個已登入使用者是否看不到前一個使用者資料
- [ ] 待補驗：`delete` 與 cascade delete
- [ ] 待補驗：`name` 空白、`title` 空白、`budget > 0` 的補充案例

---

## 建議下一步

1. 先把前端「新增旅程 / 新增行程」改成寫入 Supabase
2. 暫時保留 `localStorage` 當備援
3. 在前端正式登入流程中驗證跨帳號隔離
4. 完成後再把讀取來源切到 `trips` / `trip_items`
