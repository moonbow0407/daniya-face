# 本地构建后上传到 Cloudflare Pages（模型在 .gitignore 里，所以不走 Git 自动构建）
# 用法：
#   .\deploy.ps1          部署预览版（得到一个临时链接，不影响正式站）
#   .\deploy.ps1 -Prod    部署正式版（更新 daniya-face.pages.dev）
# 第一次运行会打开浏览器让你登录 Cloudflare，并创建项目。
param(
    [switch]$Prod,
    [string]$Project = 'daniya-face'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'public/models')) {
    throw 'public/models 不存在，模型缺失会导致线上页面加载失败'
}

npm run build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }

# Cloudflare Pages 免费版限制：单文件 25MiB，单次部署 20000 个文件
$files = Get-ChildItem dist -Recurse -File
$tooBig = $files | Where-Object { $_.Length -gt 25MB }
if ($tooBig) {
    $tooBig | ForEach-Object { Write-Host ("超过 25MiB: {0} ({1:N1} MB)" -f $_.FullName, ($_.Length / 1MB)) }
    throw '有文件超过 Cloudflare Pages 的单文件上限'
}
if ($files.Count -gt 20000) { throw "文件数 $($files.Count) 超过 20000 上限" }
Write-Host ("dist: {0} 个文件, {1:N1} MB" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB))

# 分支名为 main 时部署到正式环境，其他分支名部署为预览
$branch = if ($Prod) { 'main' } else { 'preview' }

npx wrangler pages deploy dist --project-name $Project --branch $branch --commit-dirty=true
if ($LASTEXITCODE -ne 0) { throw '上传失败' }
