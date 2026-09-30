# 基础版桌面应用验收

## 发行结果

[v0.2.0 Release](https://github.com/DAYKKK03/script-workshop-core/releases/tag/v0.2.0) 提供 Windows x64 安装版与便携版、macOS Intel x64 与 Apple Silicon arm64 安装包，以及 `SHA256SUMS.txt`。公开下载、资产文件名与 SHA-256 已核对。

[Desktop packages 构建运行](https://github.com/DAYKKK03/script-workshop-core/actions/runs/36730527434) 的三个平台任务全部成功。每个平台都在临时目录启动随包 PostgreSQL，完成邀请码注册、中文商家项目创建及重启读取；打包后的 Electron 程序随后完成本地数据库启动、健康检查和注册烟测。Windows 测试使用普通权限令牌。

验收 Agent 独立核对构建记录和正式 Release，结论为**发行包自动化验收通过**。

## 尚未覆盖

真实 DeepSeek、TikHub、火山引擎等外部服务调用需要用户自己的服务参数，未包含在自动测试中。安装器图形界面全过程、系统安全提示处理及全部页面人工操作尚未验收。安装包未签名，macOS 安装包未公证。Linux CI 中的备份脚本测试另有失败，不属于这轮桌面包验收结论。

桌面应用的实际 API Key 由使用者在自己的电脑上填写。仓库不保存个人服务凭据；已提交的 `.env.example` 是空值与示例配置。
