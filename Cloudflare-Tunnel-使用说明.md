# 使用 Cloudflare Tunnel 实现外网访问

通过 Cloudflare Tunnel（cloudflared）可将本机前端暴露到公网，获得一个 **HTTPS 临时网址**，无需公网 IP、无需改路由器。

---

## 一、安装 cloudflared

### Windows（推荐）

```powershell
winget install Cloudflare.cloudflared
```

安装完成后，**新开一个终端**，执行 `cloudflared --version` 确认安装成功。

### 其他系统

- **Mac**：`brew install cloudflared`
- **Linux**：见 [Cloudflare 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)

---

## 二、先启动本项目

隧道是把「本机已运行的服务」暴露出去，所以需要先启动前后端：

1. **终端 1 - 后端**
   ```bash
   cd backend
   npm run dev
   ```
   保持运行，看到 `后端运行在 http://localhost:3001` 即可。

2. **终端 2 - 前端**
   ```bash
   cd frontend
   npm run dev
   ```
   保持运行，看到 `Local: http://localhost:5173` 即可。

前端 5173 已把 `/api`、`/uploads`、`/images` 代理到 3001，**只需暴露 5173**。

---

## 三、启动隧道（快速隧道，无需登录）

在**第三个终端**中执行：

```bash
cloudflared tunnel --url http://localhost:5173
```

- 首次运行会提示安装/更新，完成后会输出类似：
  ```text
  Your quick Tunnel has been created! Visit it at:
  https://xxxx-xx-xx-xx-xx.xx-xx.trycloudflare.com
  ```
- 把该 **https://...trycloudflare.com** 网址发给他人，即可在浏览器访问你的应用。
- **注意**：本次隧道会占用当前终端，关闭终端或按 Ctrl+C 会断开，下次再运行会得到**新的随机网址**（若需固定域名，需用「命名隧道」并登录 Cloudflare，见下文）。

---

## 四、使用流程小结

| 步骤 | 操作 |
|------|------|
| 1 | 安装：`winget install Cloudflare.cloudflared` |
| 2 | 启动后端：`cd backend && npm run dev` |
| 3 | 启动前端：`cd frontend && npm run dev` |
| 4 | 启动隧道：`cloudflared tunnel --url http://localhost:5173` |
| 5 | 复制终端里显示的 `https://xxx.trycloudflare.com` 发给他人访问 |

---

## 五、（可选）固定子域名：命名隧道

若希望每次都是同一个网址（如 `your-app.your-domain.com`），需使用「命名隧道」并绑定自己的域名（需在 Cloudflare 添加域名）：

1. 登录 Cloudflare：`cloudflared tunnel login`（会打开浏览器授权）。
2. 创建命名隧道：`cloudflared tunnel create zchoose`（名称可自定）。
3. 在 Cloudflare Zero Trust 或 DNS 中为该隧道配置公网主机名（CNAME 指向 `xxx.cfargotunnel.com`）。
4. 编写配置文件并运行：`cloudflared tunnel run zchoose`。

详细步骤见 [Cloudflare Tunnel 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)。  
日常演示用上面的 **快速隧道**（`cloudflared tunnel --url http://localhost:5173`）即可。

---

## 六、「Cloudflare 无法解析该地址」怎么解决

若访问 **z-choose.com** 出现 Cloudflare 提示「该网站的服务器被配置为 Cloudflare 隧道，目前 Cloudflare 无法解析该地址」，说明**隧道未连通**，按下面排查。

### 6.1 隧道程序（cloudflared）必须一直在跑

- 隧道是「你的电脑/服务器 ↔ Cloudflare」的连线，**cloudflared 一关，连线就断**，域名就解析不到。
- **你要做的**：
  1. 在**要暴露服务的那台机器**上打开终端。
  2. 若是**命名隧道**（绑定了 z-choose.com）：
     ```bash
     cloudflared tunnel run zchoose
     ```
     （把 `zchoose` 换成你实际创建的隧道名。）
  3. 若是**快速隧道**：`cloudflared tunnel --url http://localhost:5173`，终端里会给出一个 `https://xxx.trycloudflare.com` 的临时网址（不会是你自己的 z-choose.com）。
- **不要关掉这个终端**，也不要关电脑；关掉后 z-choose.com 就会再次报「无法解析该地址」。

### 6.2 用自定义域名（z-choose.com）必须用「命名隧道」

- 快速隧道（`--url http://localhost:5173`）只会给随机 `xxx.trycloudflare.com`，**不能**直接绑定 z-choose.com。
- 要用 **z-choose.com**，必须：
  1. 域名已在 Cloudflare 接管（NS 指向 Cloudflare）。
  2. 创建**命名隧道**并在 Zero Trust / Dashboard 里把 `z-choose.com` 指到该隧道。
  3. 在本机**长期运行**：`cloudflared tunnel run <隧道名>`（或配置成系统服务，见下）。

### 6.3 确保本机服务已启动且地址正确

- 隧道只是「转发」，本地必须先有服务：
  - 后端：`cd backend && npm run dev`（例如 3001）。
  - 前端：`cd frontend && npm run dev`（例如 5173）。
- 在隧道配置里，**ingress** 的地址要和实际一致，例如：
  ```yaml
  url: http://localhost:5173
  ```
  若你只暴露了后端 3001，这里就要写成 3001，且前端需能访问到该后端（同源或已配置 CORS）。

### 6.4 希望 24 小时可访问：把 cloudflared 做成服务（不用手动开终端）

#### Windows：安装为系统服务（推荐）

1. **确认配置文件存在且正确**  
   打开 `C:\Users\你的用户名\.cloudflared\config.yml`，内容应类似（隧道 ID 和路径换成你自己的）：

   ```yaml
   tunnel: d6de3265-53fc-4250-86f2-03212afc156a
   credentials-file: C:\Users\你的用户名\.cloudflared\d6de3265-53fc-4250-86f2-03212afc156a.json

   ingress:
     - hostname: z-choose.com
       service: http://localhost:5173
     - service: http_status:404
   ```

2. **用管理员身份打开 PowerShell 或 CMD**  
   右键「开始」→「终端(管理员)」或「命令提示符(管理员)」。

3. **安装服务**  
   执行：
   ```bash
   cloudflared service install
   ```
   成功后，cloudflared 会作为 **Windows 服务** 安装，并读取上述 config.yml 运行隧道。

4. **启动服务并设为开机自启**  
   - 启动服务：`net start cloudflared`  
   - 设为自动： Win + R → 输入 `services.msc` → 找到 **Cloudflare Tunnel**（或 **cloudflared**）→ 右键「属性」→「启动类型」选 **自动** → 确定。  
   之后开机或重启，隧道会自动在后台跑，无需再手动开终端执行 `cloudflared tunnel run zchoose-tunnel`。

5. **日常使用说明**  
   隧道服务只负责「把 z-choose.com 转到你本机」。要让网站能打开，本机仍需运行 **前端**（5173）和 **后端**（3001）。需要访问 z-choose.com 时，照常开两个终端跑 `npm run dev` 即可；隧道已由服务在后台维持，不用再手动开通道。

**常用命令**（在管理员终端中）：
- 启动服务：`net start cloudflared`
- 停止服务：`net stop cloudflared`
- 卸载服务：`cloudflared service uninstall`

---

- **Windows（其它方式）**：也可用 NSSM 或「任务计划程序」在开机时启动 `cloudflared tunnel run zchoose-tunnel`（或写一个 .bat 放启动文件夹）。
- **Linux**：可建 systemd 服务，例如：
  ```bash
  sudo cloudflared service install
  ```
  或按 [Cloudflare 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/run-tunnel/as-a-service/) 配置。

### 6.5 小结

| 现象 | 原因 | 处理 |
|------|------|------|
| z-choose.com 提示「无法解析该地址」 | 隧道未连通（cloudflared 未运行或已断） | 在暴露服务的那台机上执行 `cloudflared tunnel run <隧道名>` 并保持运行 |
| 关掉终端后又打不开 | 关终端会结束 cloudflared 进程 | 把 cloudflared 配置成系统/计划任务，开机自启 |
| 想用 z-choose.com 而不是随机网址 | 快速隧道不支持自定义域名 | 用命名隧道 + Cloudflare 里把 z-choose.com 指到该隧道 |

---

## 七、安全提示

- 快速隧道生成的网址**任何人拿到链接都能访问**，请勿在链接中暴露敏感信息。
- 生产环境建议使用《部署与安全说明.md》中的服务器部署 + HTTPS + 强 JWT 等方式。
