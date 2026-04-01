# Supabase 設定說明

## 1. 創建 Supabase 專案
1. 前往 [supabase.com](https://supabase.com) 註冊並登入
2. 點擊 "New project" 創建新專案
3. 填入專案名稱、資料庫密碼等資訊
4. 選擇地區（建議選擇最近的地區以獲得更好的性能）
5. 等待專案創建完成（通常需要幾分鐘）
6. 在專案設定中記下：
   - Project URL
   - API Key (anon public)

## 2. 更新應用程式憑證
在以下文件中將佔位符替換為您的實際 Supabase 憑證：

### login.html (第8-9行)
```javascript
const SUPABASE_URL = 'https://vztealcurhcjvkrrtvui.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_aLGlNwheFAthxrd0LReqQg_H0XfStht';
```

### app.js (第4-5行)
```javascript
const SUPABASE_URL = 'https://vztealcurhcjvkrrtvui.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_aLGlNwheFAthxrd0LReqQg_H0XfStht';
```

## 3. 創建資料庫表
在 Supabase Dashboard 中：

1. 進入 "SQL Editor"
2. 複製並執行以下 SQL 語句：

```sql
-- 創建 profiles 表來存儲用戶角色資訊
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 啟用 Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 創建政策：用戶只能查看自己的資料
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- 創建政策：允許插入新用戶資料 (註冊時)
CREATE POLICY "Users can insert own user profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'user');

-- 創建政策：允許更新自己的資料
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 如果未來需要管理員查看全部 profiles，不要直接在 policy 裡查 profiles 自己，
-- 否則會出現 "infinite recursion detected in policy for relation profiles"。
-- 請改用 SECURITY DEFINER function：
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());
```

## 4. 註冊測試用戶
有兩種方式註冊用戶：

### 方式一：使用 Supabase Auth UI
1. 在 Supabase Dashboard 中進入 "Authentication" > "Users"
2. 點擊 "Add user" 手動添加用戶
3. 記下用戶的 UUID

### 方式二：讓用戶自行註冊（推薦）
1. 創建一個簡單的註冊頁面或在登入頁面添加註冊功能
2. 使用 `supabase.auth.signUp()` 註冊用戶
3. 註冊成功後，一般使用者可在首次登入時自動建立 `profiles`

### 插入用戶角色資料
管理者帳號需要手動在 profiles 表中建立角色資訊。一般使用者可由登入流程在首次登入時自動建立 `role = 'user'` 的 profile。

```sql
-- 管理員用戶範例
INSERT INTO public.profiles (id, username, role)
VALUES ('用戶的-uuid-這裡', 'admin_username', 'admin');

-- 一般用戶如需手動建立，也可使用以下方式
INSERT INTO public.profiles (id, username, role)
VALUES ('用戶的-uuid-這裡', 'user_username', 'user');
```

**注意**：
- 將 '用戶的-uuid-這裡' 替換為實際的用戶 UUID
- username 必須是唯一的
- role 只能是 'admin' 或 'user'

## 5. 使用流程
1. 開啟瀏覽器訪問 `login.html`
2. 輸入已註冊的電子郵件和密碼
3. 點擊登入按鈕
4. 如果是一般使用者且尚未建立 `profiles`，系統會在首次登入時自動建立
5. 登入成功後自動跳轉到 `index.html` 主頁面
6. 在主頁面點擊「登出」按鈕可返回登入頁面

## 6. 測試檢查清單
- [ ] 訪問 `login.html` 能正常顯示登入表單
- [ ] 輸入正確的帳號密碼能成功登入
- [ ] 登入後能自動跳轉到主頁面
- [ ] 主頁面顯示歡迎訊息和用戶角色
- [ ] 點擊登出能返回登入頁面
- [ ] 未登入直接訪問 `index.html` 會跳轉到登入頁面
- [ ] 一般使用者首次登入時可自動建立 `profiles`
- [ ] 管理者需先手動建立 `profiles.role = 'admin'`

## 7. 故障排除

### 常見問題：

**Q: 為什麼登入頁沒有角色選擇？**
A: 角色不應由前端自行指定，否則容易被繞過。系統會在登入後直接讀取 `profiles.role`，以資料庫中的角色為準。

**Q: 管理者帳號為什麼不能自動建立？**
A: 為了避免任何人第一次登入就把自己升成 admin，管理者角色必須手動在 `profiles` 表建立。

**Q: 顯示 "infinite recursion detected in policy for relation profiles"**
A: 代表 `profiles` 的 RLS policy 直接查了 `profiles` 自己。請刪除原本的管理員查詢 policy，改用上方的 `public.is_admin()` function 版本。

**Q: 無法連接到 Supabase**
A: 檢查網路連線和憑證是否正確設定。

**Q: 創建表時出現權限錯誤**
A: 確認您有足夠的資料庫權限。

**Q: RLS 政策設定錯誤**
A: 確保所有政策都正確設定，特別是 auth.uid() 的使用。

### 開發者工具檢查：
1. 開啟瀏覽器開發者工具 (F12)
2. 查看 Console 分頁是否有 JavaScript 錯誤
3. 查看 Network 分頁確認 API 請求是否成功
4. 檢查 Supabase Dashboard 的 Logs 查看資料庫操作

### 獲取用戶 UUID：
在 Supabase Dashboard > Authentication > Users 中可以查看所有用戶的 UUID。
