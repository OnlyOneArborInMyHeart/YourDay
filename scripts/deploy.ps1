[CmdletBinding()]
param(
    [string]$SshHost = "YourDay",
    [string]$PublicUrl = "http://8.149.238.25",
    [switch]$SkipFrontendInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TempDir = Join-Path $ProjectRoot "tmp"
$ArchiveName = "yourday-update-$Timestamp.tar.gz"
$ArchivePath = Join-Path $TempDir $ArchiveName
$RemoteScript = Join-Path $PSScriptRoot "deploy-remote.sh"

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)] [scriptblock]$Command,
        [Parameter(Mandatory = $true)] [string]$Description
    )
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed (exit code $LASTEXITCODE)"
    }
}

foreach ($command in @("npm", "tar", "ssh", "scp")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $command"
    }
}
if (-not (Test-Path -LiteralPath $RemoteScript)) {
    throw "Remote deployment script not found: $RemoteScript"
}

New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    Write-Host "[1/6] Building frontend..." -ForegroundColor Cyan
    Push-Location (Join-Path $ProjectRoot "frontend")
    try {
        if (-not $SkipFrontendInstall) {
            Invoke-Native { npm ci --no-audit --no-fund } "npm ci"
        }
        Invoke-Native { npm run build } "frontend build"
    }
    finally { Pop-Location }

    Write-Host "[2/6] Creating deployment package..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
        Invoke-Native {
            tar -czf $ArchivePath `
                frontend/dist `
                backend/src `
                backend/scripts `
                backend/package.json `
                backend/package-lock.json `
                backend/ecosystem.config.cjs
        } "creating deployment archive"
    }
    finally { Pop-Location }

    Write-Host "[3/6] Uploading package to $SshHost..." -ForegroundColor Cyan
    Invoke-Native { scp $ArchivePath $RemoteScript "${SshHost}:/tmp/" } "upload"

    Write-Host "[4/6] Backing up and updating server..." -ForegroundColor Cyan
    Invoke-Native {
        ssh $SshHost "sudo bash /tmp/deploy-remote.sh /tmp/$ArchiveName"
    } "remote deployment"

    Write-Host "[5/6] Verifying public health endpoint..." -ForegroundColor Cyan
    $HealthUrl = "$($PublicUrl.TrimEnd('/'))/api/health"
    $Health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 20
    if ($Health.ok -ne $true) {
        throw "Public health check returned an unexpected response: $HealthUrl"
    }

    Write-Host "[6/6] Deployment completed: $PublicUrl" -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $ArchivePath) {
        Remove-Item -LiteralPath $ArchivePath -Force
    }
}
