# 传讯 · 单页版

模拟与「梦角」聊天的纯前端单页应用。无后端，全部数据保存在浏览器本地（localStorage + IndexedDB/localforage）。

## 两种部署方式

### 方式一（推荐）：只上传 `index.html`
`build/index.html` 是把 CSS 与全部 JS 内联后的**单文件版**，所有样式与逻辑都在这一个文件里。

1. 打开 GitHub 仓库 → `Add file` → `Upload files`
2. 把 `index.html` 拖进去 → `Commit changes`
3. 等 1～2 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`

> 注意：网页端上传**不会解压 zip**。不要上传压缩包，也不要把外层文件夹一起拖进去（会多一层目录，导致页面 404）。

### 方式二：结构化上传
想以后方便改代码，就上传下面这套目录（保持层级不变）：

```
index.html
css/styles.css
js/……（含 js/features/ 下的各个功能模块）
```

在 GitHub 网页端可以用 `Add file → Upload files` 一次性拖入 `index.html`、`css`、`js` 三个条目（拖文件夹会自动保留内部结构）。

## 目录结构

```
index.html                  页面骨架（主页、聊天、各功能弹窗）
css/styles.css              全站样式（含主页、朋友圈、经期日历等）
js/config.js                常量与默认配置
js/utils.js                 工具函数（含会话就绪等待器）
js/state.js                 全局状态与 DOM 引用
js/core.js                  核心：会话、消息、设置、存储
js/features/home.js         主页（相框、签名、时间问候、纪念日、主页主题）
js/features/diary.js        日记本
js/features/memo.js         备忘录（对方在聊天里提醒）
js/features/profiles.js     对象管理（多档案数据隔离）
js/features/moments.js      朋友圈（动态）
js/features/period.js       经期记录（日历视图）
js/features/link-status.js  链接状态（3 小时锁定）
js/features/redpacket.js    红包 / 转账
js/features/decision-ask.js 询问 · 抉择
js/features/envelope.js     信件 · 信封投递
js/features/reply-library.js 字卡库（自定义回复）
js/features/mood.js         心晴手账 / 今日公告
js/features/call.js         视频通话
js/features/group-chat.js   群聊
js/features/theme-editor.js 主题与外观
js/onboarding.js            使用前声明与新手引导
js/listeners.js             事件绑定
js/app.js                   启动入口
```

## 功能一览

- **主页**：头像 + 链接波纹 + 随机签名；三合一相框（单击轮换、点击添加、长按更换 / 删除）；日期时间问候；Ta 的状态（心晴手账）；相遇纪念日；聊天 / 朋友圈 / 信件；字卡库 / 高级功能 / 设置。主题色、相框颜色与背景图可在「外观设置 → 主页主题」自定义。
- **聊天**：顶栏保留 主页 / 会话 / 群聊 / 公告 / 日夜切换；链接状态 3 小时内锁定（四级为「云水泱泱」）；底栏为「让对方说话 · +（视频通话 / 相册 / 问一问 / 红包转账）· 输入框 · 表情 · 发送」。
- **朋友圈**：参考微信朋友圈的封面 + 动态流，支持点赞、评论与相遇日期设置。
- **信件**：信封投递，寄出 / 收到分栏。
- **字卡库**：自定义回复的全部功能。
- **高级功能**：消息统计、悬浮音乐播放器、运势占卜、询问 · 抉择、经期记录（日历）、重要日、日记本、备忘录。
- **设置**：外观设置、聊天设置（含红包概率）、数据管理、对象管理（多档案切换，数据互不干扰）。

## 数据说明

- 数据只存在当前浏览器，换设备 / 清缓存会丢失，建议定期在「设置 → 数据管理」导出备份。
- 切换「对象管理」中的档案后，聊天、动态、设置等数据各自独立保存。
