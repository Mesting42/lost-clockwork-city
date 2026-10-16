$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
Set-Location -LiteralPath $gameRoot
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 22.12 或更新的 LTS 版本，然后重新运行。' }
  $nodeVersion = (& node --version).TrimStart('v').Split('.')
  if ([int]$nodeVersion[0] -lt 22 -or ([int]$nodeVersion[0] -eq 22 -and [int]$nodeVersion[1] -lt 12)) { throw '本项目需要 Node.js 22.12 或更新版本。' }
  if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'node_modules\vite\package.json'))) {
    Write-Host '首次启动：正在安装本地开发依赖…'
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'dist\index.html'))) {
    Write-Host '正在构建游戏…'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw '生产构建失败，请查看上方错误。' }
  }
  $runtimePath = Join-Path $gameRoot '.runtime.json'
  $ready = $false
  $port = 5180
  if (Test-Path -LiteralPath $runtimePath) {
    try {
      $runtime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
      $port = [int]$runtime.port
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/__lostcity" -TimeoutSec 2
      $health = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json
      $ready = $health.game -eq 'lost-clockwork-city' -and $health.root -eq $gameRoot
    } catch { $ready = $false }
  }
  if (-not $ready) {
    Write-Host '正在后台启动游戏服务，自动避开占用端口…'
    Start-Process -FilePath (Get-Command node).Source -ArgumentList '"tools/serve.mjs"' -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot '.server.log') -RedirectStandardError (Join-Path $gameRoot '.server-error.log')
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
      Start-Sleep -Milliseconds 200
      if (Test-Path -LiteralPath $runtimePath) {
        try {
          $runtime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
          $port = [int]$runtime.port
          $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/__lostcity" -TimeoutSec 1
          $health = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json
          if ($health.game -eq 'lost-clockwork-city' -and $health.root -eq $gameRoot) { $ready = $true; break }
        } catch {}
      }
    }
  }
  if (-not $ready) { throw '服务未能完成 HTTP 检查，请查看 .server-error.log。' }
  Write-Host ''
  Write-Host "电脑入口：http://localhost:$port" -ForegroundColor Green
  $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' }
  foreach ($address in $addresses) { Write-Host "手机 / 平板同网入口：http://$($address.IPAddress):$port" -ForegroundColor Cyan }
  Write-Host '手机与电脑连接同一个局域网即可访问。程序不会修改防火墙或关闭其他项目。'
  Write-Host '再次运行启动器会复用本游戏已启动的服务。'
  Start-Process "http://localhost:$port"
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
