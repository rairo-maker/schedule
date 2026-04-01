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
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 創建政策：允許更新自己的資料
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 創建政策：管理員可以查看所有用戶
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
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
3. 註冊成功後，在 profiles 表中插入角色和用戶名資訊

### 插入用戶角色資料
無論使用哪種方式註冊，都需要在 profiles 表中添加角色資訊：

```sql
-- 管理員用戶範例
INSERT INTO public.profiles (id, username, role)
VALUES ('用戶的-uuid-這裡', 'admin_username', 'admin');

-- 一般用戶範例
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
3. 選擇正確的角色（admin 或 user）
4. 點擊登入按鈕
5. 登入成功後自動跳轉到 `index.html` 主頁面
6. 在主頁面點擊「登出」按鈕可返回登入頁面

## 6. 測試檢查清單
- [ ] 訪問 `login.html` 能正常顯示登入表單
- [ ] 輸入正確的帳號密碼能成功登入
- [ ] 選擇錯誤的角色會顯示錯誤訊息
- [ ] 登入後能自動跳轉到主頁面
- [ ] 主頁面顯示歡迎訊息和用戶角色
- [ ] 點擊登出能返回登入頁面
- [ ] 未登入直接訪問 `index.html` 會跳轉到登入頁面

## 7. 故障排除

### 常見問題：

**Q: 登入時顯示 "角色不匹配"**
A: 確認用戶在 profiles 表中的角色設定正確，且登入時選擇的角色與資料庫中的一致。

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