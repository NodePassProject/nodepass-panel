# NodePanel 轻量化管理面板

这是一个由 [NodePass (yosebyte/nodepass)](https://github.com/yosebyte/nodepass) 强力驱动的前端管理面板，提供了一个用户友好的WebUI来管理您的 NodePass 服务。

## Demo

1. [Deployed on OpenBSD](https://node-panel.lesliealexander.eu)
2. [Deployed on Vercel](https://node-panel.vercel.app)

## 部署

### 部署到 Vercel

Vercel 是部署此前端面板的推荐方式之一。

1.  **Fork 本仓库** (如果你还没有这样做)。
2.  登录到你的 [Vercel](https://vercel.com) 账户。
3.  点击 "New Project"。
4.  选择 "Import Git Repository"，然后选择你 Fork 的仓库。
5.  Vercel 通常会自动检测到这是一个 Next.js 项目并配置好构建设置。确认设置无误。
6.  点击 "Deploy"。

部署完成后，你将获得一个 Vercel 域名 (例如 `xxx.vercel.app`)，前端面板将通过该域名访问。

### 部署到 Cloudflare Pages

Cloudflare Pages 对 Next.js 应用提供了良好的支持，能够将其部署到 Cloudflare 的全球边缘网络，实现快速、稳定的访问体验。

#### 步骤如下：

1. **Fork 本仓库**（如果尚未 Fork）。
2. 登录你的 [Cloudflare 账户](https://dash.cloudflare.com/)。
3. 在控制台主页，导航至 **Workers & Pages**。
4. 点击 **Create application** → 选择 **Pages** 选项卡 → 点击 **Connect to Git**。
5. 选择你 Fork 的仓库，点击 **Begin setup** 开始配置。
6. 配置项说明：

   * **项目名称**：可保持默认或自定义；
   * **生产分支**：选择 `main` 或 `master` 等你的主要分支。
7. 在 **Build settings**（构建设置）部分：

   * **框架选择**：`Next.js`；
   * **构建命令**：`npx @cloudflare/next-on-pages@1`；
   * **构建输出目录**：`.vercel/output/static`。
8. 点击 **Save and Deploy** 开始部署。
9. 如构建失败，请前往「设置 → 运行时 → 兼容性标志」，输入并选择 `nodejs_compat` 保存，然后**重新部署** 。

部署完成后，Cloudflare Pages 将为你的项目分配一个 `*.pages.dev` 域名，例如：`your-project.pages.dev`。你可以通过此域名访问你的前端页面。

## 📄 许可证

该项目基于 [MIT](LICENSE) 许可证发布。

## 🙏 致谢

*   [Yosebyte](https://github.com/yosebyte/) - [NodePass(yosebyte/nodepass)](https://github.com/yosebyte/nodepass) 核心创始人。

##### > ⚠️ 本项目为社区贡献的前端实现，旨在抛砖引玉，代码质量不代表 NodePass 官方或核心开发者的实际水平。欢迎更多开发者提交更优秀的作品，共同丰富 NodePass 的前端生态！
