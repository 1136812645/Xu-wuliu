# 双机故障演练记录（阶段A）

日期：2026-07-09

## 演练目标

验证在“服务器2故障”场景下，服务器1是否还能继续提供核心业务（登录 + dashboard）。

## 演练前状态

- 公网健康检查：200
- `/api/ha/instance`：api-1
- 登录与 dashboard：正常

## 故障注入

在服务器2执行：

```bash
cd ~/waybill-dist
docker compose down
```

## 故障期间验证

验证命令：

```powershell
Invoke-WebRequest http://122.224.127.36:18080/health
Invoke-RestMethod http://122.224.127.36:18080/api/ha/instance
Invoke-RestMethod http://122.224.127.36:18080/api/auth/dev-login
Invoke-RestMethod http://122.224.127.36:18080/api/dashboard
```

验证结果：

- health：200
- instance：api-1
- dev-login：成功
- dashboard：成功（waybills 返回有效）

## 恢复步骤

在服务器2执行：

```bash
cd ~/waybill-dist
docker compose up -d
```

恢复后结果：

- 服务器2容器恢复正常
- 网关实例查询恢复为双实例可切换状态

## 结论

阶段A改造已通过“关闭服务器2，服务器1继续工作”的验收验证。
